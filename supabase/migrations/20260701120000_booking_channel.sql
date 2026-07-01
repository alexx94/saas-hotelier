-- Sprint 10: Booking Channel (canal de distribuție)
-- Canal = de unde a venit rezervarea (direct, Booking.com, Airbnb etc.)
-- Separat de `source` (origin tehnic: admin/public/blocked).
-- ENUM PostgreSQL: extindere viitoare cu ALTER TYPE ... ADD VALUE (non-distructiv).

-- ============ 1. Tip ENUM ============
create type public.booking_channel as enum ('direct', 'booking_com', 'airbnb');

-- ============ 2. Coloană pe bookings ============
alter table public.bookings
  add column channel public.booking_channel not null default 'direct';

-- ============ 3. app.create_booking_internal — adaugă p_channel ============
drop function app.create_booking_internal(uuid,uuid,uuid,date,date,int,int,text,text,numeric,jsonb,numeric,text,text,text,text,boolean,text,text,numeric,uuid,text);
create function app.create_booking_internal(
  p_unit_type_id uuid,
  p_unit_id      uuid,
  p_guest_id     uuid,
  p_check_in     date,
  p_check_out    date,
  p_adults       int,
  p_children     int,
  p_status       text,
  p_source       text,
  p_total        numeric,
  p_breakdown    jsonb,
  p_unit_price   numeric,
  p_notes        text,
  p_snap_name    text default null,
  p_snap_email   text default null,
  p_snap_phone   text default null,
  p_override     boolean default false,
  p_promo_code   text default null,
  p_ovr_kind     text default null,
  p_ovr_value    numeric default null,
  p_ovr_by       uuid default null,
  p_ovr_note     text default null,
  p_channel      public.booking_channel default 'direct'
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_type    record;
  v_unit    record;
  v_guest   record;
  v_val     jsonb;
  v_gap     int;
  v_promo   jsonb;
  v_promo_id uuid;
  v_discount numeric;
  v_final_total numeric;
  v_breakdown jsonb;
  v_chk     uuid;
  v_booking_id uuid;
begin
  select t.*, p.currency as prop_currency
    into v_type
    from public.unit_types t
    join public.properties p on p.id = t.property_id
   where t.id = p_unit_type_id;
  if not found then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;
  if p_check_out <= p_check_in then raise exception 'INVALID_DATES'; end if;

  v_val := app.validate_booking(p_unit_type_id, p_unit_id, p_check_in, p_check_out,
                                p_adults, p_children, p_promo_code, p_override, now());
  if not (v_val->>'valid')::boolean then
    raise exception '%', (v_val->'errors'->>0);
  end if;

  if p_ovr_kind is not null then
    v_promo_id := null;
    v_discount := 0;
  else
    v_promo := app.resolve_promotion(p_unit_type_id, p_check_in, p_check_out, p_total, p_promo_code, now());
    if coalesce((v_promo->>'applied')::boolean, false) then
      v_promo_id := (v_promo->>'promotion_id')::uuid;
      v_discount := coalesce((v_promo->>'discount_amount')::numeric, 0);
    else
      v_promo_id := null;
      v_discount := 0;
    end if;
  end if;
  v_final_total := p_total - v_discount;
  v_breakdown := coalesce(p_breakdown, '{}'::jsonb);
  if v_promo_id is not null then
    v_breakdown := v_breakdown || jsonb_build_object('promotion', v_promo);
  end if;

  v_gap := coalesce(v_type.turnover_days, 0);

  if p_guest_id is not null then
    select full_name, email, phone into v_guest
    from public.guests where id = p_guest_id;
  end if;

  for v_unit in
    select u.* from public.units u
    where u.unit_type_id = p_unit_type_id
      and u.status = 'active'
      and (p_unit_id is null or u.id = p_unit_id)
      and app.unit_is_free(u.id, p_check_in, p_check_out, v_gap)
    order by u.name
  loop
    begin
      insert into public.bookings
        (org_id, property_id, unit_type_id, unit_id, guest_id, status,
         check_in, check_out, adults, children, total_amount, unit_price,
         price_breakdown, currency, source, channel, notes,
         promotion_id, discount_amount,
         booked_full_name, booked_email, booked_phone,
         price_override_kind, price_override_value, price_override_by,
         price_override_at, price_override_note)
      values
        (v_type.org_id, v_type.property_id, p_unit_type_id, v_unit.id, p_guest_id,
         p_status, p_check_in, p_check_out, p_adults, p_children, v_final_total, p_unit_price,
         v_breakdown, v_type.prop_currency, p_source, p_channel, p_notes,
         v_promo_id, v_discount,
         coalesce(nullif(trim(p_snap_name), ''), v_guest.full_name),
         coalesce(nullif(lower(trim(p_snap_email)), ''), v_guest.email),
         coalesce(nullif(trim(p_snap_phone), ''), v_guest.phone),
         p_ovr_kind, p_ovr_value, p_ovr_by,
         case when p_ovr_kind is not null then now() else null end, p_ovr_note)
      returning id into v_booking_id;

      if v_promo_id is not null then
        update public.promotions
           set uses_count = uses_count + 1
         where id = v_promo_id and (max_uses is null or uses_count < max_uses)
        returning id into v_chk;
        if not found then raise exception 'PROMO_LIMIT_REACHED'; end if;
      end if;

      return v_booking_id;
    exception
      when exclusion_violation then
        continue;
      when others then
        if sqlerrm like '%UNIT_BLOCKED%' then
          continue;
        end if;
        raise;
    end;
  end loop;

  raise exception 'UNIT_NOT_AVAILABLE';
end $$;
revoke execute on function app.create_booking_internal(uuid,uuid,uuid,date,date,int,int,text,text,numeric,jsonb,numeric,text,text,text,text,boolean,text,text,numeric,uuid,text,public.booking_channel)
  from anon, authenticated, public;

-- ============ 4. public.create_booking — adaugă p_channel ============
drop function public.create_booking(uuid,date,date,uuid,uuid,int,int,text,text,boolean,text,text,numeric,jsonb,text);
create function public.create_booking(
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
  p_promo_code   text default null,
  p_price_override_kind   text default null,
  p_price_override_value  numeric default null,
  p_price_override_nights jsonb default null,
  p_price_override_note   text default null,
  p_channel      public.booking_channel default 'direct'
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_type  record;
  v_quote jsonb;
  v_has_override boolean;
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

  v_has_override := p_status <> 'blocked' and p_price_override_kind is not null;
  if v_has_override and not app.has_permission(v_type.org_id, v_type.property_id, 'booking.price_override') then
    raise exception 'PRICE_OVERRIDE_FORBIDDEN';
  end if;

  v_quote := app.compute_price(p_unit_type_id, p_check_in, p_check_out);
  if v_has_override then
    v_quote := app.apply_price_override(v_quote, p_price_override_kind, p_price_override_value, p_price_override_nights);
  end if;

  return app.create_booking_internal(
    p_unit_type_id, p_unit_id, p_guest_id, p_check_in, p_check_out,
    p_adults, p_children, p_status,
    case when p_status = 'blocked' then 'blocked' else 'admin' end,
    (v_quote->>'total')::numeric, v_quote, (v_quote->>'avg_nightly')::numeric,
    p_notes, null, null, null, p_override,
    case when p_status = 'blocked' or v_has_override then null else p_promo_code end,
    case when v_has_override then p_price_override_kind else null end,
    case when v_has_override then p_price_override_value else null end,
    case when v_has_override then auth.uid() else null end,
    case when v_has_override then p_price_override_note else null end,
    p_channel);
end $$;
revoke execute on function public.create_booking(uuid,date,date,uuid,uuid,int,int,text,text,boolean,text,text,numeric,jsonb,text,public.booking_channel) from anon, public;
grant execute on function public.create_booking(uuid,date,date,uuid,uuid,int,int,text,text,boolean,text,text,numeric,jsonb,text,public.booking_channel) to authenticated;
