-- ============================================================
-- Migrația 32 (Sprint 4.8 — listă publică „à la Booking.com")
--
--   public_get_availability NU mai filtrează tipurile neeligibile: întoarce TOATE
--   tipurile active, fiecare cu un `reason` (motivul pentru care nu poate fi rezervat,
--   NULL = rezervabil). Frontend-ul afișează toate camerele, dar dezactivează „Rezervă"
--   și arată motivul — exact ca pe platformele mari.
--
--   În plus, întoarce reducerea AUTOMATĂ (fără cod) pentru tipurile rezervabile, ca
--   prețul tăiat + prețul nou să apară direct în listă, înainte de „Rezervă". Totul
--   într-o SINGURĂ interogare (resolver per tip în lateral) — zero request-uri extra.
--
--   `reason` (prioritate = ordinea verificărilor din motorul de creare):
--     OCCUPANCY → CLOSED → STAY_TOO_SHORT → STAY_TOO_LONG → NO_ARRIVAL →
--     NO_DEPARTURE → UNAVAILABLE (sold out / blocat / gap) → NULL (rezervabil)
-- ============================================================

drop function public.public_get_availability(text,date,date,int,int);

create function public.public_get_availability(
  p_slug      text,
  p_check_in  date,
  p_check_out date,
  p_adults    int default 1,
  p_children  int default 0
) returns table (
  unit_type_id    uuid,
  name            text,
  description     jsonb,
  max_adults      int,
  max_children    int,
  min_stay        int,
  max_stay        int,
  price_per_night numeric,
  total_price     numeric,   -- subtotal „de raft" (înainte de reducere)
  discount        numeric,   -- reducere automată pe sejur (0 dacă nu se aplică / nerezervabil)
  promo_label     text,      -- cod sau nume al promoției automate (NULL dacă nu există)
  currency        char(3),
  available_units int,
  reason          text       -- motiv blocare (NULL = rezervabil)
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_prop   record;
  v_nights int;
begin
  select * into v_prop from public.properties where slug = p_slug and is_published;
  if not found then return; end if;
  if p_check_in < current_date or p_check_out <= p_check_in
     or p_check_out - p_check_in > 365 then
    return;
  end if;
  v_nights := p_check_out - p_check_in;

  return query
  select
    t.id, t.name, t.description, t.max_adults, t.max_children,
    rs.min_stay, rs.max_stay,
    (pr.q->>'avg_nightly')::numeric,
    (pr.q->>'total')::numeric,
    case when v_reason.r is null then coalesce((promo.j->>'discount_amount')::numeric, 0) else 0 end,
    case when v_reason.r is null and (promo.j->>'applied')::boolean
         then coalesce(promo.j->>'code', promo.j->>'name') end,
    v_prop.currency,
    avail.cnt,
    v_reason.r
  from public.unit_types t
  cross join lateral app.resolve_stay(t.id, p_check_in) rs
  cross join lateral (
    select count(u.id)::int as cnt
    from public.units u
    where u.unit_type_id = t.id
      and u.status = 'active'
      and not exists (
        select 1 from public.bookings b
        where b.unit_id = u.id
          and b.status not in ('cancelled','no_show')
          and b.stay && daterange(
                p_check_in  - coalesce(t.turnover_days, 0),
                p_check_out + coalesce(t.turnover_days, 0), '[)')
      )
      and not exists (
        select 1 from public.room_blocks rb
        where rb.unit_id = u.id
          and rb.period && daterange(p_check_in, p_check_out, '[)')
      )
  ) avail
  cross join lateral (
    select app.check_arrival_departure(v_prop.id, t.id, p_check_in, p_check_out) as codes
  ) ad
  -- primul motiv aplicabil, în ordinea verificărilor din motorul de creare
  cross join lateral (
    select case
      when p_adults > t.max_adults or p_children > t.max_children then 'OCCUPANCY'
      when app.is_closed(v_prop.id, t.id, p_check_in, p_check_out)  then 'CLOSED'
      when v_nights < rs.min_stay then 'STAY_TOO_SHORT'
      when v_nights > rs.max_stay then 'STAY_TOO_LONG'
      when 'NO_ARRIVAL'   = any(ad.codes) then 'NO_ARRIVAL'
      when 'NO_DEPARTURE' = any(ad.codes) then 'NO_DEPARTURE'
      when avail.cnt = 0 then 'UNAVAILABLE'
      else null
    end as r
  ) v_reason
  cross join lateral (select app.compute_price(t.id, p_check_in, p_check_out) as q) pr
  -- promoții automate (fără cod) — doar pentru tipurile rezervabile
  cross join lateral (
    select case when v_reason.r is null
                then app.resolve_promotion(t.id, p_check_in, p_check_out,
                                           (pr.q->>'total')::numeric, null, now())
                else '{}'::jsonb end as j
  ) promo
  where t.property_id = v_prop.id
    and t.is_active
  order by t.sort_order, t.name;
end $$;

grant execute on function public.public_get_availability to anon, authenticated;
