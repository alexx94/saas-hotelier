-- ============================================================
-- Migrația 23 (Sprint 4.1): cine a consemnat plata
--   Snapshot `recorded_by_email` la momentul plății — același pattern ca
--   `unit_events.actor_email` (audit camere): emailul vine din JWT, fără join
--   spre auth.users (neexpus prin API). Loguri complete pe termen lung.
-- ============================================================

alter table payments add column recorded_by_email text;

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
  if not app.can_access_property(v_booking.property_id) then raise exception 'FORBIDDEN'; end if;
  if v_booking.status = 'blocked' then raise exception 'BOOKING_NOT_PAYABLE'; end if;
  if p_kind not in ('payment','refund') then raise exception 'INVALID_KIND'; end if;
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
