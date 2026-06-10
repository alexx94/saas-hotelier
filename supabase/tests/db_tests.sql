-- ============================================================
-- Teste DB: anti-double-booking, auto-asignare, RLS isolation
-- Rulează: psql -v ON_ERROR_STOP=1 -f db_tests.sql (totul în
-- tranzacție + rollback => nu lasă date în urmă)
-- ============================================================
begin;

-- ---------- seed ----------
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-00000000000a', 'owner-a@test.ro'),
       ('00000000-0000-0000-0000-00000000000b', 'owner-b@test.ro');

insert into organizations (id, name, slug) values
  ('10000000-0000-0000-0000-000000000001', 'Org A', 'org-a'),
  ('10000000-0000-0000-0000-000000000002', 'Org B', 'org-b');

insert into organization_members (org_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'owner'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'owner');

insert into properties (id, org_id, name, slug, is_published) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'Hotel Test', 'hotel-test', true);

insert into unit_types (id, org_id, property_id, name, capacity, base_price) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'Dubla standard', 2, 100);

insert into units (id, org_id, property_id, unit_type_id, name) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Camera 1'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Camera 2');

insert into guests (id, org_id, full_name, email) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'Ion Popescu', 'ion@test.ro');

-- ---------- TEST 1: insert direct suprapus => respins de constraint ----------
do $$
begin
  insert into bookings (org_id, property_id, unit_type_id, unit_id, guest_id,
                        status, check_in, check_out, currency)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',
          '50000000-0000-0000-0000-000000000001','confirmed','2026-07-01','2026-07-05','RON');
  begin
    insert into bookings (org_id, property_id, unit_type_id, unit_id, guest_id,
                          status, check_in, check_out, currency)
    values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
            '30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',
            '50000000-0000-0000-0000-000000000001','confirmed','2026-07-03','2026-07-08','RON');
    raise exception 'TEST 1 FAIL: double booking a fost permis!';
  exception when exclusion_violation then
    raise notice 'TEST 1 PASS: double booking respins (23P01)';
  end;
end $$;

-- ---------- TEST 2: check-out = check-in urmator e PERMIS (range [) ) ----------
do $$
begin
  insert into bookings (org_id, property_id, unit_type_id, unit_id, guest_id,
                        status, check_in, check_out, currency)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',
          '50000000-0000-0000-0000-000000000001','confirmed','2026-07-05','2026-07-07','RON');
  raise notice 'TEST 2 PASS: back-to-back (check-out 05 / check-in 05) permis';
end $$;

-- ---------- TEST 3: auto-asignare alege camera libera ----------
do $$
declare v_id uuid; v_unit uuid;
begin
  -- Camera 1 e ocupata 01-05; auto-assign trebuie sa aleaga Camera 2
  v_id := app.create_booking_internal(
    '30000000-0000-0000-0000-000000000001', null,
    '50000000-0000-0000-0000-000000000001',
    '2026-07-02','2026-07-04', 2, 'confirmed', 'admin', 200, null);
  select unit_id into v_unit from bookings where id = v_id;
  if v_unit = '40000000-0000-0000-0000-000000000002' then
    raise notice 'TEST 3 PASS: auto-asignare a ales Camera 2';
  else
    raise exception 'TEST 3 FAIL: a ales unitatea %', v_unit;
  end if;
end $$;

-- ---------- TEST 4: niciun loc liber => UNIT_NOT_AVAILABLE ----------
do $$
declare v_id uuid;
begin
  begin
    v_id := app.create_booking_internal(
      '30000000-0000-0000-0000-000000000001', null,
      '50000000-0000-0000-0000-000000000001',
      '2026-07-02','2026-07-04', 2, 'confirmed', 'admin', 200, null);
    raise exception 'TEST 4 FAIL: overbooking permis!';
  exception when others then
    if sqlerrm = 'UNIT_NOT_AVAILABLE' then
      raise notice 'TEST 4 PASS: overbooking respins (UNIT_NOT_AVAILABLE)';
    else
      raise;
    end if;
  end;
end $$;

-- ---------- TEST 5: disponibilitate publica ----------
do $$
declare v_avail int;
begin
  select available_units into v_avail
  from public_get_availability('hotel-test','2026-07-02','2026-07-04');
  if coalesce(v_avail, 0) = 0 then
    raise notice 'TEST 5a PASS: 0 camere libere pe 02-04 iulie';
  else
    raise exception 'TEST 5a FAIL: % camere libere', v_avail;
  end if;
  select available_units into v_avail
  from public_get_availability('hotel-test','2026-08-01','2026-08-05');
  if v_avail = 2 then
    raise notice 'TEST 5b PASS: 2 camere libere in august';
  else
    raise exception 'TEST 5b FAIL: % camere libere', v_avail;
  end if;
end $$;

-- ---------- TEST 6: rezervare publica (ca anon) ----------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
declare v jsonb;
begin
  v := public_create_booking('hotel-test','30000000-0000-0000-0000-000000000001',
        '2026-09-01','2026-09-03','Maria Ionescu','maria@test.ro','0722000000',2,null);
  if v->>'status' = 'pending' then
    raise notice 'TEST 6 PASS: rezervare publica creata cu status pending';
  else
    raise exception 'TEST 6 FAIL: %', v;
  end if;
end $$;

-- ---------- TEST 7: anon NU poate citi bookings ----------
do $$
declare v int;
begin
  begin
    select count(*) into v from bookings;
    raise exception 'TEST 7 FAIL: anon a citit bookings!';
  exception when insufficient_privilege then
    raise notice 'TEST 7 PASS: anon nu are acces la bookings';
  end;
end $$;

-- ---------- TEST 8: anon vede doar proprietati publicate ----------
do $$
declare v int;
begin
  select count(*) into v from properties;
  if v = 1 then
    raise notice 'TEST 8 PASS: anon vede doar proprietatea publicata';
  else
    raise exception 'TEST 8 FAIL: anon vede % proprietati', v;
  end if;
end $$;
reset role;

-- ---------- TEST 9: izolare cross-tenant ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare v int;
begin
  select count(*) into v from bookings;
  if v = 0 then
    raise notice 'TEST 9a PASS: userul org B nu vede bookings org A';
  else
    raise exception 'TEST 9a FAIL: vede % bookings', v;
  end if;
  select count(*) into v from guests;
  if v = 0 then
    raise notice 'TEST 9b PASS: userul org B nu vede guests org A';
  else
    raise exception 'TEST 9b FAIL: vede % guests', v;
  end if;
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v int;
begin
  select count(*) into v from bookings;
  if v >= 4 then
    raise notice 'TEST 9c PASS: ownerul org A isi vede bookings (%)', v;
  else
    raise exception 'TEST 9c FAIL: vede doar %', v;
  end if;
end $$;
reset role;

-- ---------- TEST 10: arhivare blocată dacă există rezervări viitoare ----------
do $$
declare v_unit_id uuid;
begin
  -- creăm o unitate fără rezervări viitoare → arhivare permisă
  insert into units (id, org_id, property_id, unit_type_id, name, status)
  values ('40000000-0000-0000-0000-000000000099',
          '10000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001',
          'Camera Test', 'active');

  update units set status = 'archived' where id = '40000000-0000-0000-0000-000000000099';
  raise notice 'TEST 10a PASS: arhivare permisă fără rezervări viitoare';

  -- Camera 1 are rezervare viitoare (07-01..07-05) → arhivare blocată
  begin
    update units set status = 'archived' where id = '40000000-0000-0000-0000-000000000001';
    raise exception 'TEST 10b FAIL: arhivare permisă cu rezervări viitoare!';
  exception when others then
    if sqlerrm = 'UNIT_HAS_FUTURE_BOOKINGS' then
      raise notice 'TEST 10b PASS: arhivare blocată cu rezervări viitoare';
    else raise; end if;
  end;
end $$;

-- ---------- TEST 11: get_available_units ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_count int;
begin
  -- În august nu există rezervări → 2 camere libere (Camera Test e arhivată, nu apare)
  select count(*) into v_count
  from public.get_available_units(
    '30000000-0000-0000-0000-000000000001',
    '2026-08-01', '2026-08-05'
  ) where is_free;
  if v_count = 2 then
    raise notice 'TEST 11 PASS: get_available_units returnează 2 camere libere în august';
  else
    raise exception 'TEST 11 FAIL: % camere libere', v_count;
  end if;
end $$;
reset role;

-- ---------- TEST 12: reassign_booking ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare
  v_booking_id uuid;
  v_new_unit uuid := '40000000-0000-0000-0000-000000000002'; -- Camera 2
  v_unit_after uuid;
  v_events int;
begin
  -- selectăm rezervarea back-to-back pe Camera 1 (07-05..07-07); Camera 2 e liberă pe acele date
  select id into v_booking_id from bookings
  where unit_id = '40000000-0000-0000-0000-000000000001'
    and check_in = '2026-07-05'
  limit 1;

  perform public.reassign_booking(v_booking_id, v_new_unit);

  select unit_id into v_unit_after from bookings where id = v_booking_id;
  if v_unit_after = v_new_unit then
    raise notice 'TEST 12a PASS: booking mutat pe Camera 2';
  else
    raise exception 'TEST 12a FAIL: unit_id = %', v_unit_after;
  end if;

  select count(*) into v_events from booking_events
  where booking_id = v_booking_id and event_type = 'reassigned';
  if v_events >= 1 then
    raise notice 'TEST 12b PASS: eveniment reassigned scris în audit';
  else
    raise exception 'TEST 12b FAIL: niciun eveniment reassigned';
  end if;

  -- reasignare pe ea însăși = overlap → UNIT_NOT_AVAILABLE (sau no-op)
  begin
    perform public.reassign_booking(v_booking_id, '40000000-0000-0000-0000-000000000001');
    raise notice 'TEST 12c INFO: re-reasignare pe Camera 1 permisă (interval liber acum)';
  exception when others then
    raise notice 'TEST 12c INFO: re-reasignare blocată (%)', sqlerrm;
  end;
end $$;
reset role;

-- ---------- TEST 13: find_or_create_guest dedupe ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare
  v1 jsonb; v2 jsonb; v3 jsonb;
begin
  -- creare oaspete nou
  v1 := public.find_or_create_guest(
    '10000000-0000-0000-0000-000000000001',
    'Maria Dedupe', 'maria.dedupe@test.ro', '0722111222');
  if v1->>'matched_by' is null then
    raise notice 'TEST 13a PASS: oaspete nou creat';
  else
    raise exception 'TEST 13a FAIL: unexpected match %', v1;
  end if;

  -- același email → aceeași persoană
  v2 := public.find_or_create_guest(
    '10000000-0000-0000-0000-000000000001',
    'Alt Nume', 'maria.dedupe@test.ro', null);
  if (v2->>'guest_id') = (v1->>'guest_id') and v2->>'matched_by' = 'email' then
    raise notice 'TEST 13b PASS: deduplicare pe email';
  else
    raise exception 'TEST 13b FAIL: %', v2;
  end if;

  -- același telefon → aceeași persoană
  v3 := public.find_or_create_guest(
    '10000000-0000-0000-0000-000000000001',
    'Alt Nume 2', null, '0722-111-222');
  if (v3->>'guest_id') = (v1->>'guest_id') and v3->>'matched_by' = 'phone' then
    raise notice 'TEST 13c PASS: deduplicare pe telefon (format diferit)';
  else
    raise exception 'TEST 13c FAIL: %', v3;
  end if;
end $$;
reset role;

rollback;
