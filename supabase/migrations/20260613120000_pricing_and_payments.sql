-- ============================================================
-- Migrația 22 (Sprint 4 — Pricing & Revenue)
--   Fundație pentru plăți reale (Stripe & co.) + e-factură, fără a lega
--   schema de un procesator anume. Modelul:
--
--   1. Price snapshot pe rezervare: bookings.unit_price = prețul/noapte folosit
--      ATUNCI (base_price se poate schimba ulterior; rezervarea își amintește).
--   2. payments — REGISTRU (ledger) imuabil de tranzacții. Azi sunt manuale
--      (provider='manual'); mâine fiecare webhook Stripe devine un rând
--      (provider='stripe', provider_ref=payment_intent). Pentru e-factură,
--      provider_ref poate ține seria/numărul facturii. Nimic de re-arhitecturat.
--   3. bookings.payment_status + amount_paid = agregat CACHED, întreținut de
--      trigger din ledger (niciodată numărat pe client). Stări: unpaid /
--      partial / paid / refunded.
--   4. RPC record_payment — înregistrează o încasare/rambursare (autorizat).
--   5. RPC get_revenue_summary — venit azi / lună / an, server-side, în
--      timezone-ul proprietății (sumă tranzacții completate, refund = minus).
-- ============================================================

-- ============ 1. Price snapshot pe rezervare ============

alter table bookings
  add column unit_price numeric(12,2) not null default 0 check (unit_price >= 0);

-- backfill din total / nopți (cea mai bună aproximare); audit-ul e oprit —
-- nu e o acțiune de operator
alter table bookings disable trigger bookings_audit;
alter table bookings disable trigger bookings_set_updated_at;

update bookings
set unit_price = case
  when (check_out - check_in) > 0 then round(total_amount / (check_out - check_in), 2)
  else 0
end;

alter table bookings enable trigger bookings_audit;
alter table bookings enable trigger bookings_set_updated_at;

-- ============ 2. Stare plată (agregat cached) pe rezervare ============

alter table bookings
  add column payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','partial','paid','refunded')),
  add column amount_paid numeric(12,2) not null default 0;

-- ============ 3. payments — registru de tranzacții (ledger) ============

create table payments (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  property_id  uuid not null references properties(id) on delete cascade,
  booking_id   uuid not null references bookings(id) on delete cascade,
  kind         text not null default 'payment'
               check (kind in ('payment','refund')),
  -- mereu pozitiv; semnul în agregare îl dă `kind` (mai lizibil la afișare)
  amount       numeric(12,2) not null check (amount > 0),
  currency     char(3) not null,
  method       text not null default 'cash'
               check (method in ('cash','card','bank_transfer','online','other')),
  -- pregătit pentru plăți asincrone (Stripe): pending → completed/failed.
  -- Doar 'completed' intră în agregate și venit.
  status       text not null default 'completed'
               check (status in ('pending','completed','failed')),
  provider     text not null default 'manual',  -- 'manual' azi; 'stripe' pe viitor
  provider_ref text,                             -- id tranzacție extern / serie factură
  note         text,
  recorded_by  uuid references auth.users(id),
  paid_at      timestamptz not null default now(),  -- data efectivă (revenue dashboard)
  created_at   timestamptz not null default now()
);
create index payments_booking_idx  on payments (booking_id);
create index payments_property_idx on payments (property_id, paid_at);

alter table payments enable row level security;
revoke all on payments from anon;

-- citire: orice membru cu acces la proprietate
create policy payments_select on payments for select to authenticated
  using (app.can_access_property(property_id));
-- scrisul trece exclusiv prin RPC record_payment (security definer) — fără insert direct
-- ștergere (corecție a unei înregistrări greșite): doar owner/manager
create policy payments_delete on payments for delete to authenticated
  using (app.is_org_role(org_id, array['owner','manager']));

-- ============ 4. Sincronizare booking.amount_paid + payment_status ============
-- Recalculează agregatul cached al unei rezervări din ledger. NU scrie dacă
-- nimic nu se schimbă (evită update-uri no-op și zgomot în audit).

create function app.sync_booking_payment(p_booking_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_total    numeric;
  v_net      numeric;   -- încasat - rambursat
  v_refunded numeric;
  v_status   text;
begin
  select total_amount into v_total from public.bookings where id = p_booking_id;
  if not found then return; end if;

  select
    coalesce(sum(case when kind = 'payment' then amount else -amount end), 0),
    coalesce(sum(amount) filter (where kind = 'refund'), 0)
  into v_net, v_refunded
  from public.payments
  where booking_id = p_booking_id and status = 'completed';

  if v_net <= 0 and v_refunded > 0 then
    v_status := 'refunded';
  elsif v_net <= 0 then
    v_status := 'unpaid';
  elsif v_net >= v_total then
    v_status := 'paid';
  else
    v_status := 'partial';
  end if;

  update public.bookings
  set amount_paid = v_net, payment_status = v_status
  where id = p_booking_id
    and (amount_paid is distinct from v_net or payment_status is distinct from v_status);
end $$;

create function app.payments_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform app.sync_booking_payment(old.booking_id);
    return old;
  end if;
  perform app.sync_booking_payment(new.booking_id);
  return new;
end $$;

create trigger payments_sync_booking
  after insert or update or delete on payments
  for each row execute function app.payments_sync();

-- ============ 5. Audit: eveniment 'payment_status' + guard fără zgomot ============
-- Schimbarea de stare plată intră în istoricul rezervării. Recalculările care
-- nu schimbă nimic auditabil (doar amount_paid) NU mai generează un eveniment.

create or replace function app.audit_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_event_type text;
  v_old jsonb := null;
  v_new jsonb := null;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'created';
    v_new := jsonb_build_object(
      'unit', (select name from public.units where id = new.unit_id),
      'status', new.status, 'check_in', new.check_in, 'check_out', new.check_out
    );
  else
    if old.unit_id <> new.unit_id then
      v_event_type := 'reassigned';
      v_old := jsonb_build_object('unit', (select name from public.units where id = old.unit_id));
      v_new := jsonb_build_object('unit', (select name from public.units where id = new.unit_id));
    elsif old.status <> new.status then
      v_event_type := 'status_changed';
      v_old := jsonb_build_object('status', old.status);
      v_new := jsonb_build_object('status', new.status);
    elsif old.check_in <> new.check_in or old.check_out <> new.check_out then
      v_event_type := 'dates_changed';
      v_old := jsonb_build_object('check_in', old.check_in, 'check_out', old.check_out);
      v_new := jsonb_build_object('check_in', new.check_in, 'check_out', new.check_out);
    elsif old.guest_id is distinct from new.guest_id then
      v_event_type := 'guest_changed';
      v_old := jsonb_build_object('guest', (select full_name from public.guests where id = old.guest_id));
      v_new := jsonb_build_object('guest', (select full_name from public.guests where id = new.guest_id));
    elsif old.payment_status is distinct from new.payment_status then
      v_event_type := 'payment_status';
      v_old := jsonb_build_object('payment_status', old.payment_status);
      v_new := jsonb_build_object('payment_status', new.payment_status);
    elsif old.notes is distinct from new.notes
       or old.guests_count <> new.guests_count
       or old.total_amount <> new.total_amount then
      v_event_type := 'updated';
      v_new := jsonb_build_object('notes', new.notes, 'guests_count', new.guests_count, 'total_amount', new.total_amount);
    else
      v_event_type := null;  -- ex: doar amount_paid recalculat de trigger plăți
    end if;
  end if;

  if v_event_type is null then
    return new;
  end if;

  insert into public.booking_events (org_id, booking_id, actor_id, event_type, old_data, new_data)
  values (new.org_id, new.id, auth.uid(), v_event_type, v_old, v_new);

  return new;
end $$;

-- ============ 6. create_booking_internal: scrie snapshot-ul de preț ============
-- p_unit_price NULL => se folosește base_price-ul curent al tipului.

drop function app.create_booking_internal(uuid,uuid,uuid,date,date,int,text,text,numeric,text,text,text,text);

create function app.create_booking_internal(
  p_unit_type_id uuid,
  p_unit_id      uuid,
  p_guest_id     uuid,
  p_check_in     date,
  p_check_out    date,
  p_guests_count int,
  p_status       text,
  p_source       text,
  p_total        numeric,
  p_notes        text,
  p_snap_name    text default null,
  p_snap_email   text default null,
  p_snap_phone   text default null,
  p_unit_price   numeric default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_type record;
  v_unit record;
  v_guest record;
  v_unit_price numeric;
  v_booking_id uuid;
begin
  select t.*, p.currency as prop_currency
    into v_type
    from public.unit_types t
    join public.properties p on p.id = t.property_id
   where t.id = p_unit_type_id;
  if not found then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;
  if p_check_out <= p_check_in then raise exception 'INVALID_DATES'; end if;
  if p_guests_count > v_type.capacity then raise exception 'CAPACITY_EXCEEDED'; end if;

  v_unit_price := coalesce(p_unit_price, v_type.base_price);

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
          and b.stay && daterange(p_check_in, p_check_out, '[)')
      )
    order by u.name
  loop
    begin
      insert into public.bookings
        (org_id, property_id, unit_type_id, unit_id, guest_id, status,
         check_in, check_out, guests_count, total_amount, unit_price, currency,
         source, notes, booked_full_name, booked_email, booked_phone)
      values
        (v_type.org_id, v_type.property_id, p_unit_type_id, v_unit.id, p_guest_id,
         p_status, p_check_in, p_check_out, p_guests_count, p_total, v_unit_price,
         v_type.prop_currency, p_source, p_notes,
         coalesce(nullif(trim(p_snap_name), ''), v_guest.full_name),
         coalesce(nullif(lower(trim(p_snap_email)), ''), v_guest.email),
         coalesce(nullif(trim(p_snap_phone), ''), v_guest.phone))
      returning id into v_booking_id;
      return v_booking_id;
    exception when exclusion_violation then
      continue; -- race: altcineva a luat camera între select și insert
    end;
  end loop;

  raise exception 'UNIT_NOT_AVAILABLE';
end $$;

revoke execute on function app.create_booking_internal(uuid,uuid,uuid,date,date,int,text,text,numeric,text,text,text,text,numeric)
  from public, anon, authenticated;

-- wrapper-ele pasează base_price ca snapshot de preț

create or replace function public.create_booking(
  p_unit_type_id uuid,
  p_check_in     date,
  p_check_out    date,
  p_guest_id     uuid default null,
  p_unit_id      uuid default null,
  p_guests_count int default 1,
  p_status       text default 'confirmed',
  p_total        numeric default null,
  p_notes        text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_type record;
  v_total numeric;
begin
  select * into v_type from public.unit_types where id = p_unit_type_id;
  if not found then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;
  if not app.can_access_property(v_type.property_id) then
    raise exception 'FORBIDDEN';
  end if;
  if p_status not in ('pending','confirmed','blocked') then
    raise exception 'INVALID_STATUS';
  end if;
  if p_status <> 'blocked' and p_guest_id is null then
    raise exception 'GUEST_REQUIRED';
  end if;
  -- guard cross-tenant: guest-ul trebuie să fie din aceeași organizație (migrația 17)
  if p_guest_id is not null and not exists (
    select 1 from public.guests g
    where g.id = p_guest_id and g.org_id = v_type.org_id
  ) then
    raise exception 'GUEST_NOT_FOUND';
  end if;
  v_total := coalesce(p_total, (p_check_out - p_check_in) * v_type.base_price);
  return app.create_booking_internal(
    p_unit_type_id, p_unit_id, p_guest_id, p_check_in, p_check_out,
    p_guests_count, p_status,
    case when p_status = 'blocked' then 'blocked' else 'admin' end,
    v_total, p_notes, null, null, null, v_type.base_price);
end $$;

create or replace function public.public_create_booking(
  p_slug         text,
  p_unit_type_id uuid,
  p_check_in     date,
  p_check_out    date,
  p_full_name    text,
  p_email        text,
  p_phone        text default null,
  p_guests_count int default 1,
  p_notes        text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_prop record;
  v_type record;
  v_guest_id uuid;
  v_booking_id uuid;
begin
  select * into v_prop from public.properties
   where slug = p_slug and is_published;
  if not found then raise exception 'PROPERTY_NOT_FOUND'; end if;

  select * into v_type from public.unit_types
   where id = p_unit_type_id and property_id = v_prop.id and is_active;
  if not found then raise exception 'UNIT_TYPE_NOT_FOUND'; end if;

  if p_check_in < current_date then raise exception 'INVALID_DATES'; end if;
  if p_check_out - p_check_in > 365 then raise exception 'INVALID_DATES'; end if;
  if coalesce(trim(p_full_name), '') = '' or coalesce(trim(p_email), '') = '' then
    raise exception 'GUEST_DETAILS_REQUIRED';
  end if;

  v_guest_id := (app.find_or_create_guest_internal(
                   v_prop.org_id, p_full_name, p_email, p_phone, false)->>'guest_id')::uuid;

  v_booking_id := app.create_booking_internal(
    p_unit_type_id, null, v_guest_id, p_check_in, p_check_out,
    p_guests_count, 'pending', 'public',
    (p_check_out - p_check_in) * v_type.base_price, p_notes,
    p_full_name, p_email, p_phone, v_type.base_price);

  return jsonb_build_object('booking_id', v_booking_id, 'status', 'pending');
end $$;

-- ============ 7. RPC: înregistrare plată / rambursare ============

create function public.record_payment(
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
  if not app.can_access_property(v_booking.property_id) then raise exception 'FORBIDDEN'; end if;
  if v_booking.status = 'blocked' then raise exception 'BOOKING_NOT_PAYABLE'; end if;
  if p_kind not in ('payment','refund') then raise exception 'INVALID_KIND'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_method not in ('cash','card','bank_transfer','online','other') then
    raise exception 'INVALID_METHOD';
  end if;

  insert into public.payments
    (org_id, property_id, booking_id, kind, amount, currency, method,
     status, provider, provider_ref, note, recorded_by, paid_at)
  values
    (v_booking.org_id, v_booking.property_id, p_booking_id, p_kind, p_amount,
     v_booking.currency, p_method, 'completed', 'manual', p_provider_ref, p_note,
     auth.uid(), coalesce(p_paid_at, now()))
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function public.record_payment from anon, public;
grant execute on function public.record_payment to authenticated;

-- ============ 8. RPC: rezumat venit (azi / lună / an) ============
-- Agregare server-side, în timezone-ul proprietății. Venitul = suma
-- tranzacțiilor completate (refund = minus). Bază pentru dashboard.

create function public.get_revenue_summary(p_property_id uuid)
returns table (
  revenue_today numeric,
  revenue_month numeric,
  revenue_year  numeric,
  currency      char(3)
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_prop  record;
  v_today date;
begin
  select * into v_prop from public.properties where id = p_property_id;
  if not found then raise exception 'PROPERTY_NOT_FOUND'; end if;
  if not app.can_access_property(p_property_id) then raise exception 'FORBIDDEN'; end if;

  v_today := (now() at time zone v_prop.timezone)::date;

  return query
  with tx as (
    select
      (paid_at at time zone v_prop.timezone)::date as d,
      case when kind = 'payment' then amount else -amount end as net
    from public.payments
    where property_id = p_property_id and status = 'completed'
  )
  select
    coalesce(sum(net) filter (where d = v_today), 0)::numeric,
    coalesce(sum(net) filter (where date_trunc('month', d) = date_trunc('month', v_today)), 0)::numeric,
    coalesce(sum(net) filter (where date_trunc('year', d) = date_trunc('year', v_today)), 0)::numeric,
    v_prop.currency
  from tx;
end $$;

revoke execute on function public.get_revenue_summary from anon, public;
grant execute on function public.get_revenue_summary to authenticated;
