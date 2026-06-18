-- ============================================================
-- Sprint 6.2 — RBAC Enforcement
--
-- Mută autorizarea de scriere de pe enum-ul owner/manager (app.is_org_role)
-- pe permisiuni granulare (app.has_permission), pe domeniile OPERAȚIONALE:
-- bookings, guests, pricing, properties, units, payments, promotions, reguli.
--
-- Domeniile ADMIN (organizations, organization_members, member_property_access)
-- rămân pe is_org_role — UI-ul de management membri + logica anti-escaladare
-- vin în 6.3. Enum-ul rămâne bridge (trigger sync), deci is_org_role continuă
-- să funcționeze acolo unde nu-l atingem.
--
-- SELECT (view) rămâne la nivel de izolare de tenant (can_access_property /
-- apartenență org); permisiunile de tip *.view sunt aplicate în UI (ascundere
-- nav/acțiuni). Gating-ul pe SELECT ar risca ruperea citirilor compuse
-- (ex. booking cu join pe guest) — se poate adăuga ulterior, țintit.
--
-- Non-lockout: owner structural (owner_user_id) + rolul Administrator (toate
-- permisiunile) → toți userii actuali (owneri) trec orice has_permission.
-- ============================================================

-- ============ 1. permisiune nouă: booking.override (Manager Override) ============
insert into permissions (key, domain, description, sort_order) values
  ('booking.override', 'booking', 'Manager Override pe reguli soft', 15);

-- acordată rolurilor de sistem care înlocuiesc owner/manager în gărzile de override
insert into role_permissions (role_id, permission_key)
  select r.id, 'booking.override' from roles r
  where r.org_id is null and r.slug in ('administrator', 'manager');

-- ============ 2. RLS — remaparea politicilor de SCRIERE pe permisiuni ============

-- properties: create la nivel de org (proprietatea nu există încă), edit/delete pe proprietate
drop policy if exists properties_insert on properties;
drop policy if exists properties_update on properties;
drop policy if exists properties_delete on properties;
create policy properties_insert on properties for insert to authenticated
  with check (app.has_permission(org_id, null, 'property.create'));
create policy properties_update on properties for update to authenticated
  using (app.has_permission(org_id, id, 'property.edit'))
  with check (app.has_permission(org_id, id, 'property.edit'));
create policy properties_delete on properties for delete to authenticated
  using (app.has_permission(org_id, id, 'property.delete'));

-- unit_types
drop policy if exists unit_types_cud on unit_types;
create policy unit_types_cud on unit_types for all to authenticated
  using (app.has_permission(org_id, property_id, 'unit_type.manage'))
  with check (app.has_permission(org_id, property_id, 'unit_type.manage'));

-- units (acoperă și RPC-urile INVOKER generate_units / bulk_* / set status)
drop policy if exists units_cud on units;
create policy units_cud on units for all to authenticated
  using (app.has_permission(org_id, property_id, 'unit.manage'))
  with check (app.has_permission(org_id, property_id, 'unit.manage'));

-- room_blocks (blocare fizică = gestionare cameră)
drop policy if exists room_blocks_cud on room_blocks;
create policy room_blocks_cud on room_blocks for all to authenticated
  using (app.has_permission(org_id, property_id, 'unit.manage'))
  with check (app.has_permission(org_id, property_id, 'unit.manage'));

-- guests: SELECT = membru org; scrierea pe guest.create/edit/delete
-- (cre, fără property_id → scope null). find_or_create_guest e DEFINER și
-- ocolește RLS, deci crearea inline din formularul de rezervare rămâne ok.
drop policy if exists guests_all on guests;
create policy guests_select on guests for select to authenticated
  using (org_id in (select app.user_org_ids()));
create policy guests_insert on guests for insert to authenticated
  with check (app.has_permission(org_id, null, 'guest.create'));
create policy guests_update on guests for update to authenticated
  using (app.has_permission(org_id, null, 'guest.edit'))
  with check (app.has_permission(org_id, null, 'guest.edit'));
create policy guests_delete on guests for delete to authenticated
  using (app.has_permission(org_id, null, 'guest.delete'));

-- bookings: update (inclusiv schimbarea de status, direct) → booking.edit;
-- delete → booking.cancel. Inserarea/mutarea trec prin RPC-uri (definer).
drop policy if exists bookings_update on bookings;
create policy bookings_update on bookings for update to authenticated
  using (app.has_permission(org_id, property_id, 'booking.edit'))
  with check (app.has_permission(org_id, property_id, 'booking.edit'));
drop policy if exists bookings_delete on bookings;
create policy bookings_delete on bookings for delete to authenticated
  using (app.has_permission(org_id, property_id, 'booking.cancel'));

-- payments: ștergerea (corecție) = capabilitate de rambursare
drop policy if exists payments_delete on payments;
create policy payments_delete on payments for delete to authenticated
  using (app.has_permission(org_id, property_id, 'payment.refund'));

-- rate_rules → pricing.edit
drop policy if exists rate_rules_cud on rate_rules;
create policy rate_rules_cud on rate_rules for all to authenticated
  using (app.has_permission(org_id, property_id, 'pricing.edit'))
  with check (app.has_permission(org_id, property_id, 'pricing.edit'));

-- reguli de rezervare → rules.manage
drop policy if exists stay_rules_cud on stay_rules;
create policy stay_rules_cud on stay_rules for all to authenticated
  using (app.has_permission(org_id, property_id, 'rules.manage'))
  with check (app.has_permission(org_id, property_id, 'rules.manage'));
drop policy if exists closures_cud on closures;
create policy closures_cud on closures for all to authenticated
  using (app.has_permission(org_id, property_id, 'rules.manage'))
  with check (app.has_permission(org_id, property_id, 'rules.manage'));
drop policy if exists arrival_rules_cud on arrival_rules;
create policy arrival_rules_cud on arrival_rules for all to authenticated
  using (app.has_permission(org_id, property_id, 'rules.manage'))
  with check (app.has_permission(org_id, property_id, 'rules.manage'));

-- promoții → promotion.manage (promotion_rules prin promoția-părinte)
drop policy if exists promotions_cud on promotions;
create policy promotions_cud on promotions for all to authenticated
  using (app.has_permission(org_id, property_id, 'promotion.manage'))
  with check (app.has_permission(org_id, property_id, 'promotion.manage'));
drop policy if exists promotion_rules_cud on promotion_rules;
create policy promotion_rules_cud on promotion_rules for all to authenticated
  using (exists (select 1 from promotions p
                 where p.id = promotion_id
                   and app.has_permission(p.org_id, p.property_id, 'promotion.manage')))
  with check (exists (select 1 from promotions p
                 where p.id = promotion_id
                   and app.has_permission(p.org_id, p.property_id, 'promotion.manage')));

-- ============ 3. gărzi în RPC-urile DEFINER ============
-- has_permission(org, property, key) acoperă și accesul pe proprietate
-- (înlocuiește can_access_property). Override-ul folosește booking.override.

-- create_booking → booking.create
create or replace function public.create_booking(
  p_unit_type_id uuid,
  p_check_in     date,
  p_check_out    date,
  p_guest_id     uuid default null,
  p_unit_id      uuid default null,
  p_adults       int default 1,
  p_children     int default 0,
  p_status       text default 'confirmed',
  p_notes        text default null,
  p_override     boolean default false,
  p_promo_code   text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_type  record;
  v_quote jsonb;
begin
  select * into v_type from public.unit_types where id = p_unit_type_id;
  if not found then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;
  if not app.has_permission(v_type.org_id, v_type.property_id, 'booking.create') then
    raise exception 'FORBIDDEN';
  end if;
  if p_status not in ('pending','confirmed','blocked') then raise exception 'INVALID_STATUS'; end if;
  if p_status <> 'blocked' and p_guest_id is null then raise exception 'GUEST_REQUIRED'; end if;
  if p_guest_id is not null and not exists (
    select 1 from public.guests g where g.id = p_guest_id and g.org_id = v_type.org_id
  ) then
    raise exception 'GUEST_NOT_FOUND';
  end if;
  if p_override and not app.has_permission(v_type.org_id, null, 'booking.override') then
    raise exception 'OVERRIDE_FORBIDDEN';
  end if;

  v_quote := app.compute_price(p_unit_type_id, p_check_in, p_check_out);

  return app.create_booking_internal(
    p_unit_type_id, p_unit_id, p_guest_id, p_check_in, p_check_out,
    p_adults, p_children, p_status,
    case when p_status = 'blocked' then 'blocked' else 'admin' end,
    (v_quote->>'total')::numeric, v_quote, (v_quote->>'avg_nightly')::numeric,
    p_notes, null, null, null, p_override,
    case when p_status = 'blocked' then null else p_promo_code end);
end $$;
revoke execute on function public.create_booking(uuid,date,date,uuid,uuid,int,int,text,text,boolean,text) from anon, public;
grant execute on function public.create_booking(uuid,date,date,uuid,uuid,int,int,text,text,boolean,text) to authenticated;

-- update_booking_dates → booking.edit
create or replace function public.update_booking_dates(
  p_booking_id uuid,
  p_check_in   date,
  p_check_out  date,
  p_override   boolean default false
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_booking record;
  v_val     jsonb;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if not app.has_permission(v_booking.org_id, v_booking.property_id, 'booking.edit') then
    raise exception 'FORBIDDEN';
  end if;
  if v_booking.status in ('cancelled', 'checked_out', 'no_show') then
    raise exception 'BOOKING_NOT_EDITABLE';
  end if;
  if p_check_out <= p_check_in then raise exception 'INVALID_DATE_RANGE'; end if;
  if p_override and not app.has_permission(v_booking.org_id, null, 'booking.override') then
    raise exception 'OVERRIDE_FORBIDDEN';
  end if;

  if p_check_in <> v_booking.check_in or p_check_out <> v_booking.check_out then
    v_val := app.validate_booking(v_booking.unit_type_id, v_booking.unit_id, p_check_in, p_check_out,
                                  v_booking.adults, v_booking.children, null, p_override, now(), p_booking_id);
    if not (v_val->>'valid')::boolean then
      raise exception '%', (v_val->'errors'->>0);
    end if;
  end if;

  begin
    update public.bookings
    set check_in   = p_check_in,
        check_out  = p_check_out,
        updated_at = now()
    where id = p_booking_id;
  exception when exclusion_violation then
    raise exception 'UNIT_NOT_AVAILABLE';
  end;
end $$;
revoke execute on function public.update_booking_dates(uuid,date,date,boolean) from anon, public;
grant execute on function public.update_booking_dates(uuid,date,date,boolean) to authenticated;

-- reassign_booking → booking.move
create or replace function public.reassign_booking(
  p_booking_id uuid,
  p_unit_id    uuid
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_booking record;
  v_unit    record;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if not app.has_permission(v_booking.org_id, v_booking.property_id, 'booking.move') then
    raise exception 'FORBIDDEN';
  end if;
  if v_booking.status in ('cancelled','checked_out','no_show') then
    raise exception 'BOOKING_NOT_REASSIGNABLE';
  end if;

  select * into v_unit from public.units where id = p_unit_id;
  if not found then raise exception 'UNIT_NOT_FOUND'; end if;
  if v_unit.status <> 'active' then raise exception 'UNIT_NOT_ACTIVE'; end if;
  if v_unit.property_id <> v_booking.property_id then raise exception 'UNIT_WRONG_PROPERTY'; end if;

  begin
    update public.bookings
    set unit_id = p_unit_id,
        unit_type_id = v_unit.unit_type_id,
        updated_at = now()
    where id = p_booking_id;
  exception when exclusion_violation then
    raise exception 'UNIT_NOT_AVAILABLE';
  end;
end $$;
revoke execute on function public.reassign_booking from anon, public;
grant execute on function public.reassign_booking to authenticated;

-- link_booking_guest → booking.edit
create or replace function public.link_booking_guest(
  p_booking_id uuid,
  p_guest_id   uuid
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_booking record;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if not app.has_permission(v_booking.org_id, v_booking.property_id, 'booking.edit') then
    raise exception 'FORBIDDEN';
  end if;
  if v_booking.status = 'blocked' then raise exception 'BOOKING_NOT_LINKABLE'; end if;
  if not exists (
    select 1 from public.guests g where g.id = p_guest_id and g.org_id = v_booking.org_id
  ) then
    raise exception 'GUEST_NOT_FOUND';
  end if;
  update public.bookings set guest_id = p_guest_id where id = p_booking_id;
end $$;
revoke execute on function public.link_booking_guest(uuid,uuid) from public, anon;
grant execute on function public.link_booking_guest(uuid,uuid) to authenticated;

-- record_payment → payment.record (refund cere suplimentar payment.refund)
create or replace function public.record_payment(
  p_booking_id   uuid,
  p_amount       numeric,
  p_kind         text default 'payment',
  p_method       text default 'cash',
  p_paid_at      timestamptz default null,
  p_note         text default null,
  p_provider_ref text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_booking record;
  v_id uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if not app.has_permission(v_booking.org_id, v_booking.property_id, 'payment.record') then
    raise exception 'FORBIDDEN';
  end if;
  if v_booking.status = 'blocked' then raise exception 'BOOKING_NOT_PAYABLE'; end if;
  if p_kind not in ('payment','refund') then raise exception 'INVALID_KIND'; end if;
  if p_kind = 'refund'
     and not app.has_permission(v_booking.org_id, v_booking.property_id, 'payment.refund') then
    raise exception 'FORBIDDEN';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_method not in ('cash','card','bank_transfer','online','other') then
    raise exception 'INVALID_METHOD';
  end if;

  insert into public.payments
    (org_id, property_id, booking_id, kind, amount, currency, method,
     status, provider, provider_ref, note, recorded_by, recorded_by_email, paid_at)
  values
    (v_booking.org_id, v_booking.property_id, p_booking_id, p_kind, p_amount,
     v_booking.currency, p_method, 'completed', 'manual', p_provider_ref, p_note,
     auth.uid(), nullif(auth.jwt()->>'email', ''), coalesce(p_paid_at, now()))
  returning id into v_id;

  return v_id;
end $$;
revoke execute on function public.record_payment from anon, public;
grant execute on function public.record_payment to authenticated;

-- validate_booking (preview formular): override previzualizat doar cu booking.override
create or replace function public.validate_booking(
  p_unit_type_id uuid,
  p_check_in     date,
  p_check_out    date,
  p_adults       int     default 1,
  p_children     int     default 0,
  p_unit_id      uuid    default null,
  p_promo_code   text    default null,
  p_override     boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_type record;
begin
  select id, org_id, property_id into v_type from public.unit_types where id = p_unit_type_id;
  if not found then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;
  if not app.can_access_property(v_type.property_id) then raise exception 'FORBIDDEN'; end if;
  if p_override and not app.has_permission(v_type.org_id, null, 'booking.override') then
    p_override := false;
  end if;
  return app.validate_booking(p_unit_type_id, p_unit_id, p_check_in, p_check_out,
                              p_adults, p_children, p_promo_code, p_override, now());
end $$;
revoke execute on function public.validate_booking(uuid,date,date,int,int,uuid,text,boolean) from anon, public;
grant execute on function public.validate_booking(uuid,date,date,int,int,uuid,text,boolean) to authenticated;

-- ============ 4. RPC pentru frontend: get_my_permissions ============
-- Wrapper expus peste app.user_permissions (care e în schema app). Întoarce
-- setul de permisiuni efective ale userului în org; org în care nu e membru → gol.
create function public.get_my_permissions(p_org_id uuid) returns setof text
language sql stable security definer set search_path = ''
as $$
  select app.user_permissions(p_org_id);
$$;
revoke execute on function public.get_my_permissions(uuid) from anon, public;
grant execute on function public.get_my_permissions(uuid) to authenticated;
