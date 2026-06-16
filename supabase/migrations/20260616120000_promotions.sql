-- ============================================================
-- Migrația 31 (Sprint 4.8 — Promotions & Commercial Rules)
--
--   Strat comercial de promoții, separat de motorul de preț (rate_rules /
--   compute_price) și de restricții (reservation/stay). O promoție = o reducere
--   (procent sau sumă) cu condiții (promotion_rules, AND) + ferestre de valabilitate
--   + limită de utilizări. Poate fi:
--     · cu COD (ex. SUMMER10) — aplicată doar dacă oaspetele introduce codul;
--     · AUTOMATĂ (code NULL) — aplicată singură dacă se potrivește (early booking,
--       last minute, long stay, stay discount).
--
--   Condiții (promotion_rules.rule_type), combinate AND:
--     · min_nights         → stay discount / long stay (ex. 7+ nopți, 30+ nopți)
--     · min_advance_days   → early booking (sosire la ≥ N zile de la rezervare)
--     · max_advance_hours  → last minute (sosire în ≤ N ore)
--   Tabel generic → tipuri noi de condiții se adaugă fără schimbare de schemă.
--
--   Reguli de business (ca în PMS-urile mari):
--     · o singură promoție per rezervare (cea mai mare reducere); codul are
--       prioritate peste cele automate (oaspetele a ales explicit un cod);
--     · snapshot imuabil pe rezervare (promotion_id + discount_amount);
--     · limita de utilizări (max_uses) verificată atomic la creare (anti-oversell);
--     · sursă unică de rezolvare (app.resolve_promotion) → admin + public identic.
--
--   Notă roluri (feature viitor): CUD pe promoții = owner/manager (is_org_role),
--   în linie cu celelalte entități comerciale — nu blochează un sistem de roluri.
-- ============================================================

-- ============ 1. promotions ============

create table promotions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,
  unit_type_id  uuid references unit_types(id) on delete cascade,  -- NULL = toate tipurile
  code          text,                                              -- NULL = promoție automată
  name          text not null,
  discount_type text not null check (discount_type in ('percent','amount')),
  discount_value numeric not null check (discount_value > 0),
  stay_start    date,    -- fereastra pe data de CHECK-IN (NULL = oricând)
  stay_end      date,
  book_start    date,    -- fereastra pe data REZERVĂRII (NULL = oricând)
  book_end      date,
  max_uses      int check (max_uses > 0),  -- NULL = nelimitat
  uses_count    int not null default 0 check (uses_count >= 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (discount_type <> 'percent' or discount_value <= 100),
  check (stay_end is null or stay_start is null or stay_end >= stay_start),
  check (book_end is null or book_start is null or book_end >= book_start)
);
-- cod unic per proprietate, case-insensitive, doar pentru promoțiile cu cod
create unique index promotions_code_uniq
  on promotions (property_id, upper(code)) where code is not null;
create index promotions_lookup_idx on promotions (property_id, is_active);

alter table promotions enable row level security;
revoke all on promotions from anon;
create policy promotions_select on promotions for select to authenticated
  using (app.can_access_property(property_id));
create policy promotions_cud on promotions for all to authenticated
  using (app.is_org_role(org_id, array['owner','manager']))
  with check (app.is_org_role(org_id, array['owner','manager']));

create trigger promotions_set_updated_at
  before update on promotions
  for each row execute function app.set_updated_at();

-- ============ 2. promotion_rules (condiții AND) ============

create table promotion_rules (
  id           uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references promotions(id) on delete cascade,
  rule_type    text not null check (rule_type in
                 ('min_nights','min_advance_days','max_advance_hours')),
  value        numeric not null check (value >= 0),
  created_at   timestamptz not null default now()
);
create index promotion_rules_promo_idx on promotion_rules (promotion_id);

alter table promotion_rules enable row level security;
revoke all on promotion_rules from anon;
-- autorizare prin promoția-părinte (acces proprietate la citire, owner/manager la scriere)
create policy promotion_rules_select on promotion_rules for select to authenticated
  using (exists (select 1 from promotions p
                 where p.id = promotion_id and app.can_access_property(p.property_id)));
create policy promotion_rules_cud on promotion_rules for all to authenticated
  using (exists (select 1 from promotions p
                 where p.id = promotion_id and app.is_org_role(p.org_id, array['owner','manager'])))
  with check (exists (select 1 from promotions p
                 where p.id = promotion_id and app.is_org_role(p.org_id, array['owner','manager'])));

-- ============ 3. Snapshot promoție pe bookings ============

alter table bookings
  add column promotion_id    uuid references promotions(id),
  add column discount_amount numeric not null default 0 check (discount_amount >= 0);

-- ============ 4. app.resolve_promotion (sursă unică) ============
-- Întoarce cea mai bună promoție aplicabilă (sau {applied:false}). NU ridică excepții
-- (poate fi folosită și pentru preview); NU incrementează usage (se face la creare).

create function app.resolve_promotion(
  p_unit_type_id uuid,
  p_check_in     date,
  p_check_out    date,
  p_subtotal     numeric,
  p_code         text,
  p_now          timestamptz
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_property uuid;
  v_nights   int;
  v_adv_days int;
  v_adv_hours numeric;
  v_code     text := nullif(upper(trim(p_code)), '');
  r          record;
  v_disc     numeric;
  v_best_disc numeric := 0;
  v_found    boolean := false;
  v_best     record;
begin
  select property_id into v_property from public.unit_types where id = p_unit_type_id;
  if v_property is null then return jsonb_build_object('applied', false); end if;

  v_nights    := p_check_out - p_check_in;
  v_adv_days  := p_check_in - (p_now)::date;
  v_adv_hours := extract(epoch from (p_check_in::timestamp - p_now)) / 3600.0;

  for r in
    select pr.* from public.promotions pr
    where pr.property_id = v_property
      and pr.is_active
      and (pr.unit_type_id is null or pr.unit_type_id = p_unit_type_id)
      -- cod cerut → doar acel cod; fără cod → doar promoțiile automate
      and (case when v_code is null then pr.code is null else upper(pr.code) = v_code end)
      and (pr.stay_start is null or p_check_in >= pr.stay_start)
      and (pr.stay_end   is null or p_check_in <= pr.stay_end)
      and (pr.book_start is null or (p_now)::date >= pr.book_start)
      and (pr.book_end   is null or (p_now)::date <= pr.book_end)
      and (pr.max_uses is null or pr.uses_count < pr.max_uses)
      -- toate condițiile (AND): o regulă „picată" exclude promoția
      and not exists (
        select 1 from public.promotion_rules rl
        where rl.promotion_id = pr.id
          and not (
            (rl.rule_type = 'min_nights'        and v_nights    >= rl.value) or
            (rl.rule_type = 'min_advance_days'  and v_adv_days   >= rl.value) or
            (rl.rule_type = 'max_advance_hours' and v_adv_hours  <= rl.value and v_adv_hours >= 0)
          )
      )
  loop
    if r.discount_type = 'percent' then
      v_disc := round(p_subtotal * r.discount_value / 100.0, 2);
    else
      v_disc := r.discount_value;
    end if;
    v_disc := least(greatest(v_disc, 0), p_subtotal);  -- niciodată negativ / peste subtotal
    if v_disc > v_best_disc or not v_found then
      v_best_disc := v_disc; v_best := r; v_found := true;
    end if;
  end loop;

  if not v_found then
    return jsonb_build_object('applied', false,
      'reason', case when v_code is not null then 'INVALID' else null end);
  end if;

  return jsonb_build_object(
    'applied',         true,
    'promotion_id',    v_best.id,
    'code',            v_best.code,
    'name',            v_best.name,
    'discount_type',   v_best.discount_type,
    'discount_value',  v_best.discount_value,
    'discount_amount', v_best_disc
  );
end $$;

revoke execute on function app.resolve_promotion(uuid,date,date,numeric,text,timestamptz)
  from public, anon, authenticated;

-- ============ 5. quote_price — extins cu cod promo (preview admin) ============
-- Întoarce quote-ul + subtotal/total (după reducere) + obiectul promotion.

drop function public.quote_price(uuid, date, date);

create function public.quote_price(
  p_unit_type_id uuid,
  p_check_in     date,
  p_check_out    date,
  p_promo_code   text default null
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_property_id uuid;
  v_quote  jsonb;
  v_promo  jsonb;
  v_subtotal numeric;
  v_disc   numeric;
begin
  select property_id into v_property_id from public.unit_types where id = p_unit_type_id;
  if v_property_id is null then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;
  if not app.can_access_property(v_property_id) then raise exception 'FORBIDDEN'; end if;

  v_quote    := app.compute_price(p_unit_type_id, p_check_in, p_check_out);
  v_subtotal := (v_quote->>'total')::numeric;
  v_promo    := app.resolve_promotion(p_unit_type_id, p_check_in, p_check_out, v_subtotal, p_promo_code, now());
  v_disc     := coalesce((v_promo->>'discount_amount')::numeric, 0);

  return v_quote || jsonb_build_object(
    'subtotal',  v_subtotal,
    'discount',  v_disc,
    'total',     v_subtotal - v_disc,
    'promotion', v_promo
  );
end $$;

revoke execute on function public.quote_price(uuid,date,date,text) from anon, public;
grant execute on function public.quote_price(uuid,date,date,text) to authenticated;

-- ============ 6. public_preview_promo — preview reducere pe pagina publică ============

create function public.public_preview_promo(
  p_slug         text,
  p_unit_type_id uuid,
  p_check_in     date,
  p_check_out    date,
  p_code         text default null
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_prop record;
  v_type record;
  v_quote jsonb;
  v_promo jsonb;
  v_subtotal numeric;
  v_disc numeric;
begin
  select * into v_prop from public.properties where slug = p_slug and is_published;
  if not found then raise exception 'PROPERTY_NOT_FOUND'; end if;
  select * into v_type from public.unit_types
   where id = p_unit_type_id and property_id = v_prop.id and is_active;
  if not found then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;
  if p_check_out <= p_check_in then raise exception 'INVALID_DATES'; end if;

  v_quote    := app.compute_price(p_unit_type_id, p_check_in, p_check_out);
  v_subtotal := (v_quote->>'total')::numeric;
  v_promo    := app.resolve_promotion(p_unit_type_id, p_check_in, p_check_out, v_subtotal, p_code, now());
  v_disc     := coalesce((v_promo->>'discount_amount')::numeric, 0);

  return jsonb_build_object(
    'currency',  v_quote->>'currency',
    'subtotal',  v_subtotal,
    'discount',  v_disc,
    'total',     v_subtotal - v_disc,
    'promotion', v_promo
  );
end $$;

revoke execute on function public.public_preview_promo from public;
grant execute on function public.public_preview_promo to anon, authenticated;

-- ============ 7. create_booking_internal — promoție în snapshot + usage atomic ============
-- Semnătura din 4.7 (17 param) + p_promo_code. Drop necesar (param nou = overload).

drop function app.create_booking_internal(uuid,uuid,uuid,date,date,int,int,text,text,numeric,jsonb,numeric,text,text,text,text,boolean);

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
  p_total        numeric,   -- subtotal (preț din motor, ÎNAINTE de reducere)
  p_breakdown    jsonb,
  p_unit_price   numeric,
  p_notes        text,
  p_snap_name    text default null,
  p_snap_email   text default null,
  p_snap_phone   text default null,
  p_override     boolean default false,
  p_promo_code   text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_type    record;
  v_unit    record;
  v_guest   record;
  v_stay    record;
  v_nights  int;
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

  if p_adults < 1 or p_adults > v_type.max_adults
     or p_children > v_type.max_children then
    raise exception 'OCCUPANCY_EXCEEDED';
  end if;

  -- ── strat SOFT (politici) — bypass-at de Manager Override ──
  if not p_override then
    if app.is_closed(v_type.property_id, p_unit_type_id, p_check_in, p_check_out) then
      raise exception 'DATES_CLOSED';
    end if;
    v_nights := p_check_out - p_check_in;
    select * into v_stay from app.resolve_stay(p_unit_type_id, p_check_in);
    if v_nights < v_stay.min_stay then raise exception 'STAY_TOO_SHORT'; end if;
    if v_nights > v_stay.max_stay then raise exception 'STAY_TOO_LONG'; end if;
    if 'NO_ARRIVAL'   = any(app.check_arrival_departure(v_type.property_id, p_unit_type_id, p_check_in, p_check_out)) then
      raise exception 'NO_ARRIVAL';
    end if;
    if 'NO_DEPARTURE' = any(app.check_arrival_departure(v_type.property_id, p_unit_type_id, p_check_in, p_check_out)) then
      raise exception 'NO_DEPARTURE';
    end if;
  end if;

  -- ── promoție: rezolvă cea mai bună (cod sau automată) și calculează totalul final ──
  v_promo := app.resolve_promotion(p_unit_type_id, p_check_in, p_check_out, p_total, p_promo_code, now());
  if nullif(trim(coalesce(p_promo_code, '')), '') is not null
     and not (v_promo->>'applied')::boolean then
    raise exception 'PROMO_INVALID';  -- cod introdus dar inaplicabil (greșit/neeligibil)
  end if;
  if (v_promo->>'applied')::boolean then
    v_promo_id := (v_promo->>'promotion_id')::uuid;
    v_discount := coalesce((v_promo->>'discount_amount')::numeric, 0);
  else
    v_promo_id := null;
    v_discount := 0;
  end if;
  v_final_total := p_total - v_discount;
  v_breakdown := coalesce(p_breakdown, '{}'::jsonb);
  if v_promo_id is not null then
    v_breakdown := v_breakdown || jsonb_build_object('promotion', v_promo);
  end if;

  -- gap de curățenie (FIZIC)
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
      and not exists (
        select 1 from public.bookings b
        where b.unit_id = u.id
          and b.status not in ('cancelled','no_show')
          and b.stay && daterange(p_check_in - v_gap, p_check_out + v_gap, '[)')
      )
      and not exists (
        select 1 from public.room_blocks rb
        where rb.unit_id = u.id
          and rb.period && daterange(p_check_in, p_check_out, '[)')
      )
    order by u.name
  loop
    begin
      insert into public.bookings
        (org_id, property_id, unit_type_id, unit_id, guest_id, status,
         check_in, check_out, adults, children, total_amount, unit_price,
         price_breakdown, currency, source, notes,
         promotion_id, discount_amount,
         booked_full_name, booked_email, booked_phone)
      values
        (v_type.org_id, v_type.property_id, p_unit_type_id, v_unit.id, p_guest_id,
         p_status, p_check_in, p_check_out, p_adults, p_children, v_final_total, p_unit_price,
         v_breakdown, v_type.prop_currency, p_source, p_notes,
         v_promo_id, v_discount,
         coalesce(nullif(trim(p_snap_name), ''), v_guest.full_name),
         coalesce(nullif(lower(trim(p_snap_email)), ''), v_guest.email),
         coalesce(nullif(trim(p_snap_phone), ''), v_guest.phone))
      returning id into v_booking_id;

      -- consumă o utilizare a promoției, atomic (anti-oversell sub concurență)
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
        continue; -- altă rezervare a câștigat cursa pe camera asta
      when others then
        if sqlerrm like '%UNIT_BLOCKED%' then
          continue; -- un block a apărut între timp
        end if;
        raise;
    end;
  end loop;

  raise exception 'UNIT_NOT_AVAILABLE';
end $$;

revoke execute on function app.create_booking_internal(uuid,uuid,uuid,date,date,int,int,text,text,numeric,jsonb,numeric,text,text,text,text,boolean,text)
  from public, anon, authenticated;

-- ============ 8. create_booking (admin) — p_promo_code ============

drop function public.create_booking(uuid,date,date,uuid,uuid,int,int,text,text,boolean);

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
  if not app.can_access_property(v_type.property_id) then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('pending','confirmed','blocked') then raise exception 'INVALID_STATUS'; end if;
  if p_status <> 'blocked' and p_guest_id is null then raise exception 'GUEST_REQUIRED'; end if;
  if p_guest_id is not null and not exists (
    select 1 from public.guests g where g.id = p_guest_id and g.org_id = v_type.org_id
  ) then
    raise exception 'GUEST_NOT_FOUND';
  end if;
  if p_override and not app.is_org_role(v_type.org_id, array['owner','manager']) then
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

-- ============ 9. public_create_booking — p_promo_code ============

drop function public.public_create_booking(text,uuid,date,date,text,text,text,int,int,text);

create function public.public_create_booking(
  p_slug         text,
  p_unit_type_id uuid,
  p_check_in     date,
  p_check_out    date,
  p_full_name    text,
  p_email        text,
  p_phone        text default null,
  p_adults       int default 1,
  p_children     int default 0,
  p_notes        text default null,
  p_promo_code   text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_prop  record;
  v_type  record;
  v_quote jsonb;
  v_guest_id uuid;
  v_booking_id uuid;
begin
  select * into v_prop from public.properties where slug = p_slug and is_published;
  if not found then raise exception 'PROPERTY_NOT_FOUND'; end if;

  select * into v_type from public.unit_types
   where id = p_unit_type_id and property_id = v_prop.id and is_active;
  if not found then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;

  if p_check_in < current_date then raise exception 'INVALID_DATES'; end if;
  if p_check_out - p_check_in > 365 then raise exception 'INVALID_DATES'; end if;
  if coalesce(trim(p_full_name), '') = '' or coalesce(trim(p_email), '') = '' then
    raise exception 'GUEST_DETAILS_REQUIRED';
  end if;

  v_quote := app.compute_price(p_unit_type_id, p_check_in, p_check_out);

  v_guest_id := (app.find_or_create_guest_internal(
                   v_prop.org_id, p_full_name, p_email, p_phone, false)->>'guest_id')::uuid;

  v_booking_id := app.create_booking_internal(
    p_unit_type_id, null, v_guest_id, p_check_in, p_check_out,
    p_adults, p_children, 'pending', 'public',
    (v_quote->>'total')::numeric, v_quote, (v_quote->>'avg_nightly')::numeric,
    p_notes, p_full_name, p_email, p_phone, false, p_promo_code);

  return jsonb_build_object('booking_id', v_booking_id, 'status', 'pending');
end $$;

grant execute on function public.public_create_booking to anon, authenticated;
