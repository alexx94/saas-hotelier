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
   'Hotel Test', 'hotel-test', true),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   'Hotel Secret', 'hotel-secret-test', false);

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
-- (verifică pe slug-urile seed-ate — DB-ul local poate conține și date reale)
do $$
declare v_pub int; v_secret int;
begin
  select count(*) into v_pub from properties where slug = 'hotel-test';
  select count(*) into v_secret from properties where slug = 'hotel-secret-test';
  if v_pub = 1 and v_secret = 0 then
    raise notice 'TEST 8 PASS: anon vede publicata, nu vede nepublicata';
  else
    raise exception 'TEST 8 FAIL: publicata=%, nepublicata=%', v_pub, v_secret;
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

-- ---------- TEST 14: unicitate guests (email + telefon, per org) ----------
do $$
begin
  -- email duplicat (case/spații diferite) => respins
  begin
    insert into guests (org_id, full_name, email)
    values ('10000000-0000-0000-0000-000000000001', 'Ion Clone', '  ION@test.ro ');
    raise exception 'TEST 14a FAIL: email duplicat permis!';
  exception when unique_violation then
    raise notice 'TEST 14a PASS: email duplicat respins (unicitate per org)';
  end;

  -- telefon duplicat (format diferit, aceleași cifre) => respins
  insert into guests (org_id, full_name, phone)
  values ('10000000-0000-0000-0000-000000000001', 'Gigel Tel', '0733 100 200');
  begin
    insert into guests (org_id, full_name, phone)
    values ('10000000-0000-0000-0000-000000000001', 'Gigel Tel 2', '+0733-100-200');
    raise exception 'TEST 14b FAIL: telefon duplicat permis!';
  exception when unique_violation then
    raise notice 'TEST 14b PASS: telefon duplicat respins (normalizat, per org)';
  end;

  -- același email în ALTĂ organizație => permis (unicitatea e per org)
  insert into guests (org_id, full_name, email)
  values ('10000000-0000-0000-0000-000000000002', 'Ion La Org B', 'ion@test.ro');
  raise notice 'TEST 14c PASS: același email permis în altă organizație';
end $$;

-- ---------- TEST 15: find_or_create_guest blocat cross-org ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare v jsonb;
begin
  -- userul org B încearcă să creeze/probeze oaspeți în org A => FORBIDDEN
  begin
    v := public.find_or_create_guest(
      '10000000-0000-0000-0000-000000000001', 'Intrus', 'intrus@test.ro', null);
    raise exception 'TEST 15 FAIL: cross-org find_or_create_guest permis!';
  exception when others then
    if sqlerrm = 'FORBIDDEN' then
      raise notice 'TEST 15 PASS: find_or_create_guest cross-org respins (FORBIDDEN)';
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 16: anon nu poate executa find_or_create_guest ----------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
declare v jsonb;
begin
  begin
    v := public.find_or_create_guest(
      '10000000-0000-0000-0000-000000000001', 'Anon Hacker', 'hacker@test.ro', null);
    raise exception 'TEST 16 FAIL: anon a executat find_or_create_guest!';
  exception when insufficient_privilege then
    raise notice 'TEST 16 PASS: anon nu are execute pe find_or_create_guest';
  end;
end $$;
reset role;

-- ---------- TEST 17: manager nu se poate promova la owner ----------
do $$
begin
  insert into auth.users (id, email)
  values ('00000000-0000-0000-0000-00000000000c', 'manager-a@test.ro');
  insert into organization_members (org_id, user_id, role)
  values ('10000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-00000000000c', 'manager');
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
do $$
declare v_rows int;
begin
  -- 17a: manager nu poate insera un membru cu rol owner
  begin
    insert into organization_members (org_id, user_id, role)
    values ('10000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-00000000000c', 'owner');
    raise exception 'TEST 17a FAIL: manager a inserat un owner!';
  exception when insufficient_privilege or unique_violation then
    -- RLS respinge cu RLS violation (42501)
    raise notice 'TEST 17a PASS: manager nu poate acorda rol owner';
  when others then
    if sqlstate = '42501' then
      raise notice 'TEST 17a PASS: manager nu poate acorda rol owner';
    else raise; end if;
  end;

  -- 17b: manager nu se poate auto-promova (WITH CHECK respinge rândul nou)
  begin
    update organization_members set role = 'owner'
    where user_id = '00000000-0000-0000-0000-00000000000c';
    raise exception 'TEST 17b FAIL: manager s-a promovat la owner!';
  exception when others then
    if sqlstate = '42501' then
      raise notice 'TEST 17b PASS: auto-promovarea manager->owner blocată';
    else raise; end if;
  end;

  -- 17c: manager nu poate șterge owner-ul
  delete from organization_members
  where user_id = '00000000-0000-0000-0000-00000000000a';
  select count(*) into v_rows from organization_members
  where user_id = '00000000-0000-0000-0000-00000000000a';
  if v_rows = 1 then
    raise notice 'TEST 17c PASS: managerul nu poate șterge owner-ul';
  else
    raise exception 'TEST 17c FAIL: owner șters de manager!';
  end if;
end $$;
reset role;

-- ---------- TEST 18: create_booking respinge guest din altă organizație ----------
-- capturăm id-ul oaspetelui din org B ca superuser (RLS l-ar ascunde de userul A)
create temp table _t18 as
  select id from guests where full_name = 'Ion La Org B';
grant select on _t18 to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_id uuid;
begin
  begin
    v_id := public.create_booking(
      '30000000-0000-0000-0000-000000000001', '2026-10-01', '2026-10-03',
      (select id from _t18), null, 1, 'confirmed', null, null);
    raise exception 'TEST 18 FAIL: booking cu guest din altă organizație permis!';
  exception when others then
    if sqlerrm = 'GUEST_NOT_FOUND' then
      raise notice 'TEST 18 PASS: guest cross-org respins (GUEST_NOT_FOUND)';
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 19: rezervare publică cu email existent — profil neatins, snapshot cu datele tastate ----------
create temp table _t19 (booking_id uuid);
grant insert on _t19 to anon;
grant select on _t19 to authenticated;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
declare v jsonb;
begin
  -- 'maria@test.ro' există din TEST 6 (Maria Ionescu / 0722000000);
  -- vizitatorul tastează alt nume + alt telefon
  v := public_create_booking('hotel-test','30000000-0000-0000-0000-000000000001',
        '2026-11-01','2026-11-03','Maria Schimbat','MARIA@test.ro','0799999999',1,null);
  insert into _t19 values ((v->>'booking_id')::uuid);
end $$;
reset role;
do $$
declare
  v_b record;
begin
  select * into v_b from bookings where id = (select booking_id from _t19);

  -- 19a: snapshot = datele tastate la rezervare
  if v_b.booked_full_name = 'Maria Schimbat' and v_b.booked_phone = '0799999999'
     and v_b.booked_email = 'maria@test.ro' then
    raise notice 'TEST 19a PASS: snapshot pe booking cu datele tastate';
  else
    raise exception 'TEST 19a FAIL: snapshot = % / % / %',
      v_b.booked_full_name, v_b.booked_email, v_b.booked_phone;
  end if;

  -- 19b: rezervarea e legată de profilul existent (dedupe pe email), nu duplicat
  if v_b.guest_id = (select id from guests
                     where org_id = '10000000-0000-0000-0000-000000000001'
                       and email = 'maria@test.ro') then
    raise notice 'TEST 19b PASS: legat de profilul existent (match email)';
  else
    raise exception 'TEST 19b FAIL: guest_id = %', v_b.guest_id;
  end if;

  -- 19c: profilul NU a fost modificat de fluxul public (untrusted)
  if exists (select 1 from guests where email = 'maria@test.ro'
             and full_name = 'Maria Ionescu' and phone = '0722000000') then
    raise notice 'TEST 19c PASS: profilul neatins de rezervarea publică';
  else
    raise exception 'TEST 19c FAIL: profilul a fost modificat de anon!';
  end if;
end $$;

-- ---------- TEST 20: trusted (staff) actualizează profilul ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v jsonb;
begin
  -- staff-ul confirmă datele noi ale Mariei -> profilul se actualizează
  v := public.find_or_create_guest(
    '10000000-0000-0000-0000-000000000001',
    'Maria Actualizata', 'maria@test.ro', '0788000111');
  if v->>'matched_by' = 'email'
     and exists (select 1 from guests where email = 'maria@test.ro'
                 and full_name = 'Maria Actualizata' and phone = '0788000111') then
    raise notice 'TEST 20 PASS: profil actualizat de staff (trusted)';
  else
    raise exception 'TEST 20 FAIL: %', v;
  end if;
end $$;
reset role;

-- ---------- TEST 21: link_booking_guest (asociere manuală profil) ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare
  v_booking_id uuid;
  v_other_guest uuid;
  v_after record;
begin
  select id into v_booking_id from bookings
  where check_in = '2026-09-01' limit 1; -- rezervarea publică din TEST 6

  -- 21a: asociere cu alt profil din org A — snapshot rămâne neschimbat
  select id into v_other_guest from guests
  where org_id = '10000000-0000-0000-0000-000000000001' and full_name = 'Ion Popescu';

  perform public.link_booking_guest(v_booking_id, v_other_guest);
  select * into v_after from bookings where id = v_booking_id;
  if v_after.guest_id = v_other_guest and v_after.booked_full_name = 'Maria Ionescu' then
    raise notice 'TEST 21a PASS: profil re-asociat, snapshot pastrat';
  else
    raise exception 'TEST 21a FAIL: guest_id=%, snapshot=%', v_after.guest_id, v_after.booked_full_name;
  end if;

  -- 21b: audit a inregistrat guest_changed
  if exists (select 1 from booking_events
             where booking_id = v_booking_id and event_type = 'guest_changed') then
    raise notice 'TEST 21b PASS: eveniment guest_changed in audit';
  else
    raise exception 'TEST 21b FAIL: lipseste evenimentul guest_changed';
  end if;

  -- 21c: profil din alta organizatie -> respins
  begin
    perform public.link_booking_guest(v_booking_id, (select id from _t18));
    raise exception 'TEST 21c FAIL: profil cross-org acceptat!';
  exception when others then
    if sqlerrm = 'GUEST_NOT_FOUND' then
      raise notice 'TEST 21c PASS: profil cross-org respins (GUEST_NOT_FOUND)';
    else raise; end if;
  end;
end $$;

-- 21d: userul org B nu poate re-asocia rezervari din org A
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare v_booking_id uuid;
begin
  -- id-ul e luat prin definer (nu prin RLS) — simulam un id ghicit/scurs
  begin
    perform public.link_booking_guest(
      (select booking_id from _t19),
      (select id from _t18));
    raise exception 'TEST 21d FAIL: user strain a re-asociat rezervarea!';
  exception when others then
    if sqlerrm = 'FORBIDDEN' then
      raise notice 'TEST 21d PASS: user fara acces respins (FORBIDDEN)';
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 22: get_guest_stats — totaluri + izolare RLS ----------
do $$
declare
  v_guest uuid;
  v_stats record;
begin
  -- oaspete nou cu istoric controlat: 1 viitoare, 1 viitoare anulată, 1 trecută
  insert into guests (org_id, full_name)
  values ('10000000-0000-0000-0000-000000000001', 'Stats Test')
  returning id into v_guest;

  insert into bookings (org_id, property_id, unit_type_id, unit_id, guest_id,
                        status, check_in, check_out, currency)
  values
    ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
     '30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002',
     v_guest,'confirmed', current_date + 200, current_date + 202,'RON'),
    ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
     '30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002',
     v_guest,'cancelled', current_date + 210, current_date + 212,'RON'),
    ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
     '30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002',
     v_guest,'checked_out', current_date - 30, current_date - 28,'RON');

  select * into v_stats from public.get_guest_stats(v_guest);
  if v_stats.total = 3 and v_stats.upcoming = 1 and v_stats.cancelled = 1 then
    raise notice 'TEST 22a PASS: stats corecte (total=3, upcoming=1, cancelled=1)';
  else
    raise exception 'TEST 22a FAIL: total=%, upcoming=%, cancelled=%',
      v_stats.total, v_stats.upcoming, v_stats.cancelled;
  end if;
end $$;

-- 22b: userul org B nu vede nimic prin RLS (security invoker) => 0/0/0
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare v_stats record;
begin
  select s.* into v_stats from public.get_guest_stats(
    (select id from guests where full_name = 'Stats Test')) s;
  -- subquery-ul pe guests e tot sub RLS => guest_id null => 0 rânduri numărate
  if coalesce(v_stats.total, 0) = 0 then
    raise notice 'TEST 22b PASS: user strain vede 0 rezervari';
  else
    raise exception 'TEST 22b FAIL: total=% vizibil cross-org', v_stats.total;
  end if;
end $$;
reset role;

-- ---------- TEST 23: Sprint 3 — audit camere + bulk status + numerotare ----------

-- 23a: generate_units cu interval (start 101, count 3) + audit 'created'
do $$
declare v_created int; v_events int;
begin
  select public.generate_units(
    '30000000-0000-0000-0000-000000000001', 3, 'Camera ', 101) into v_created;
  if v_created <> 3 then
    raise exception 'TEST 23a FAIL: create=% (asteptat 3)', v_created;
  end if;
  select count(*) into v_events from unit_events ue
    join units u on u.id = ue.unit_id
   where ue.event_type = 'created' and u.name in ('Camera 101','Camera 102','Camera 103');
  if v_events = 3 then
    raise notice 'TEST 23a PASS: interval 101-103 generat + 3 evenimente created';
  else
    raise exception 'TEST 23a FAIL: % evenimente created (asteptat 3)', v_events;
  end if;
end $$;

-- 23b: p_start_number invalid => INVALID_START
do $$
begin
  begin
    perform public.generate_units('30000000-0000-0000-0000-000000000001', 1, 'X', 0);
    raise exception 'TEST 23b FAIL: start 0 acceptat!';
  exception when others then
    if sqlerrm = 'INVALID_START' then
      raise notice 'TEST 23b PASS: start invalid respins (INVALID_START)';
    else raise; end if;
  end;
end $$;

-- 23c: bulk archive — camera cu rezervare viitoare e blocata, restul trec
do $$
declare v_result jsonb; v_unit_busy uuid;
begin
  select id into v_unit_busy from units where name = 'Camera 101';
  insert into bookings (org_id, property_id, unit_type_id, unit_id, guest_id,
                        status, check_in, check_out, currency)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001', v_unit_busy,
          '50000000-0000-0000-0000-000000000001','confirmed',
          current_date + 300, current_date + 302,'RON');

  select public.bulk_update_unit_status(
    array(select id from units where name in ('Camera 101','Camera 102','Camera 103')),
    'archived') into v_result;

  if (v_result->>'updated')::int = 2
     and v_result->'blocked' = '["Camera 101"]'::jsonb then
    raise notice 'TEST 23c PASS: bulk archive — 2 actualizate, Camera 101 blocata';
  else
    raise exception 'TEST 23c FAIL: rezultat %', v_result;
  end if;
end $$;

-- 23d: audit status_changed + renamed cu old/new corecte
do $$
declare v_ev record;
begin
  update units set name = 'Camera 103-bis' where name = 'Camera 103';
  select * into v_ev from unit_events ue
   where ue.event_type = 'renamed'
   order by ue.created_at desc limit 1;
  if v_ev.old_data->>'name' = 'Camera 103' and v_ev.new_data->>'name' = 'Camera 103-bis' then
    raise notice 'TEST 23d PASS: audit renamed cu old/new corecte';
  else
    raise exception 'TEST 23d FAIL: old=% new=%', v_ev.old_data, v_ev.new_data;
  end if;
  if not exists (
    select 1 from unit_events ue join units u on u.id = ue.unit_id
    where ue.event_type = 'status_changed' and u.name = 'Camera 102'
      and ue.new_data->>'status' = 'archived'
  ) then
    raise exception 'TEST 23d FAIL: lipseste evenimentul status_changed pe Camera 102';
  end if;
end $$;

-- 23e: izolare RLS — userul org B nu vede evenimentele org A
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare v_count int;
begin
  select count(*) into v_count from unit_events;
  if v_count = 0 then
    raise notice 'TEST 23e PASS: user strain vede 0 evenimente de camere';
  else
    raise exception 'TEST 23e FAIL: % evenimente vizibile cross-org', v_count;
  end if;
end $$;
reset role;

-- ---------- TEST 24: audit pe unit_types (created / updated / archived) ----------
do $$
declare v_type uuid; v_ev record;
begin
  insert into unit_types (org_id, property_id, name, capacity, base_price)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          'Twin audit', 2, 150)
  returning id into v_type;

  -- 24a: eveniment created
  if not exists (select 1 from unit_type_events
                 where unit_type_id = v_type and event_type = 'created'
                   and (new_data->>'base_price')::numeric = 150) then
    raise exception 'TEST 24a FAIL: lipseste evenimentul created';
  end if;
  raise notice 'TEST 24a PASS: created scris la insert tip';

  -- 24b: schimbare pret => updated cu old/new doar pe base_price
  update unit_types set base_price = 175 where id = v_type;
  select * into v_ev from unit_type_events
   where unit_type_id = v_type and event_type = 'updated'
   order by created_at desc limit 1;
  if (v_ev.old_data->>'base_price')::numeric = 150
     and (v_ev.new_data->>'base_price')::numeric = 175
     and v_ev.old_data ?& array['base_price'] and not v_ev.old_data ? 'name' then
    raise notice 'TEST 24b PASS: updated cu diff doar pe base_price';
  else
    raise exception 'TEST 24b FAIL: old=% new=%', v_ev.old_data, v_ev.new_data;
  end if;

  -- 24c: update fara schimbari relevante => niciun eveniment nou
  update unit_types set sort_order = sort_order where id = v_type;
  if (select count(*) from unit_type_events where unit_type_id = v_type) <> 2 then
    raise exception 'TEST 24c FAIL: eveniment scris pentru update fara schimbari';
  end if;
  raise notice 'TEST 24c PASS: update irelevant nu produce evenimente';

  -- 24d: arhivare / reactivare
  update unit_types set is_active = false where id = v_type;
  update unit_types set is_active = true  where id = v_type;
  if exists (select 1 from unit_type_events where unit_type_id = v_type and event_type = 'archived')
     and exists (select 1 from unit_type_events where unit_type_id = v_type and event_type = 'restored') then
    raise notice 'TEST 24d PASS: evenimente archived + restored';
  else
    raise exception 'TEST 24d FAIL: lipsesc archived/restored';
  end if;
end $$;

-- 24e: izolare RLS — userul org B nu vede evenimentele org A
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare v_count int;
begin
  select count(*) into v_count from unit_type_events;
  if v_count = 0 then
    raise notice 'TEST 24e PASS: user strain vede 0 evenimente de tip';
  else
    raise exception 'TEST 24e FAIL: % evenimente vizibile cross-org', v_count;
  end if;
end $$;
reset role;

-- ---------- TEST 25: bulk_delete_units — sterge / dezactiveaza / blocheaza ----------
do $$
declare v_result jsonb; v_free uuid; v_hist uuid; v_busy uuid;
begin
  -- 3 camere noi: una libera, una cu rezervare istorica, una cu rezervare viitoare
  insert into units (org_id, property_id, unit_type_id, name)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001','Del libera') returning id into v_free;
  insert into units (org_id, property_id, unit_type_id, name)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001','Del istorica') returning id into v_hist;
  insert into units (org_id, property_id, unit_type_id, name)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001','Del viitoare') returning id into v_busy;

  insert into bookings (org_id, property_id, unit_type_id, unit_id, guest_id,
                        status, check_in, check_out, currency)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001', v_hist,
          '50000000-0000-0000-0000-000000000001','checked_out',
          current_date - 20, current_date - 18,'RON'),
         ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001', v_busy,
          '50000000-0000-0000-0000-000000000001','confirmed',
          current_date + 400, current_date + 402,'RON');

  select public.bulk_delete_units(array[v_free, v_hist, v_busy]) into v_result;

  if (v_result->>'deleted')::int = 1
     and (v_result->>'deactivated')::int = 1
     and v_result->'blocked' = '["Del viitoare"]'::jsonb
     and not exists (select 1 from units where id = v_free)
     and exists (select 1 from units where id = v_hist and status = 'inactive')
     and exists (select 1 from units where id = v_busy and status = 'active') then
    raise notice 'TEST 25 PASS: bulk delete — 1 stearsa, 1 dezactivata, 1 blocata';
  else
    raise exception 'TEST 25 FAIL: rezultat %', v_result;
  end if;
end $$;

-- ---------- TEST 26: semantica statusurilor (migrația 17) ----------
-- inactive/out_of_service permise cu rezervări viitoare; archived rămâne strict
do $$
declare v_unit uuid;
begin
  insert into units (org_id, property_id, unit_type_id, name)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001','Sem 1') returning id into v_unit;
  insert into bookings (org_id, property_id, unit_type_id, unit_id, guest_id,
                        status, check_in, check_out, currency)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001', v_unit,
          '50000000-0000-0000-0000-000000000001','confirmed',
          current_date + 500, current_date + 502,'RON');

  -- 26a: inactive cu rezervare viitoare => permis, rezervarea rămâne
  update units set status = 'inactive' where id = v_unit;
  update units set status = 'out_of_service' where id = v_unit;
  if exists (select 1 from bookings where unit_id = v_unit and status = 'confirmed') then
    raise notice 'TEST 26a PASS: inactive/out_of_service permise, rezervarea ramane';
  else
    raise exception 'TEST 26a FAIL: rezervarea a disparut';
  end if;

  -- 26b: archived cu rezervare viitoare => respins
  begin
    update units set status = 'archived' where id = v_unit;
    raise exception 'TEST 26b FAIL: arhivare permisa cu rezervare viitoare!';
  exception when others then
    if sqlerrm = 'UNIT_HAS_FUTURE_BOOKINGS' then
      raise notice 'TEST 26b PASS: archived respins cu rezervari viitoare';
    else raise; end if;
  end;

  -- 26c: camera inactiva nu apare in get_available_units
  if not exists (
    select 1 from public.get_available_units(
      '30000000-0000-0000-0000-000000000001', current_date + 500, current_date + 502)
    where unit_id = v_unit
  ) then
    raise notice 'TEST 26c PASS: camera non-activa nu apare in availability';
  else
    raise exception 'TEST 26c FAIL: camera non-activa apare in availability';
  end if;
end $$;

-- ---------- TEST 27: room_blocks — integritate + availability ----------
do $$
declare v_unit uuid; v_block uuid; v_result jsonb; v_free boolean;
begin
  insert into units (org_id, property_id, unit_type_id, name)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001','Blk 1') returning id into v_unit;

  -- 27a: block valid pe interval liber
  select public.block_unit(v_unit, '2027-03-10', '2027-03-15', 'maintenance', 'AC') into v_block;
  raise notice 'TEST 27a PASS: block creat pe interval liber';

  -- 27b: block peste alt block => respins (EXCLUDE)
  begin
    perform public.block_unit(v_unit, '2027-03-12', '2027-03-20', 'renovation');
    raise exception 'TEST 27b FAIL: block suprapus acceptat!';
  exception when others then
    if sqlerrm = 'BLOCK_OVERLAPS' then
      raise notice 'TEST 27b PASS: block peste block respins';
    else raise; end if;
  end;

  -- 27c: block peste rezervare existenta => respins (trigger cross-tabel)
  insert into bookings (org_id, property_id, unit_type_id, unit_id, guest_id,
                        status, check_in, check_out, currency)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001', v_unit,
          '50000000-0000-0000-0000-000000000001','confirmed','2027-04-10','2027-04-15','RON');
  begin
    perform public.block_unit(v_unit, '2027-04-12', '2027-04-20', 'maintenance');
    raise exception 'TEST 27c FAIL: block peste rezervare acceptat!';
  exception when others then
    if sqlerrm = 'BLOCK_OVERLAPS_BOOKING' then
      raise notice 'TEST 27c PASS: block peste rezervare respins';
    else raise; end if;
  end;

  -- 27d: rezervare directa peste block => respinsa (trigger pe bookings)
  begin
    insert into bookings (org_id, property_id, unit_type_id, unit_id, guest_id,
                          status, check_in, check_out, currency)
    values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
            '30000000-0000-0000-0000-000000000001', v_unit,
            '50000000-0000-0000-0000-000000000001','confirmed','2027-03-12','2027-03-14','RON');
    raise exception 'TEST 27d FAIL: rezervare peste block acceptata!';
  exception when others then
    if sqlerrm = 'UNIT_BLOCKED' then
      raise notice 'TEST 27d PASS: rezervare peste block respinsa';
    else raise; end if;
  end;

  -- 27e: availability exclude camera pe intervalul blocat, o include in afara lui
  select is_free into v_free from public.get_available_units(
    '30000000-0000-0000-0000-000000000001', '2027-03-11', '2027-03-13')
   where unit_id = v_unit;
  if v_free then raise exception 'TEST 27e FAIL: camera blocata apare libera'; end if;
  select is_free into v_free from public.get_available_units(
    '30000000-0000-0000-0000-000000000001', '2027-05-01', '2027-05-03')
   where unit_id = v_unit;
  if not v_free then raise exception 'TEST 27e FAIL: camera libera apare blocata'; end if;
  raise notice 'TEST 27e PASS: availability tine cont de block-uri';

  -- 27f: remove_block => camera redevine disponibila + audit complet
  perform public.remove_block(v_block);
  select is_free into v_free from public.get_available_units(
    '30000000-0000-0000-0000-000000000001', '2027-03-11', '2027-03-13')
   where unit_id = v_unit;
  if not v_free then raise exception 'TEST 27f FAIL: camera ramane blocata dupa remove'; end if;
  if exists (select 1 from unit_events where unit_id = v_unit and event_type = 'block_created')
     and exists (select 1 from unit_events where unit_id = v_unit and event_type = 'block_removed') then
    raise notice 'TEST 27f PASS: remove_block elibereaza camera + audit block_created/removed';
  else
    raise exception 'TEST 27f FAIL: lipsesc evenimentele de audit pe block';
  end if;

  -- 27g: bulk_block_units — blocheaza unde e liber, sare unde e ocupat
  select public.bulk_block_units(
    array(select id from units where name in ('Blk 1','Camera 102')),
    '2027-04-12', '2027-04-18', 'renovation') into v_result;
  -- Blk 1 are rezervarea 10-15 apr => sarita; Camera 102 e archived (TEST 23c) => sarita
  if (v_result->>'blocked')::int = 0
     and v_result->'skipped' ?& array['Blk 1'] then
    raise notice 'TEST 27g PASS: bulk block sare camerele ocupate/non-active';
  else
    raise exception 'TEST 27g FAIL: rezultat %', v_result;
  end if;

  -- 27h: block pe camera non-activa => respins
  update units set status = 'out_of_service' where id = v_unit;
  begin
    perform public.block_unit(v_unit, '2027-06-01', '2027-06-05', 'maintenance');
    raise exception 'TEST 27h FAIL: block pe camera non-activa acceptat!';
  exception when others then
    if sqlerrm = 'UNIT_NOT_ACTIVE' then
      raise notice 'TEST 27h PASS: block pe camera non-activa respins';
    else raise; end if;
  end;
end $$;

-- ---------- TEST 28: bulk_remove_blocks — eliminare in masa pe interval ----------
do $$
declare v_u1 uuid; v_u2 uuid; v_result jsonb; v_removed int;
begin
  insert into units (org_id, property_id, unit_type_id, name)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001','Unb 1') returning id into v_u1;
  insert into units (org_id, property_id, unit_type_id, name)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001','Unb 2') returning id into v_u2;

  select public.bulk_block_units(array[v_u1, v_u2], '2027-07-01', '2027-07-10', 'renovation') into v_result;
  if (v_result->>'blocked')::int <> 2 then
    raise exception 'TEST 28 FAIL: setup bulk block %', v_result;
  end if;

  -- 28a: interval care nu atinge blocajele => 0 eliminate
  select public.bulk_remove_blocks(array[v_u1, v_u2], '2027-08-01', '2027-08-05') into v_removed;
  if v_removed <> 0 then
    raise exception 'TEST 28a FAIL: % eliminate pe interval fara blocaje', v_removed;
  end if;
  raise notice 'TEST 28a PASS: interval fara blocaje => 0 eliminate';

  -- 28b: interval care atinge blocajele => ambele eliminate + audit per blocaj
  select public.bulk_remove_blocks(array[v_u1, v_u2], '2027-07-05', '2027-07-06') into v_removed;
  if v_removed = 2
     and not exists (select 1 from room_blocks where unit_id in (v_u1, v_u2))
     and (select count(*) from unit_events
          where unit_id in (v_u1, v_u2) and event_type = 'block_removed') = 2 then
    raise notice 'TEST 28b PASS: 2 blocaje eliminate in masa + audit block_removed';
  else
    raise exception 'TEST 28b FAIL: removed=%', v_removed;
  end if;
end $$;

rollback;
