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

insert into unit_types (id, org_id, property_id, name, max_adults, max_children, base_price) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'Dubla standard', 2, 1, 100);

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
    '2026-07-02','2026-07-04', 2, 0, 'confirmed', 'admin', 200, '{}'::jsonb, 100, null);
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
      '2026-07-02','2026-07-04', 2, 0, 'confirmed', 'admin', 200, '{}'::jsonb, 100, null);
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
        '2026-09-01','2026-09-03','Maria Ionescu','maria@test.ro','0722000000',2,0,null);
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
      (select id from _t18), null, 1, 0, 'confirmed', null);
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
        '2026-11-01','2026-11-03','Maria Schimbat','MARIA@test.ro','0799999999',1,0,null);
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
  insert into unit_types (org_id, property_id, name, max_adults, max_children, base_price)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          'Twin audit', 2, 1, 150)
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
reset role;

-- ---------- TEST 29: plăți — snapshot preț, ledger, stare cached (Sprint 4) ----------
-- temp table (fără RLS) ca să pasăm id-ul rezervării către testul cross-org de mai jos.
-- creat ca postgres → trebuie grant explicit ca rolul `authenticated` să-l poată folosi.
create temp table _pay_ids (id uuid);
grant all on _pay_ids to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare
  v_booking uuid;
  v_total   numeric;
  v_price   numeric;
  v_status  text;
  v_paid    numeric;
begin
  -- rezervare nouă: 4 nopți × base_price 100 = 400, pe Camera 2, interval liber
  v_booking := public.create_booking(
    '30000000-0000-0000-0000-000000000001'::uuid,
    '2028-03-01', '2028-03-05',
    '50000000-0000-0000-0000-000000000001'::uuid,
    '40000000-0000-0000-0000-000000000002'::uuid);
  insert into _pay_ids values (v_booking);

  select total_amount, unit_price, payment_status, amount_paid
    into v_total, v_price, v_status, v_paid
    from bookings where id = v_booking;
  if v_price = 100 and v_total = 400 and v_status = 'unpaid' and v_paid = 0 then
    raise notice 'TEST 29 PASS: snapshot pret=100, total=400, unpaid la creare';
  else
    raise exception 'TEST 29 FAIL: price=% total=% status=% paid=%', v_price, v_total, v_status, v_paid;
  end if;

  -- 29a: plată parțială => partial
  perform public.record_payment(v_booking, 150, 'payment', 'cash');
  select payment_status, amount_paid into v_status, v_paid from bookings where id = v_booking;
  if v_status = 'partial' and v_paid = 150 then
    raise notice 'TEST 29a PASS: plata partiala => partial, paid=150';
  else raise exception 'TEST 29a FAIL: status=% paid=%', v_status, v_paid; end if;

  -- 29b: restul => paid
  perform public.record_payment(v_booking, 250, 'payment', 'card');
  select payment_status into v_status from bookings where id = v_booking;
  if v_status <> 'paid' then raise exception 'TEST 29b FAIL: status % (astept paid)', v_status; end if;
  raise notice 'TEST 29b PASS: plata integrala => paid';

  -- 29c: rambursare totală => refunded, amount_paid 0
  perform public.record_payment(v_booking, 400, 'refund', 'card');
  select payment_status, amount_paid into v_status, v_paid from bookings where id = v_booking;
  if v_status = 'refunded' and v_paid = 0 then
    raise notice 'TEST 29c PASS: rambursare totala => refunded, paid=0';
  else raise exception 'TEST 29c FAIL: status=% paid=%', v_status, v_paid; end if;

  -- 29d: 3 tranziții de stare în audit
  if (select count(*) from booking_events
      where booking_id = v_booking and event_type = 'payment_status') = 3 then
    raise notice 'TEST 29d PASS: 3 evenimente payment_status in istoric';
  else
    raise exception 'TEST 29d FAIL: % evenimente payment_status',
      (select count(*) from booking_events where booking_id = v_booking and event_type = 'payment_status');
  end if;

  -- 29e: rambursare > 0 cu suma invalidă => INVALID_AMOUNT
  begin
    perform public.record_payment(v_booking, 0, 'payment', 'cash');
    raise exception 'TEST 29e FAIL: suma 0 acceptată';
  exception when others then
    if sqlerrm like '%INVALID_AMOUNT%' then raise notice 'TEST 29e PASS: suma 0 => INVALID_AMOUNT';
    else raise; end if;
  end;
end $$;

-- ---------- TEST 30: get_revenue_summary (venit net azi) ----------
do $$
declare v_rev record;
begin
  -- pe proprietatea A: 150 + 250 încasat, 400 rambursat azi => net 0
  select * into v_rev from public.get_revenue_summary('20000000-0000-0000-0000-000000000001'::uuid);
  if v_rev.revenue_today = 0 and v_rev.currency = 'RON' then
    raise notice 'TEST 30 PASS: venit azi net = 0 (400 incasat - 400 rambursat), %', v_rev.currency;
  else
    raise exception 'TEST 30 FAIL: today=% currency=%', v_rev.revenue_today, v_rev.currency;
  end if;
end $$;
reset role;

-- ---------- TEST 31: record_payment cross-org => FORBIDDEN ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare v_b uuid;
begin
  select id into v_b from _pay_ids limit 1;  -- temp table, fără RLS
  begin
    perform public.record_payment(v_b, 100, 'payment', 'cash');
    raise exception 'TEST 31 FAIL: owner-b a inregistrat plata pe proprietatea A';
  exception when others then
    if sqlerrm like '%FORBIDDEN%' then raise notice 'TEST 31 PASS: record_payment cross-org => FORBIDDEN';
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 32: supraîncasare + recorded_by_email (Sprint 4.1) ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","email":"owner-a@test.ro"}';
do $$
declare v_b uuid; v_status text; v_paid numeric; v_total numeric; v_email text;
begin
  -- rezervare nouă (400), pe Camera 1, interval liber
  v_b := public.create_booking(
    '30000000-0000-0000-0000-000000000001'::uuid, '2028-06-01', '2028-06-05',
    '50000000-0000-0000-0000-000000000001'::uuid, '40000000-0000-0000-0000-000000000001'::uuid);
  select total_amount into v_total from bookings where id = v_b;

  -- încasăm 500 pe un total de 400 => amount_paid 500 > total, status rămâne 'paid'
  perform public.record_payment(v_b, 500, 'payment', 'card');
  select payment_status, amount_paid into v_status, v_paid from bookings where id = v_b;
  if v_paid = 500 and v_paid > v_total and v_status = 'paid' then
    raise notice 'TEST 32 PASS: supraincasare vizibila (amount_paid=500 > total=400, status paid)';
  else
    raise exception 'TEST 32 FAIL: paid=% total=% status=%', v_paid, v_total, v_status;
  end if;

  -- 32a: cine a consemnat plata (snapshot email din JWT)
  select recorded_by_email into v_email from payments where booking_id = v_b limit 1;
  if v_email = 'owner-a@test.ro' then
    raise notice 'TEST 32a PASS: recorded_by_email = %', v_email;
  else
    raise exception 'TEST 32a FAIL: recorded_by_email = %', v_email;
  end if;
end $$;
reset role;

-- ============================================================
-- Sprint 4.5 — Pricing Engine & Occupancy Model
-- ============================================================
-- tip dedicat pentru pricing (max 4 adulți / 2 copii) + o cameră, izolat de seed
insert into unit_types (id, org_id, property_id, name, max_adults, max_children, base_price)
values ('300000aa-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', 'Pricing', 4, 2, 100);
insert into units (id, org_id, property_id, unit_type_id, name)
values ('400000aa-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', '300000aa-0000-0000-0000-000000000001', 'Pricing 1');

-- ---------- TEST 33: validare occupancy (adulți/copii vs max) ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_b uuid; v_ad int; v_ch int; v_gc int;
begin
  -- 33a: în limite (2 adulți + 1 copil pe seed, max 2/1) => OK
  v_b := public.create_booking(
    '30000000-0000-0000-0000-000000000001'::uuid, '2029-02-01', '2029-02-03',
    '50000000-0000-0000-0000-000000000001'::uuid, null, 2, 1);
  select adults, children, guests_count into v_ad, v_ch, v_gc from bookings where id = v_b;
  if v_ad = 2 and v_ch = 1 and v_gc = 3 then
    raise notice 'TEST 33a PASS: adults=2 children=1 guests_count(generated)=3';
  else raise exception 'TEST 33a FAIL: adults=% children=% gc=%', v_ad, v_ch, v_gc; end if;

  -- 33b: prea mulți adulți => OCCUPANCY_EXCEEDED
  begin
    perform public.create_booking(
      '30000000-0000-0000-0000-000000000001'::uuid, '2029-03-01', '2029-03-03',
      '50000000-0000-0000-0000-000000000001'::uuid, null, 3, 0);
    raise exception 'TEST 33b FAIL: 3 adulți peste max 2 acceptat';
  exception when others then
    if sqlerrm like '%OCCUPANCY_EXCEEDED%' then raise notice 'TEST 33b PASS: adulți peste max => OCCUPANCY_EXCEEDED';
    else raise; end if;
  end;

  -- 33c: prea mulți copii => OCCUPANCY_EXCEEDED
  begin
    perform public.create_booking(
      '30000000-0000-0000-0000-000000000001'::uuid, '2029-03-01', '2029-03-03',
      '50000000-0000-0000-0000-000000000001'::uuid, null, 1, 2);
    raise exception 'TEST 33c FAIL: 2 copii peste max 1 acceptat';
  exception when others then
    if sqlerrm like '%OCCUPANCY_EXCEEDED%' then raise notice 'TEST 33c PASS: copii peste max => OCCUPANCY_EXCEEDED';
    else raise; end if;
  end;

  -- 33d: 0 adulți => respins (adults > 0)
  begin
    perform public.create_booking(
      '30000000-0000-0000-0000-000000000001'::uuid, '2029-03-01', '2029-03-03',
      '50000000-0000-0000-0000-000000000001'::uuid, null, 0, 1);
    raise exception 'TEST 33d FAIL: 0 adulți acceptat';
  exception when others then
    if sqlerrm like '%OCCUPANCY_EXCEEDED%' then raise notice 'TEST 33d PASS: 0 adulți => OCCUPANCY_EXCEEDED';
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 34: compute_price — fallback base (fără reguli, fără weekend) ----------
do $$
declare v_q jsonb;
begin
  v_q := app.compute_price('300000aa-0000-0000-0000-000000000001', '2029-01-05', '2029-01-08');
  if (v_q->>'total')::numeric = 300 and (v_q->>'avg_nightly')::numeric = 100
     and (v_q->>'night_count')::int = 3 and jsonb_array_length(v_q->'nights') = 3 then
    raise notice 'TEST 34 PASS: base fallback 3×100 = 300';
  else raise exception 'TEST 34 FAIL: %', v_q; end if;
end $$;

-- ---------- TEST 35: seasonal pricing ----------
do $$
declare v_q jsonb;
begin
  insert into rate_rules (org_id, property_id, unit_type_id, kind, name, start_date, end_date, price)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '300000aa-0000-0000-0000-000000000001','season','Sezon estival','2029-02-01','2029-02-28', 200);
  -- 3 nopți integral în sezon => 3×200
  v_q := app.compute_price('300000aa-0000-0000-0000-000000000001', '2029-02-10', '2029-02-13');
  if (v_q->>'total')::numeric = 600
     and (v_q->'nights'->0->>'kind') = 'season' then
    raise notice 'TEST 35 PASS: sezon 3×200 = 600';
  else raise exception 'TEST 35 FAIL: %', v_q; end if;
end $$;

-- ---------- TEST 36: override are prioritate peste season ----------
do $$
declare v_q jsonb;
begin
  insert into rate_rules (org_id, property_id, unit_type_id, kind, name, start_date, end_date, price)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '300000aa-0000-0000-0000-000000000001','override','Eveniment','2029-02-11','2029-02-11', 300);
  -- 10=200(season), 11=300(override), 12=200(season) => 700
  v_q := app.compute_price('300000aa-0000-0000-0000-000000000001', '2029-02-10', '2029-02-13');
  if (v_q->>'total')::numeric = 700
     and (v_q->'nights'->1->>'kind') = 'override'
     and (v_q->'nights'->1->>'rate')::numeric = 300 then
    raise notice 'TEST 36 PASS: override 300 bate sezonul 200 pe ziua respectivă';
  else raise exception 'TEST 36 FAIL: %', v_q; end if;
end $$;

-- ---------- TEST 37: la suprapunere în același kind câștigă cea mai RECENTĂ modificare ----------
do $$
declare v_q jsonb; v_low uuid;
begin
  insert into rate_rules (org_id, property_id, unit_type_id, kind, name, start_date, end_date, price)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '300000aa-0000-0000-0000-000000000001','season','Low','2029-04-01','2029-04-30', 180)
  returning id into v_low;
  -- a doua regulă, inserată mai târziu => updated_at mai recent => câștigă
  insert into rate_rules (org_id, property_id, unit_type_id, kind, name, start_date, end_date, price)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '300000aa-0000-0000-0000-000000000001','season','High','2029-04-10','2029-04-20', 250);
  v_q := app.compute_price('300000aa-0000-0000-0000-000000000001', '2029-04-15', '2029-04-16');
  if (v_q->>'total')::numeric <> 250 then raise exception 'TEST 37a FAIL: %', v_q; end if;
  raise notice 'TEST 37a PASS: cea mai recentă regulă (250) câștigă suprapunerea';

  -- modific regula veche => devine cea mai recentă => câștigă acum
  update rate_rules set price = 199 where id = v_low;
  v_q := app.compute_price('300000aa-0000-0000-0000-000000000001', '2029-04-15', '2029-04-16');
  if (v_q->>'total')::numeric = 199 then
    raise notice 'TEST 37b PASS: după modificare, regula re-modificată (199) devine cea aplicată';
  else raise exception 'TEST 37b FAIL: %', v_q; end if;
end $$;

-- ---------- TEST 38: weekend pricing (percent / amount / peste sezon) ----------
do $$
declare
  v_q jsonb; v_fri date; v_wed date;
begin
  -- prima vineri (dow=5) și prima miercuri (dow=3) din 2029-06-01
  v_fri := date '2029-06-01' + ((5 - extract(dow from date '2029-06-01')::int + 7) % 7);
  v_wed := date '2029-06-01' + ((3 - extract(dow from date '2029-06-01')::int + 7) % 7);

  -- 38a: percent +20% pe vineri/sâmbătă (default weekend_days {5,6})
  update unit_types set weekend_adjustment_type = 'percent', weekend_adjustment_value = 20
   where id = '300000aa-0000-0000-0000-000000000001';
  v_q := app.compute_price('300000aa-0000-0000-0000-000000000001', v_fri, v_fri + 1);
  if (v_q->>'total')::numeric = 120 and (v_q->'nights'->0->>'weekend')::boolean then
    raise notice 'TEST 38a PASS: vineri 100×1.2 = 120';
  else raise exception 'TEST 38a FAIL: %', v_q; end if;
  -- miercuri = neschimbat
  v_q := app.compute_price('300000aa-0000-0000-0000-000000000001', v_wed, v_wed + 1);
  if (v_q->>'total')::numeric = 100 then raise notice 'TEST 38b PASS: miercuri neschimbat 100';
  else raise exception 'TEST 38b FAIL: %', v_q; end if;

  -- 38c: amount +50 pe weekend
  update unit_types set weekend_adjustment_type = 'amount', weekend_adjustment_value = 50
   where id = '300000aa-0000-0000-0000-000000000001';
  v_q := app.compute_price('300000aa-0000-0000-0000-000000000001', v_fri, v_fri + 1);
  if (v_q->>'total')::numeric = 150 then raise notice 'TEST 38c PASS: vineri 100+50 = 150';
  else raise exception 'TEST 38c FAIL: %', v_q; end if;

  -- 38d: weekend = prioritate minimă → NU se aplică peste sezon (sezonul rămâne 200)
  insert into rate_rules (org_id, property_id, unit_type_id, kind, name, start_date, end_date, price)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '300000aa-0000-0000-0000-000000000001','season','S', v_fri, v_fri, 200);
  update unit_types set weekend_adjustment_type = 'percent', weekend_adjustment_value = 20
   where id = '300000aa-0000-0000-0000-000000000001';
  v_q := app.compute_price('300000aa-0000-0000-0000-000000000001', v_fri, v_fri + 1);
  if (v_q->>'total')::numeric = 200 and not (v_q->'nights'->0->>'weekend')::boolean then
    raise notice 'TEST 38d PASS: weekend nu se aplică peste sezon (rămâne 200)';
  else raise exception 'TEST 38d FAIL: %', v_q; end if;

  -- reset config weekend ca să nu afecteze testele următoare
  update unit_types set weekend_adjustment_type = 'none', weekend_adjustment_value = 0
   where id = '300000aa-0000-0000-0000-000000000001';
  delete from rate_rules where unit_type_id = '300000aa-0000-0000-0000-000000000001'
    and start_date = v_fri and end_date = v_fri;
end $$;

-- ---------- TEST 39: snapshot la creare = imuabil ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare
  v_b uuid; v_total numeric; v_bd jsonb; v_total_after numeric;
begin
  -- pe interval cu sezon activ (TEST 35: feb 200/noapte), 2 nopți => 400
  v_b := public.create_booking(
    '300000aa-0000-0000-0000-000000000001'::uuid, '2029-02-20', '2029-02-22',
    '50000000-0000-0000-0000-000000000001'::uuid, null, 2, 0);
  select total_amount, price_breakdown into v_total, v_bd from bookings where id = v_b;
  if v_total = 400 and jsonb_array_length(v_bd->'nights') = 2
     and (v_bd->'nights'->0->>'kind') = 'season' then
    raise notice 'TEST 39a PASS: snapshot total=400 + breakdown pe 2 nopți (sezon)';
  else raise exception 'TEST 39a FAIL: total=% bd=%', v_total, v_bd; end if;

  -- modificăm base_price-ul tipului => rezervarea NU se schimbă (snapshot imuabil)
  update unit_types set base_price = 999 where id = '300000aa-0000-0000-0000-000000000001';
  select total_amount into v_total_after from bookings where id = v_b;
  if v_total_after = 400 then
    raise notice 'TEST 39b PASS: snapshot imuabil după schimbarea base_price';
  else raise exception 'TEST 39b FAIL: total recalculat la %', v_total_after; end if;
  update unit_types set base_price = 100 where id = '300000aa-0000-0000-0000-000000000001';
end $$;
reset role;

-- ---------- TEST 40: public_get_availability — filtru ocupare + preț din engine ----------
do $$
declare v_pricing int; v_dubla int; v_ppn numeric;
begin
  -- adults=3: tipul Pricing (max 4) e rezervabil (reason NULL); Dubla standard (max 2)
  -- apare dar marcat reason=OCCUPANCY (lista arată toate camerele, cu motivul)
  select count(*) filter (where name = 'Pricing' and reason is null),
         count(*) filter (where name = 'Dubla standard' and reason = 'OCCUPANCY')
    into v_pricing, v_dubla
  from public.public_get_availability('hotel-test','2029-08-01','2029-08-04', 3, 0);
  if v_pricing = 1 and v_dubla = 1 then
    raise notice 'TEST 40a PASS: ocupare 3 adulți → Pricing rezervabil, Dubla cu reason=OCCUPANCY';
  else raise exception 'TEST 40a FAIL: pricing=% dubla=%', v_pricing, v_dubla; end if;

  -- preț/noapte vine din engine (base 100, fără reguli pe august)
  select price_per_night into v_ppn
  from public.public_get_availability('hotel-test','2029-08-01','2029-08-04', 2, 0)
  where name = 'Pricing';
  if v_ppn = 100 then raise notice 'TEST 40b PASS: price_per_night din engine = 100';
  else raise exception 'TEST 40b FAIL: ppn=%', v_ppn; end if;
end $$;

-- ---------- TEST 41: public_create_booking respinge ocuparea peste limită ----------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  begin
    perform public_create_booking('hotel-test','300000aa-0000-0000-0000-000000000001',
      '2029-09-01','2029-09-03','Over Booker','over@test.ro','0700000000', 5, 0, null);
    raise exception 'TEST 41 FAIL: 5 adulți peste max 4 acceptat public';
  exception when others then
    if sqlerrm like '%OCCUPANCY_EXCEEDED%' then raise notice 'TEST 41 PASS: public OCCUPANCY_EXCEEDED';
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 42: RLS pe rate_rules ----------
-- 42a: anon nu are select pe rate_rules
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
declare v int;
begin
  begin
    select count(*) into v from rate_rules;
    raise exception 'TEST 42a FAIL: anon a citit rate_rules!';
  exception when insufficient_privilege then
    raise notice 'TEST 42a PASS: anon fără select pe rate_rules';
  end;
end $$;
reset role;
-- 42b: userul org B nu vede / nu scrie rate_rules org A
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare v int;
begin
  select count(*) into v from rate_rules;
  if v <> 0 then raise exception 'TEST 42b FAIL: org B vede % reguli org A', v; end if;
  raise notice 'TEST 42b PASS: org B vede 0 rate_rules';
  begin
    insert into rate_rules (org_id, property_id, unit_type_id, kind, name, start_date, end_date, price)
    values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
            '300000aa-0000-0000-0000-000000000001','season','Intrus','2029-12-01','2029-12-10', 1);
    raise exception 'TEST 42c FAIL: org B a inserat o regulă în org A!';
  exception when insufficient_privilege then
    raise notice 'TEST 42c PASS: insert rate_rules cross-org respins (RLS)';
  when others then
    if sqlstate = '42501' then raise notice 'TEST 42c PASS: insert rate_rules cross-org respins (RLS)';
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 43: quote_price — acces, cross-org, anon ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_q jsonb;
begin
  v_q := public.quote_price('300000aa-0000-0000-0000-000000000001', '2029-01-05', '2029-01-08');
  if (v_q->>'total')::numeric = 300 then raise notice 'TEST 43a PASS: quote autorizat = 300';
  else raise exception 'TEST 43a FAIL: %', v_q; end if;
end $$;
-- 43b: cross-org => FORBIDDEN
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare v_q jsonb;
begin
  begin
    v_q := public.quote_price('300000aa-0000-0000-0000-000000000001', '2029-01-05', '2029-01-08');
    raise exception 'TEST 43b FAIL: quote cross-org permis';
  exception when others then
    if sqlerrm like '%FORBIDDEN%' then raise notice 'TEST 43b PASS: quote cross-org => FORBIDDEN';
    else raise; end if;
  end;
end $$;
reset role;
-- 43c: anon fără execute
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
declare v_q jsonb;
begin
  begin
    v_q := public.quote_price('300000aa-0000-0000-0000-000000000001', '2029-01-05', '2029-01-08');
    raise exception 'TEST 43c FAIL: anon a executat quote_price';
  exception when insufficient_privilege then
    raise notice 'TEST 43c PASS: anon fără execute pe quote_price';
  end;
end $$;
reset role;

-- ---------- TEST 44: get_rate_calendar — tarif per tip × zi ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_rows int; v_base_rate numeric; v_base_kind text;
begin
  -- fereastră fără reguli pe tipul Pricing => base 100, kind 'base', 3 nopți
  select count(*) into v_rows
  from public.get_rate_calendar('20000000-0000-0000-0000-000000000001', '2029-10-01', '2029-10-04')
  where unit_type_id = '300000aa-0000-0000-0000-000000000001';
  if v_rows <> 3 then raise exception 'TEST 44a FAIL: % rânduri (astept 3)', v_rows; end if;

  select rate, kind into v_base_rate, v_base_kind
  from public.get_rate_calendar('20000000-0000-0000-0000-000000000001', '2029-10-01', '2029-10-04')
  where unit_type_id = '300000aa-0000-0000-0000-000000000001' limit 1;
  if v_base_rate = 100 and v_base_kind = 'base' then
    raise notice 'TEST 44a PASS: calendar tarife = 100/base pe interval fără reguli';
  else raise exception 'TEST 44a FAIL: rate=% kind=%', v_base_rate, v_base_kind; end if;
end $$;
-- 44b: cross-org => FORBIDDEN
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare v int;
begin
  begin
    select count(*) into v from public.get_rate_calendar(
      '20000000-0000-0000-0000-000000000001', '2029-10-01', '2029-10-04');
    raise exception 'TEST 44b FAIL: get_rate_calendar cross-org permis';
  exception when others then
    if sqlerrm like '%FORBIDDEN%' then raise notice 'TEST 44b PASS: get_rate_calendar cross-org => FORBIDDEN';
    else raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- Sprint 4.6 — Reservation Rules Engine (min/max stay, stay_rules, closures)
-- ============================================================
-- tip dedicat: min_stay 3 / max_stay 5, max 4 adulți / 2 copii, o cameră, izolat
insert into unit_types (id, org_id, property_id, name, max_adults, max_children,
                        base_price, min_stay, max_stay)
values ('300000bb-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', 'StayRules', 4, 2, 100, 3, 5);
insert into units (id, org_id, property_id, unit_type_id, name)
values ('400000bb-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', '300000bb-0000-0000-0000-000000000001', 'Stay 1');

-- ---------- TEST 45: min stay global (admin + public) ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_b uuid;
begin
  -- 45a: 2 nopți sub min_stay 3 => STAY_TOO_SHORT
  begin
    perform public.create_booking('300000bb-0000-0000-0000-000000000001'::uuid,
      '2031-05-10','2031-05-12','50000000-0000-0000-0000-000000000001'::uuid, null, 2, 0);
    raise exception 'TEST 45a FAIL: 2 nopți sub min_stay acceptat';
  exception when others then
    if sqlerrm like '%STAY_TOO_SHORT%' then raise notice 'TEST 45a PASS: 2 nopți < min 3 => STAY_TOO_SHORT';
    else raise; end if;
  end;

  -- 45b: exact 3 nopți => OK
  v_b := public.create_booking('300000bb-0000-0000-0000-000000000001'::uuid,
    '2031-05-01','2031-05-04','50000000-0000-0000-0000-000000000001'::uuid, null, 2, 0);
  if v_b is not null then raise notice 'TEST 45b PASS: 3 nopți = min_stay => OK';
  else raise exception 'TEST 45b FAIL: rezervarea nu s-a creat'; end if;
end $$;
reset role;

-- 45c: min stay aplicat și pe fluxul public
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  begin
    perform public_create_booking('hotel-test','300000bb-0000-0000-0000-000000000001',
      '2031-05-20','2031-05-22','Short Stay','short@test.ro','0700000001', 2, 0, null);
    raise exception 'TEST 45c FAIL: public a acceptat 2 nopți sub min_stay';
  exception when others then
    if sqlerrm like '%STAY_TOO_SHORT%' then raise notice 'TEST 45c PASS: public STAY_TOO_SHORT';
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 46: max stay global ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
begin
  -- 6 nopți peste max_stay 5 => STAY_TOO_LONG
  begin
    perform public.create_booking('300000bb-0000-0000-0000-000000000001'::uuid,
      '2031-06-01','2031-06-07','50000000-0000-0000-0000-000000000001'::uuid, null, 2, 0);
    raise exception 'TEST 46 FAIL: 6 nopți peste max_stay acceptat';
  exception when others then
    if sqlerrm like '%STAY_TOO_LONG%' then raise notice 'TEST 46 PASS: 6 nopți > max 5 => STAY_TOO_LONG';
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 47: stay_rules pe perioadă (cheiat pe data de check-in) ----------
do $$
begin
  -- regulă: min_stay 5 pe martie 2031 (suprascrie globalul min 3)
  insert into stay_rules (org_id, property_id, unit_type_id, name, start_date, end_date, min_stay)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '300000bb-0000-0000-0000-000000000001','Min 5 martie','2031-03-01','2031-03-31', 5);
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_b uuid;
begin
  -- 47a: check-in în interval, 4 nopți < 5 (regula) => STAY_TOO_SHORT
  begin
    perform public.create_booking('300000bb-0000-0000-0000-000000000001'::uuid,
      '2031-03-10','2031-03-14','50000000-0000-0000-0000-000000000001'::uuid, null, 2, 0);
    raise exception 'TEST 47a FAIL: 4 nopți sub regula de perioadă acceptat';
  exception when others then
    if sqlerrm like '%STAY_TOO_SHORT%' then raise notice 'TEST 47a PASS: regula de perioadă (min 5) aplicată pe check-in';
    else raise; end if;
  end;

  -- 47b: check-in în afara intervalului, 4 nopți => revine la globalul tipului (min 3) => OK
  v_b := public.create_booking('300000bb-0000-0000-0000-000000000001'::uuid,
    '2031-04-10','2031-04-14','50000000-0000-0000-0000-000000000001'::uuid, null, 2, 0);
  if v_b is not null then raise notice 'TEST 47b PASS: în afara regulii, revine la min global (3) => OK';
  else raise exception 'TEST 47b FAIL: rezervarea nu s-a creat'; end if;
end $$;
reset role;

-- ---------- TEST 48: get_stay_constraints (global vs regulă; cross-org; anon) ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v jsonb;
begin
  -- 48a: în afara regulii => global 3/5
  v := public.get_stay_constraints('300000bb-0000-0000-0000-000000000001', '2031-04-10');
  if (v->>'min_stay')::int = 3 and (v->>'max_stay')::int = 5 then
    raise notice 'TEST 48a PASS: constrângeri globale 3/5';
  else raise exception 'TEST 48a FAIL: %', v; end if;

  -- 48b: în interval (regula min 5) => 5/5
  v := public.get_stay_constraints('300000bb-0000-0000-0000-000000000001', '2031-03-10');
  if (v->>'min_stay')::int = 5 and (v->>'max_stay')::int = 5 then
    raise notice 'TEST 48b PASS: regula de perioadă rezolvată (5/5)';
  else raise exception 'TEST 48b FAIL: %', v; end if;
end $$;
-- 48c: cross-org => FORBIDDEN
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare v jsonb;
begin
  begin
    v := public.get_stay_constraints('300000bb-0000-0000-0000-000000000001', '2031-04-10');
    raise exception 'TEST 48c FAIL: get_stay_constraints cross-org permis';
  exception when others then
    if sqlerrm like '%FORBIDDEN%' then raise notice 'TEST 48c PASS: get_stay_constraints cross-org => FORBIDDEN';
    else raise; end if;
  end;
end $$;
reset role;
-- 48d: anon fără execute
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
declare v jsonb;
begin
  begin
    v := public.get_stay_constraints('300000bb-0000-0000-0000-000000000001', '2031-04-10');
    raise exception 'TEST 48d FAIL: anon a executat get_stay_constraints';
  exception when insufficient_privilege then
    raise notice 'TEST 48d PASS: anon fără execute pe get_stay_constraints';
  end;
end $$;
reset role;

-- ---------- TEST 49: closures property-scope (stop-sell pe toată proprietatea) ----------
do $$
begin
  insert into closures (org_id, property_id, unit_type_id, start_date, end_date, reason)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          null, '2031-07-01','2031-07-31', 'seasonal');
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
begin
  -- 49a: rezervare în interval (orice tip) => DATES_CLOSED
  begin
    perform public.create_booking('300000bb-0000-0000-0000-000000000001'::uuid,
      '2031-07-10','2031-07-13','50000000-0000-0000-0000-000000000001'::uuid, null, 2, 0);
    raise exception 'TEST 49a FAIL: rezervare în interval închis acceptată';
  exception when others then
    if sqlerrm like '%DATES_CLOSED%' then raise notice 'TEST 49a PASS: property-scope closure => DATES_CLOSED';
    else raise; end if;
  end;
end $$;
reset role;
-- 49b: în interval închis NIMIC nu e rezervabil (toate reason=CLOSED); în afară DA
do $$
declare v_in int; v_out int;
begin
  -- niciun tip rezervabil în interval (reason NULL = 0); toate marcate CLOSED
  select count(*) filter (where reason is null) into v_in
  from public.public_get_availability('hotel-test','2031-07-10','2031-07-13', 1, 0);
  select count(*) filter (where reason is null) into v_out
  from public.public_get_availability('hotel-test','2031-08-10','2031-08-13', 1, 0);
  if v_in = 0 and v_out > 0 then
    raise notice 'TEST 49b PASS: nimic rezervabil în interval închis, rezervabil în afară';
  else raise exception 'TEST 49b FAIL: rezervabile in=% out=%', v_in, v_out; end if;
end $$;
-- curățăm închiderea property-scope ca să nu afecteze testul de type-scope
do $$ begin
  delete from closures where property_id = '20000000-0000-0000-0000-000000000001'
    and unit_type_id is null and start_date = '2031-07-01';
end $$;

-- ---------- TEST 50: closures type-scope (doar un tip închis) ----------
do $$
begin
  insert into closures (org_id, property_id, unit_type_id, start_date, end_date, reason)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '300000bb-0000-0000-0000-000000000001', '2031-09-01','2031-09-30', 'event');
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_b uuid;
begin
  -- 50a: tipul închis => DATES_CLOSED
  begin
    perform public.create_booking('300000bb-0000-0000-0000-000000000001'::uuid,
      '2031-09-10','2031-09-13','50000000-0000-0000-0000-000000000001'::uuid, null, 2, 0);
    raise exception 'TEST 50a FAIL: tip închis acceptat';
  exception when others then
    if sqlerrm like '%DATES_CLOSED%' then raise notice 'TEST 50a PASS: type-scope closure => DATES_CLOSED';
    else raise; end if;
  end;

  -- 50b: alt tip (Pricing) în același interval => OK (nu e închis)
  v_b := public.create_booking('300000aa-0000-0000-0000-000000000001'::uuid,
    '2031-09-10','2031-09-12','50000000-0000-0000-0000-000000000001'::uuid, null, 2, 0);
  if v_b is not null then raise notice 'TEST 50b PASS: alt tip rămâne deschis în același interval';
  else raise exception 'TEST 50b FAIL: alt tip respins'; end if;
end $$;
reset role;
do $$ begin
  delete from closures where unit_type_id = '300000bb-0000-0000-0000-000000000001';
end $$;

-- ---------- TEST 51: RLS pe stay_rules + closures ----------
-- 51a: anon fără select pe stay_rules / closures
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
declare v int;
begin
  begin
    select count(*) into v from stay_rules;
    raise exception 'TEST 51a FAIL: anon a citit stay_rules!';
  exception when insufficient_privilege then
    begin
      select count(*) into v from closures;
      raise exception 'TEST 51a FAIL: anon a citit closures!';
    exception when insufficient_privilege then
      raise notice 'TEST 51a PASS: anon fără select pe stay_rules + closures';
    end;
  end;
end $$;
reset role;
-- 51b: userul org B nu vede / nu scrie regulile org A
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare v_s int; v_c int;
begin
  select count(*) into v_s from stay_rules;
  select count(*) into v_c from closures;
  if v_s <> 0 or v_c <> 0 then
    raise exception 'TEST 51b FAIL: org B vede stay_rules=% closures=% org A', v_s, v_c;
  end if;
  raise notice 'TEST 51b PASS: org B vede 0 stay_rules + 0 closures';
  begin
    insert into stay_rules (org_id, property_id, unit_type_id, name, start_date, end_date, min_stay)
    values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
            '300000bb-0000-0000-0000-000000000001','Intrus','2031-12-01','2031-12-10', 2);
    raise exception 'TEST 51c FAIL: org B a inserat un stay_rule în org A!';
  exception when insufficient_privilege then
    raise notice 'TEST 51c PASS: insert stay_rules cross-org respins (RLS)';
  when others then
    if sqlstate = '42501' then raise notice 'TEST 51c PASS: insert stay_rules cross-org respins (RLS)';
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 52: regresie occupancy (neschimbată de noile reguli) ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
begin
  -- 5 adulți peste max 4 pe tipul StayRules => OCCUPANCY_EXCEEDED (chiar cu durată validă)
  begin
    perform public.create_booking('300000bb-0000-0000-0000-000000000001'::uuid,
      '2031-10-01','2031-10-04','50000000-0000-0000-0000-000000000001'::uuid, null, 5, 0);
    raise exception 'TEST 52 FAIL: 5 adulți peste max 4 acceptat';
  exception when others then
    if sqlerrm like '%OCCUPANCY_EXCEEDED%' then raise notice 'TEST 52 PASS: occupancy neschimbat (OCCUPANCY_EXCEEDED)';
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 53: stay_rules — recență la suprapunere (cea mai recentă câștigă) ----------
do $$
declare v_stay record; v_old uuid;
begin
  -- tip izolat pentru recență (global min 1 / max 30)
  insert into unit_types (id, org_id, property_id, name, max_adults, max_children, base_price)
  values ('300000cc-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
          '20000000-0000-0000-0000-000000000001','StayRecency', 2, 0, 100);

  -- două reguli care se suprapun pe 2032-01-15
  insert into stay_rules (org_id, property_id, unit_type_id, name, start_date, end_date, min_stay)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '300000cc-0000-0000-0000-000000000001','Veche','2032-01-01','2032-01-31', 2)
  returning id into v_old;
  insert into stay_rules (org_id, property_id, unit_type_id, name, start_date, end_date, min_stay)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '300000cc-0000-0000-0000-000000000001','Noua','2032-01-10','2032-01-20', 7);

  -- 53a: cea mai recent inserată (min 7) câștigă
  select * into v_stay from app.resolve_stay('300000cc-0000-0000-0000-000000000001', '2032-01-15');
  if v_stay.min_stay = 7 then raise notice 'TEST 53a PASS: cea mai recentă regulă (min 7) câștigă';
  else raise exception 'TEST 53a FAIL: min_stay=%', v_stay.min_stay; end if;

  -- 53b: modific regula veche => devine cea mai recentă => câștigă acum (min 2)
  update stay_rules set min_stay = 2 where id = v_old;
  select * into v_stay from app.resolve_stay('300000cc-0000-0000-0000-000000000001', '2032-01-15');
  if v_stay.min_stay = 2 then raise notice 'TEST 53b PASS: după re-modificare, regula veche (min 2) devine cea aplicată';
  else raise exception 'TEST 53b FAIL: min_stay=%', v_stay.min_stay; end if;
end $$;

-- ---------- TEST 54: audit unit_types — durată sejur + config weekend ----------
do $$
declare v_type uuid; v_ev record;
begin
  insert into unit_types (org_id, property_id, name, max_adults, max_children, base_price, min_stay, max_stay)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          'Audit 4.6', 2, 0, 100, 2, 10)
  returning id into v_type;

  -- 54a: created include min/max stay + config weekend
  if not exists (select 1 from unit_type_events
                 where unit_type_id = v_type and event_type = 'created'
                   and (new_data->>'min_stay')::int = 2 and (new_data->>'max_stay')::int = 10
                   and new_data ? 'weekend_adjustment_type' and new_data ? 'weekend_days') then
    raise exception 'TEST 54a FAIL: created fără min/max stay sau config weekend';
  end if;
  raise notice 'TEST 54a PASS: created include durată sejur + weekend';

  -- 54b: schimbare min_stay => updated cu diff pe min_stay
  update unit_types set min_stay = 3 where id = v_type;
  select * into v_ev from unit_type_events
   where unit_type_id = v_type and event_type = 'updated' order by created_at desc limit 1;
  if (v_ev.old_data->>'min_stay')::int = 2 and (v_ev.new_data->>'min_stay')::int = 3 then
    raise notice 'TEST 54b PASS: updated cu diff pe min_stay (2 → 3)';
  else raise exception 'TEST 54b FAIL: old=% new=%', v_ev.old_data, v_ev.new_data; end if;

  -- 54c: schimbare config weekend => updated cu diff pe weekend (înainte: nu se auditau)
  -- (cele două update-uri din acest bloc împart created_at = now(); verificăm prin EXISTS,
  --  nu „ultimul eveniment", ca să nu depindem de o ordonare ambiguă)
  update unit_types set weekend_adjustment_type = 'percent', weekend_adjustment_value = 15,
                        weekend_days = '{6,0}' where id = v_type;
  if exists (select 1 from unit_type_events
             where unit_type_id = v_type and event_type = 'updated'
               and new_data ? 'weekend_adjustment_type'
               and (new_data->>'weekend_adjustment_value')::numeric = 15
               and new_data ? 'weekend_days') then
    raise notice 'TEST 54c PASS: config weekend auditat (type/value/days)';
  else raise exception 'TEST 54c FAIL: lipsește evenimentul cu config weekend'; end if;
end $$;

-- ============================================================
-- Sprint 4.7 — Stay Restrictions (arrival/departure, CTA/CTD, gap, override)
-- ============================================================
-- tip dedicat pe proprietatea publicată 'hotel-test', 2 camere, turnover 0 inițial
insert into unit_types (id, org_id, property_id, name, max_adults, max_children,
                        base_price, turnover_days)
values ('300000ee-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', 'Arrivals', 2, 1, 100, 0);
insert into units (id, org_id, property_id, unit_type_id, name) values
  ('400000ee-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '300000ee-0000-0000-0000-000000000001', 'Arr 1'),
  ('400000ee-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '300000ee-0000-0000-0000-000000000001', 'Arr 2');
-- membru 'staff' (fără drept de override) în org A
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000e', 'staff-a@test.ro');
insert into organization_members (org_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000e', 'staff');

-- reguli de sosire/plecare (insert direct = superuser, bypass RLS pentru fixture)
do $$
begin
  -- R1: fără sosiri în ziua DOW a lui 2034-09-15, în septembrie 2034 (DOW restriction)
  insert into arrival_rules (org_id, property_id, unit_type_id, name, start_date, end_date, weekdays, no_arrival)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '300000ee-0000-0000-0000-000000000001','Fără sosiri DOW','2034-09-01','2034-09-30',
          array[extract(dow from date '2034-09-15')::int], true);
  -- R2: fără plecări în ziua DOW a lui 2034-10-20, în octombrie 2034
  insert into arrival_rules (org_id, property_id, unit_type_id, name, start_date, end_date, weekdays, no_departure)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '300000ee-0000-0000-0000-000000000001','Fără plecări DOW','2034-10-01','2034-10-31',
          array[extract(dow from date '2034-10-20')::int], true);
  -- R3: CTA pe dată fixă 2034-12-20 (weekdays null = toată perioada)
  insert into arrival_rules (org_id, property_id, unit_type_id, name, start_date, end_date, no_arrival)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '300000ee-0000-0000-0000-000000000001','CTA 20 dec','2034-12-20','2034-12-20', true);
  -- R4: CTD pe dată fixă 2034-12-31
  insert into arrival_rules (org_id, property_id, unit_type_id, name, start_date, end_date, no_departure)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '300000ee-0000-0000-0000-000000000001','CTD 31 dec','2034-12-31','2034-12-31', true);
end $$;

-- ---------- TEST 55: restricție de sosire pe zi a săptămânii (DOW) ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_b uuid;
begin
  -- 55a: sosire în ziua interzisă => NO_ARRIVAL
  begin
    perform public.create_booking('300000ee-0000-0000-0000-000000000001'::uuid,
      '2034-09-15','2034-09-17','50000000-0000-0000-0000-000000000001'::uuid);
    raise exception 'TEST 55a FAIL: sosire în zi interzisă acceptată';
  exception when others then
    if sqlerrm like '%NO_ARRIVAL%' then raise notice 'TEST 55a PASS: sosire DOW interzisă => NO_ARRIVAL';
    else raise; end if;
  end;
  -- 55b: sosire în zi permisă (ziua următoare, alt DOW) => OK
  v_b := public.create_booking('300000ee-0000-0000-0000-000000000001'::uuid,
    '2034-09-16','2034-09-18','50000000-0000-0000-0000-000000000001'::uuid);
  if v_b is not null then raise notice 'TEST 55b PASS: sosire în zi permisă => OK';
  else raise exception 'TEST 55b FAIL: rezervarea nu s-a creat'; end if;
end $$;
reset role;

-- ---------- TEST 56: restricție de plecare pe zi a săptămânii (DOW) ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
begin
  -- plecare în ziua DOW interzisă => NO_DEPARTURE
  begin
    perform public.create_booking('300000ee-0000-0000-0000-000000000001'::uuid,
      '2034-10-18','2034-10-20','50000000-0000-0000-0000-000000000001'::uuid);
    raise exception 'TEST 56 FAIL: plecare în zi interzisă acceptată';
  exception when others then
    if sqlerrm like '%NO_DEPARTURE%' then raise notice 'TEST 56 PASS: plecare DOW interzisă => NO_DEPARTURE';
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 57: CTA / CTD pe dată fixă (weekdays null) ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_b uuid;
begin
  -- 57a: CTA 20 dec => NO_ARRIVAL
  begin
    perform public.create_booking('300000ee-0000-0000-0000-000000000001'::uuid,
      '2034-12-20','2034-12-22','50000000-0000-0000-0000-000000000001'::uuid);
    raise exception 'TEST 57a FAIL: sosire pe CTA acceptată';
  exception when others then
    if sqlerrm like '%NO_ARRIVAL%' then raise notice 'TEST 57a PASS: CTA pe dată fixă => NO_ARRIVAL';
    else raise; end if;
  end;
  -- 57b: sosire pe 21 dec (în afara CTA) => OK
  v_b := public.create_booking('300000ee-0000-0000-0000-000000000001'::uuid,
    '2034-12-21','2034-12-23','50000000-0000-0000-0000-000000000001'::uuid);
  if v_b is not null then raise notice 'TEST 57b PASS: sosire în afara CTA => OK';
  else raise exception 'TEST 57b FAIL: rezervarea nu s-a creat'; end if;
  -- 57c: CTD 31 dec => NO_DEPARTURE
  begin
    perform public.create_booking('300000ee-0000-0000-0000-000000000001'::uuid,
      '2034-12-28','2034-12-31','50000000-0000-0000-0000-000000000001'::uuid);
    raise exception 'TEST 57c FAIL: plecare pe CTD acceptată';
  exception when others then
    if sqlerrm like '%NO_DEPARTURE%' then raise notice 'TEST 57c PASS: CTD pe dată fixă => NO_DEPARTURE';
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 58: Manager Override (owner bypass; staff interzis) ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_b uuid;
begin
  -- 58a: owner cu override forțează sosirea pe CTA
  v_b := public.create_booking(
    p_unit_type_id => '300000ee-0000-0000-0000-000000000001'::uuid,
    p_check_in => '2034-12-20', p_check_out => '2034-12-22',
    p_guest_id => '50000000-0000-0000-0000-000000000001'::uuid,
    p_override => true);
  if v_b is not null then raise notice 'TEST 58a PASS: Manager Override creează rezervarea peste CTA';
  else raise exception 'TEST 58a FAIL: override nu a creat rezervarea'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000e","role":"authenticated"}';
do $$
begin
  -- 58b: staff NU poate folosi override => OVERRIDE_FORBIDDEN
  begin
    perform public.create_booking(
      p_unit_type_id => '300000ee-0000-0000-0000-000000000001'::uuid,
      p_check_in => '2034-12-20', p_check_out => '2034-12-22',
      p_guest_id => '50000000-0000-0000-0000-000000000001'::uuid,
      p_override => true);
    raise exception 'TEST 58b FAIL: staff a putut folosi override';
  exception when others then
    if sqlerrm like '%OVERRIDE_FORBIDDEN%' then raise notice 'TEST 58b PASS: staff fără override => OVERRIDE_FORBIDDEN';
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 59: validate_booking (toate motivele soft, errors[]) + anon ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v jsonb;
begin
  -- 59a: pe CTA => errors conține NO_ARRIVAL
  v := public.validate_booking('300000ee-0000-0000-0000-000000000001', '2034-12-20', '2034-12-22');
  if v->'errors' @> '["NO_ARRIVAL"]'::jsonb then
    raise notice 'TEST 59a PASS: validate_booking raportează NO_ARRIVAL';
  else raise exception 'TEST 59a FAIL: %', v; end if;
  -- 59b: dată curată => fără cod de sosire/plecare în errors
  v := public.validate_booking('300000ee-0000-0000-0000-000000000001', '2034-11-05', '2034-11-07');
  if not (v->'errors' @> '["NO_ARRIVAL"]'::jsonb) and not (v->'errors' @> '["NO_DEPARTURE"]'::jsonb) then
    raise notice 'TEST 59b PASS: dată fără restricții de sosire/plecare';
  else raise exception 'TEST 59b FAIL: %', v; end if;
end $$;
reset role;

-- 59c: anon nu are execute pe validate_booking (aserție pe privilegiu —
--      NU apelăm funcția: în acest build Postgres, un apel revocat sub rolul anon
--      poate declanșa un segfault JIT; calea e oricum inaccesibilă în producție)
do $$
begin
  if has_function_privilege('anon',
       'public.validate_booking(uuid,date,date,int,int,uuid,text,boolean)', 'execute') then
    raise exception 'TEST 59c FAIL: anon are execute pe validate_booking';
  end if;
  raise notice 'TEST 59c PASS: anon fără execute pe validate_booking';
end $$;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
declare v int;
begin
  -- 59d: anon nu poate citi arrival_rules (RLS, fără grant anon)
  begin
    select count(*) into v from public.arrival_rules;
    raise exception 'TEST 59d FAIL: anon a citit arrival_rules';
  exception when insufficient_privilege then
    raise notice 'TEST 59d PASS: anon fără select pe arrival_rules';
  end;
end $$;
reset role;

-- 59e: izolare cross-tenant (owner org B nu vede regulile org A)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
begin
  if not exists (select 1 from public.arrival_rules
                 where property_id = '20000000-0000-0000-0000-000000000001') then
    raise notice 'TEST 59e PASS: org B nu vede arrival_rules org A';
  else raise exception 'TEST 59e FAIL: leak cross-tenant arrival_rules'; end if;
end $$;
reset role;

-- ---------- TEST 60: flux public — restricția e HARD + filtru availability ----------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
declare v_cnt int;
begin
  -- 60a: public nu poate sosi pe CTA (fără override pe flux public)
  begin
    perform public_create_booking('hotel-test','300000ee-0000-0000-0000-000000000001',
      '2034-12-20','2034-12-22','Public CTA','publiccta@test.ro','0700000099', 1, 0, null);
    raise exception 'TEST 60a FAIL: public a sosit pe CTA';
  exception when others then
    if sqlerrm like '%NO_ARRIVAL%' then raise notice 'TEST 60a PASS: public CTA => NO_ARRIVAL';
    else raise; end if;
  end;
  -- 60b: availability ÎNTOARCE tipul cu sosirea închisă, dar marcat reason=NO_ARRIVAL
  --       (nu mai filtrează — afișează toate camerele cu motivul, à la Booking.com)
  select count(*) into v_cnt from public.public_get_availability('hotel-test','2034-12-20','2034-12-22')
   where unit_type_id = '300000ee-0000-0000-0000-000000000001' and reason = 'NO_ARRIVAL';
  if v_cnt = 1 then raise notice 'TEST 60b PASS: tip cu CTA prezent cu reason=NO_ARRIVAL';
  else raise exception 'TEST 60b FAIL: tipul cu CTA n-are reason=NO_ARRIVAL'; end if;
  -- 60c: pe dată curată, tipul e rezervabil (reason NULL)
  select count(*) into v_cnt from public.public_get_availability('hotel-test','2034-11-05','2034-11-07')
   where unit_type_id = '300000ee-0000-0000-0000-000000000001' and reason is null;
  if v_cnt = 1 then raise notice 'TEST 60c PASS: tip rezervabil pe dată curată (reason NULL)';
  else raise exception 'TEST 60c FAIL: tipul nu e rezervabil pe dată curată'; end if;
end $$;
reset role;

-- ---------- TEST 61: gap de curățenie (turnover_days) — fizic, per unitate ----------
update unit_types set turnover_days = 2 where id = '300000ee-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_a uuid; v_b uuid;
begin
  -- A pe Arr 1: 10–13 iulie 2034
  v_a := public.create_booking('300000ee-0000-0000-0000-000000000001'::uuid,
    '2034-07-10','2034-07-13','50000000-0000-0000-0000-000000000001'::uuid,
    '400000ee-0000-0000-0000-000000000001'::uuid);
  -- 61a: B pe Arr 1 cu gap 1 (< turnover 2) => UNIT_NOT_AVAILABLE
  begin
    perform public.create_booking('300000ee-0000-0000-0000-000000000001'::uuid,
      '2034-07-14','2034-07-16','50000000-0000-0000-0000-000000000001'::uuid,
      '400000ee-0000-0000-0000-000000000001'::uuid);
    raise exception 'TEST 61a FAIL: gap insuficient acceptat';
  exception when others then
    if sqlerrm like '%UNIT_NOT_AVAILABLE%' then raise notice 'TEST 61a PASS: gap 1 < turnover 2 => UNIT_NOT_AVAILABLE';
    else raise; end if;
  end;
  -- 61b: B pe Arr 1 cu gap exact 2 => OK
  v_b := public.create_booking('300000ee-0000-0000-0000-000000000001'::uuid,
    '2034-07-15','2034-07-17','50000000-0000-0000-0000-000000000001'::uuid,
    '400000ee-0000-0000-0000-000000000001'::uuid);
  if v_b is not null then raise notice 'TEST 61b PASS: gap 2 = turnover => OK';
  else raise exception 'TEST 61b FAIL: rezervarea cu gap suficient nu s-a creat'; end if;
end $$;
reset role;

-- 61c: get_available_units reflectă gap-ul (Arr 1 ocupată pentru date adiacente)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_free boolean;
begin
  select is_free into v_free from public.get_available_units(
    '300000ee-0000-0000-0000-000000000001','2034-07-14','2034-07-16')
   where unit_id = '400000ee-0000-0000-0000-000000000001';
  if v_free = false then raise notice 'TEST 61c PASS: get_available_units marchează gap-ul ca ocupat';
  else raise exception 'TEST 61c FAIL: gap-ul nu se reflectă în get_available_units'; end if;
end $$;
reset role;
update unit_types set turnover_days = 0 where id = '300000ee-0000-0000-0000-000000000001';

-- ============================================================
-- Sprint 4.8 — Promotions & Commercial Rules
-- ============================================================
-- tip dedicat (base 100, 2 camere) pe proprietatea publicată 'hotel-test'
insert into unit_types (id, org_id, property_id, name, max_adults, max_children, base_price)
values ('300000ff-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', 'Promo', 2, 1, 100);
insert into units (id, org_id, property_id, unit_type_id, name) values
  ('400000ff-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '300000ff-0000-0000-0000-000000000001', 'Promo 1'),
  ('400000ff-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '300000ff-0000-0000-0000-000000000001', 'Promo 2');

-- promoții (insert direct = superuser, bypass RLS pentru fixture)
do $$
declare v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid; v_p6 uuid; v_ps uuid;
begin
  -- P1: cod SUMMER10, -10%
  insert into promotions (org_id, property_id, name, code, discount_type, discount_value)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          'Vara','SUMMER10','percent',10) returning id into v_p1;
  -- P2: early booking automat (min_advance_days 60), -15%
  insert into promotions (org_id, property_id, name, discount_type, discount_value)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          'Early','percent',15) returning id into v_p2;
  insert into promotion_rules (promotion_id, rule_type, value) values (v_p2, 'min_advance_days', 60);
  -- P3: stay discount automat (min_nights 7), -10%
  insert into promotions (org_id, property_id, name, discount_type, discount_value)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          'Stay7','percent',10) returning id into v_p3;
  insert into promotion_rules (promotion_id, rule_type, value) values (v_p3, 'min_nights', 7);
  -- P4: long stay automat (min_nights 30), -25%
  insert into promotions (org_id, property_id, name, discount_type, discount_value)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          'Long30','percent',25) returning id into v_p4;
  insert into promotion_rules (promotion_id, rule_type, value) values (v_p4, 'min_nights', 30);
  -- P5: cod LIMITED, -50%, max 1 utilizare
  insert into promotions (org_id, property_id, name, code, discount_type, discount_value, max_uses)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          'Limitat','LIMITED','percent',50,1) returning id into v_p5;
  -- P6: last minute automat (max_advance_hours 72), -20%
  insert into promotions (org_id, property_id, name, discount_type, discount_value)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          'LastMin','percent',20) returning id into v_p6;
  insert into promotion_rules (promotion_id, rule_type, value) values (v_p6, 'max_advance_hours', 72);
  -- P_scoped: cod SCOPED legat de ALT tip (300000ee) → nu se aplică pe tipul Promo
  insert into promotions (org_id, property_id, unit_type_id, name, code, discount_type, discount_value)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '300000ee-0000-0000-0000-000000000001','Scoped','SCOPED','percent',30) returning id into v_ps;
end $$;

-- ---------- TEST 62: cod promo (percent) — reducere + snapshot ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_id uuid; v_b record;
begin
  -- dată „neutră" (la 10 zile): nicio automată nu se potrivește (early ≥60z, last-minute ≤72h)
  -- → testăm codul pur, fără best-of
  v_id := public.create_booking('300000ff-0000-0000-0000-000000000001'::uuid,
    current_date + 10, current_date + 12, '50000000-0000-0000-0000-000000000001'::uuid,
    null, 2, 0, 'confirmed', null, false, 'SUMMER10');
  select total_amount, discount_amount, promotion_id, (price_breakdown->>'subtotal')::numeric as sub
    into v_b from bookings where id = v_id;
  if v_b.discount_amount = round(v_b.sub * 0.10, 2)
     and v_b.total_amount = v_b.sub - v_b.discount_amount
     and v_b.promotion_id is not null then
    raise notice 'TEST 62 PASS: cod -10%% aplicat (subtotal %, discount %, total %)', v_b.sub, v_b.discount_amount, v_b.total_amount;
  else raise exception 'TEST 62 FAIL: sub=% disc=% total=% promo=%', v_b.sub, v_b.discount_amount, v_b.total_amount, v_b.promotion_id; end if;
  -- usage incrementat
  if (select uses_count from promotions where code = 'SUMMER10') = 1 then
    raise notice 'TEST 62b PASS: uses_count incrementat la 1';
  else raise exception 'TEST 62b FAIL: uses_count=%', (select uses_count from promotions where code = 'SUMMER10'); end if;
end $$;
reset role;

-- ---------- TEST 63: promoție automată (early booking) fără cod ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_id uuid; v_b record;
begin
  -- 2 nopți, 2035 (advance >> 60) → doar early booking (15%) se potrivește dintre automate
  v_id := public.create_booking('300000ff-0000-0000-0000-000000000001'::uuid,
    '2035-03-10','2035-03-12','50000000-0000-0000-0000-000000000001'::uuid, null, 2, 0);
  select total_amount, discount_amount, (price_breakdown->>'subtotal')::numeric as sub,
         price_breakdown->'promotion'->>'name' as pname
    into v_b from bookings where id = v_id;
  if v_b.discount_amount = round(v_b.sub * 0.15, 2) and v_b.pname = 'Early' then
    raise notice 'TEST 63 PASS: early booking automat -15%% (fără cod)';
  else raise exception 'TEST 63 FAIL: disc=% name=%', v_b.discount_amount, v_b.pname; end if;
end $$;
reset role;

-- ---------- TEST 64: cea mai bună reducere câștigă între automate ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_id uuid; v_b record;
begin
  -- 30 nopți → early(15) + stay7(10) + long30(25) se potrivesc → câștigă long 25%
  v_id := public.create_booking('300000ff-0000-0000-0000-000000000001'::uuid,
    '2035-04-01','2035-05-01','50000000-0000-0000-0000-000000000001'::uuid, null, 2, 0);
  select discount_amount, (price_breakdown->>'subtotal')::numeric as sub,
         price_breakdown->'promotion'->>'name' as pname
    into v_b from bookings where id = v_id;
  if v_b.discount_amount = round(v_b.sub * 0.25, 2) and v_b.pname = 'Long30' then
    raise notice 'TEST 64 PASS: cea mai mare reducere câștigă (long 25%%)';
  else raise exception 'TEST 64 FAIL: disc=% name=%', v_b.discount_amount, v_b.pname; end if;
end $$;
reset role;

-- ---------- TEST 65: cod invalid / neeligibil => PROMO_INVALID ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
begin
  -- date „neutre" (fără automată care să se aplice ca fallback), ca un cod invalid
  -- să ducă efectiv la PROMO_INVALID (nu la o automată best-of)
  -- 65a: cod inexistent
  begin
    perform public.create_booking('300000ff-0000-0000-0000-000000000001'::uuid,
      current_date + 13, current_date + 15, '50000000-0000-0000-0000-000000000001'::uuid,
      null, 2, 0, 'confirmed', null, false, 'NOPE');
    raise exception 'TEST 65a FAIL: cod inexistent acceptat';
  exception when others then
    if sqlerrm like '%PROMO_INVALID%' then raise notice 'TEST 65a PASS: cod inexistent => PROMO_INVALID';
    else raise; end if;
  end;
  -- 65b: cod legat de alt tip (SCOPED pe 300000ee) folosit pe tipul Promo => PROMO_INVALID
  begin
    perform public.create_booking('300000ff-0000-0000-0000-000000000001'::uuid,
      current_date + 13, current_date + 15, '50000000-0000-0000-0000-000000000001'::uuid,
      null, 2, 0, 'confirmed', null, false, 'SCOPED');
    raise exception 'TEST 65b FAIL: cod din alt scope acceptat';
  exception when others then
    if sqlerrm like '%PROMO_INVALID%' then raise notice 'TEST 65b PASS: cod cu scope greșit => PROMO_INVALID';
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 66: limită de utilizări (max_uses) ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_id uuid;
begin
  -- date neutre (fără automată fallback) ca epuizarea codului să ducă la respingere
  -- prima utilizare a codului LIMITED (max 1) => OK
  v_id := public.create_booking('300000ff-0000-0000-0000-000000000001'::uuid,
    current_date + 16, current_date + 18, '50000000-0000-0000-0000-000000000001'::uuid,
    null, 2, 0, 'confirmed', null, false, 'LIMITED');
  if v_id is null then raise exception 'TEST 66a FAIL: prima utilizare a eșuat'; end if;
  raise notice 'TEST 66a PASS: prima utilizare a codului LIMITED => OK';
  -- a doua utilizare => respinsă (cod epuizat, fără automată fallback)
  begin
    perform public.create_booking('300000ff-0000-0000-0000-000000000001'::uuid,
      current_date + 19, current_date + 21, '50000000-0000-0000-0000-000000000001'::uuid,
      null, 2, 0, 'confirmed', null, false, 'LIMITED');
    raise exception 'TEST 66b FAIL: codul epuizat a fost acceptat';
  exception when others then
    if sqlerrm like '%PROMO_INVALID%' or sqlerrm like '%PROMO_LIMIT_REACHED%' then
      raise notice 'TEST 66b PASS: cod epuizat respins';
    else raise; end if;
  end;
  if (select uses_count from promotions where code = 'LIMITED') = 1 then
    raise notice 'TEST 66c PASS: uses_count plafonat la max_uses';
  else raise exception 'TEST 66c FAIL: uses_count=%', (select uses_count from promotions where code = 'LIMITED'); end if;
end $$;
reset role;

-- ---------- TEST 67: last minute (max_advance_hours) ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_id uuid; v_b record;
begin
  -- sosire mâine (advance < 72h) → last minute (20%) se aplică automat
  v_id := public.create_booking('300000ff-0000-0000-0000-000000000001'::uuid,
    current_date + 1, current_date + 3, '50000000-0000-0000-0000-000000000001'::uuid, null, 2, 0);
  select discount_amount, (price_breakdown->>'subtotal')::numeric as sub,
         price_breakdown->'promotion'->>'name' as pname
    into v_b from bookings where id = v_id;
  if v_b.discount_amount = round(v_b.sub * 0.20, 2) and v_b.pname = 'LastMin' then
    raise notice 'TEST 67 PASS: last minute automat -20%% (advance < 72h)';
  else raise exception 'TEST 67 FAIL: disc=% name=%', v_b.discount_amount, v_b.pname; end if;
end $$;
reset role;

-- ---------- TEST 68: discount sumă fixă + clamp la subtotal ----------
do $$
begin
  insert into promotions (org_id, property_id, name, code, discount_type, discount_value)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          'Fix mare','FLAT500','amount',500);
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_id uuid; v_b record;
begin
  -- 1 noapte (subtotal 100) cu FLAT500 → discount plafonat la 100, total 0
  v_id := public.create_booking('300000ff-0000-0000-0000-000000000001'::uuid,
    '2035-08-10','2035-08-11','50000000-0000-0000-0000-000000000001'::uuid,
    null, 2, 0, 'confirmed', null, false, 'FLAT500');
  select total_amount, discount_amount, (price_breakdown->>'subtotal')::numeric as sub
    into v_b from bookings where id = v_id;
  if v_b.discount_amount = v_b.sub and v_b.total_amount = 0 then
    raise notice 'TEST 68 PASS: discount sumă plafonat la subtotal (total 0)';
  else raise exception 'TEST 68 FAIL: sub=% disc=% total=%', v_b.sub, v_b.discount_amount, v_b.total_amount; end if;
end $$;
reset role;

-- ---------- TEST 69: flux public (cod + preview) ----------
create temp table _promo69 (booking_id uuid);
grant insert on _promo69 to anon;
grant select on _promo69 to authenticated;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
declare v jsonb; v_res jsonb;
begin
  -- 69a: preview public reflectă reducerea codului
  v := public.public_preview_promo('hotel-test','300000ff-0000-0000-0000-000000000001',
        '2035-09-10','2035-09-12','SUMMER10');
  if (v->'promotion'->>'applied')::boolean and (v->>'discount')::numeric > 0
     and (v->>'total')::numeric = (v->>'subtotal')::numeric - (v->>'discount')::numeric then
    raise notice 'TEST 69a PASS: public_preview_promo aplică codul';
  else raise exception 'TEST 69a FAIL: %', v; end if;
  -- 69b: rezervare publică cu cod (verificarea snapshot-ului se face după reset role,
  --      anon nu are select pe bookings)
  v_res := public.public_create_booking('hotel-test','300000ff-0000-0000-0000-000000000001',
        '2035-09-10','2035-09-12','Public Promo','pp@test.ro','0700000123', 2, 0, null, 'SUMMER10');
  insert into _promo69 values ((v_res->>'booking_id')::uuid);
end $$;
reset role;
do $$
begin
  if exists (select 1 from bookings b join _promo69 t on t.booking_id = b.id
             where b.discount_amount > 0 and b.promotion_id is not null) then
    raise notice 'TEST 69b PASS: rezervare publică cu cod aplică reducerea';
  else raise exception 'TEST 69b FAIL: reducerea nu s-a aplicat pe flux public'; end if;
end $$;

-- ---------- TEST 70: quote_price cu cod + RLS/izolare ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v jsonb;
begin
  -- 70a: quote_price cu cod întoarce reducerea + total ajustat
  v := public.quote_price('300000ff-0000-0000-0000-000000000001','2035-10-10','2035-10-12','SUMMER10');
  if (v->'promotion'->>'applied')::boolean
     and (v->>'total')::numeric = (v->>'subtotal')::numeric - (v->>'discount')::numeric then
    raise notice 'TEST 70a PASS: quote_price cu cod aplică reducerea';
  else raise exception 'TEST 70a FAIL: %', v; end if;
end $$;
reset role;

-- 70b: anon nu vede promotions; org B nu vede promoțiile org A
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
declare v int;
begin
  begin
    select count(*) into v from public.promotions;
    raise exception 'TEST 70b FAIL: anon a citit promotions';
  exception when insufficient_privilege then
    raise notice 'TEST 70b PASS: anon fără select pe promotions';
  end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare v int;
begin
  select count(*) into v from public.promotions
   where property_id = '20000000-0000-0000-0000-000000000001';
  if v = 0 then raise notice 'TEST 70c PASS: org B nu vede promoțiile org A';
  else raise exception 'TEST 70c FAIL: leak cross-tenant promotions (%)', v; end if;
end $$;
reset role;

-- ---------- TEST 72: best-of (automată mai bună depășește codul, non-stacking) ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_id uuid; v_b record;
begin
  -- 30 nopți în 2036 + cod SUMMER10 (10%): candidate = cod 10% + automate (early 15,
  -- stay 10, long 25). Best-of → câștigă long 25%, NU codul. O singură promoție aplicată.
  v_id := public.create_booking('300000ff-0000-0000-0000-000000000001'::uuid,
    '2036-01-01','2036-01-31','50000000-0000-0000-0000-000000000001'::uuid,
    null, 2, 0, 'confirmed', null, false, 'SUMMER10');
  select discount_amount, (price_breakdown->>'subtotal')::numeric as sub,
         price_breakdown->'promotion'->>'name' as pname,
         (price_breakdown->'promotion'->>'code_matched')::boolean as cm
    into v_b from bookings where id = v_id;
  if v_b.discount_amount = round(v_b.sub * 0.25, 2) and v_b.pname = 'Long30' and v_b.cm = true then
    raise notice 'TEST 72 PASS: best-of — automata 25%% bate codul 10%% (cod valid dar depășit)';
  else raise exception 'TEST 72 FAIL: disc=% name=% code_matched=%', v_b.discount_amount, v_b.pname, v_b.cm; end if;
end $$;
reset role;

-- ---------- TEST 71: availability publică „à la Booking.com" (toate tipurile + reason + reducere) ----------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
declare v_r record;
begin
  -- 71a: tip Promo rezervabil pe dată liberă (2 nopți, 2035) → reason NULL + reducere automată
  --      (early booking -15%, advance >> 60 zile)
  select reason, discount, promo_label, total_price into v_r
    from public.public_get_availability('hotel-test','2035-11-10','2035-11-12')
   where unit_type_id = '300000ff-0000-0000-0000-000000000001';
  if v_r.reason is null and v_r.discount = round(v_r.total_price * 0.15, 2) and v_r.promo_label = 'Early' then
    raise notice 'TEST 71a PASS: tip rezervabil cu reducere automată în listă (-15%%, %)', v_r.promo_label;
  else raise exception 'TEST 71a FAIL: reason=% disc=% label=% total=%', v_r.reason, v_r.discount, v_r.promo_label, v_r.total_price; end if;

  -- 71b: ocupare depășită → reason OCCUPANCY, fără reducere afișată
  select reason, discount into v_r
    from public.public_get_availability('hotel-test','2035-11-10','2035-11-12', 5, 0)
   where unit_type_id = '300000ff-0000-0000-0000-000000000001';
  if v_r.reason = 'OCCUPANCY' and v_r.discount = 0 then
    raise notice 'TEST 71b PASS: ocupare depășită → reason OCCUPANCY (fără reducere)';
  else raise exception 'TEST 71b FAIL: reason=% disc=%', v_r.reason, v_r.discount; end if;

  -- 71c: sub sejurul minim → tipul tot apare, cu reason STAY_TOO_SHORT (nu mai e filtrat)
  --      (300000bb are min_stay 3; 2 nopți)
  select reason, min_stay into v_r
    from public.public_get_availability('hotel-test','2031-04-10','2031-04-12')
   where unit_type_id = '300000bb-0000-0000-0000-000000000001';
  if v_r.reason = 'STAY_TOO_SHORT' and v_r.min_stay = 3 then
    raise notice 'TEST 71c PASS: sub sejur minim → reason STAY_TOO_SHORT (min %)', v_r.min_stay;
  else raise exception 'TEST 71c FAIL: reason=% min=%', v_r.reason, v_r.min_stay; end if;
end $$;
reset role;

-- ---------- TEST 73: lock identitate financiară după folosire (à la Mews) ----------
-- promoție NEFOLOSITĂ dedicată (editabilă integral)
insert into promotions (id, org_id, property_id, name, code, discount_type, discount_value)
values ('700000ff-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001','Nefolosită','UNUSEDX','percent',20);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
begin
  -- SUMMER10 a fost folosită în TEST 62 (uses_count >= 1) → identitate financiară blocată
  -- 73a: schimbarea valorii reducerii => PROMOTION_LOCKED
  begin
    update promotions set discount_value = 50 where code = 'SUMMER10';
    raise exception 'TEST 73a FAIL: valoarea unei promoții folosite a putut fi schimbată';
  exception when others then
    if sqlerrm like '%PROMOTION_LOCKED%' then raise notice 'TEST 73a PASS: valoare blocată după folosire => PROMOTION_LOCKED';
    else raise; end if;
  end;
  -- 73b: schimbarea codului => PROMOTION_LOCKED
  begin
    update promotions set code = 'SUMMER99' where code = 'SUMMER10';
    raise exception 'TEST 73b FAIL: codul unei promoții folosite a putut fi schimbat';
  exception when others then
    if sqlerrm like '%PROMOTION_LOCKED%' then raise notice 'TEST 73b PASS: cod blocat după folosire => PROMOTION_LOCKED';
    else raise; end if;
  end;
  -- 73b2: schimbarea TIPULUI reducerii (percent <-> amount) => PROMOTION_LOCKED
  begin
    update promotions set discount_type = 'amount' where code = 'SUMMER10';
    raise exception 'TEST 73b2 FAIL: tipul reducerii unei promoții folosite a putut fi schimbat';
  exception when others then
    if sqlerrm like '%PROMOTION_LOCKED%' then raise notice 'TEST 73b2 PASS: tip reducere blocat după folosire => PROMOTION_LOCKED';
    else raise; end if;
  end;
  -- 73c: câmpuri operaționale (limită, perioadă, activ) RĂMÂN editabile chiar și după folosire
  update promotions set max_uses = 500, stay_end = '2040-12-31', is_active = false
   where code = 'SUMMER10';
  raise notice 'TEST 73c PASS: limită/perioadă/activ editabile pe promoție folosită';
  -- reactivăm ca să nu afectăm alte verificări
  update promotions set is_active = true, max_uses = null, stay_end = null where code = 'SUMMER10';

  -- 73d: promoție NEFOLOSITĂ → totul editabil (cod + valoare)
  update promotions set discount_value = 35, code = 'UNUSEDY'
   where id = '700000ff-0000-0000-0000-000000000001';
  raise notice 'TEST 73d PASS: promoție nefolosită complet editabilă';

  -- 73e: ștergerea unei promoții folosite => blocată de FK (istoricul protejat)
  begin
    delete from promotions where code = 'SUMMER10';
    raise exception 'TEST 73e FAIL: promoție folosită ștearsă';
  exception when foreign_key_violation then
    raise notice 'TEST 73e PASS: ștergerea unei promoții folosite respinsă (FK)';
  end;
end $$;
reset role;

-- ---------- TEST 74: validate_booking — strat de validatori (errors/warnings + override) ----------
-- Sprint 4.9: o singură sursă de adevăr; FIZIC = mereu eroare, SOFT = override → warning.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v jsonb;
begin
  -- 74a: rezervare validă pe interval liber → valid, fără erori
  v := public.validate_booking('30000000-0000-0000-0000-000000000001','2045-03-01','2045-03-03');
  if (v->>'valid')::boolean and v->'errors' = '[]'::jsonb then
    raise notice 'TEST 74a PASS: validate_booking valid pe interval liber';
  else raise exception 'TEST 74a FAIL: %', v; end if;

  -- 74b: ocupare depășită (FIZIC) → eroare CHIAR și cu override
  v := public.validate_booking('30000000-0000-0000-0000-000000000001','2045-03-01','2045-03-03', 9, 0, null, null, true);
  if not (v->>'valid')::boolean and v->'errors' @> '["OCCUPANCY_EXCEEDED"]'::jsonb then
    raise notice 'TEST 74b PASS: ocupare = eroare fizică, neoverridabilă';
  else raise exception 'TEST 74b FAIL: %', v; end if;

  -- 74c: restricție SOFT (CTA) fără override = eroare
  v := public.validate_booking('300000ee-0000-0000-0000-000000000001','2034-12-20','2034-12-22');
  if not (v->>'valid')::boolean and v->'errors' @> '["NO_ARRIVAL"]'::jsonb then
    raise notice 'TEST 74c PASS: soft fără override = eroare (NO_ARRIVAL)';
  else raise exception 'TEST 74c FAIL: %', v; end if;

  -- 74d: același soft CU override (owner) = warning, nu eroare
  v := public.validate_booking('300000ee-0000-0000-0000-000000000001','2034-12-20','2034-12-22', 1, 0, null, null, true);
  if v->'warnings' @> '["NO_ARRIVAL"]'::jsonb and not (v->'errors' @> '["NO_ARRIVAL"]'::jsonb) then
    raise notice 'TEST 74d PASS: Manager Override coboară soft-ul în warnings';
  else raise exception 'TEST 74d FAIL: %', v; end if;
end $$;
reset role;

-- ---------- TEST 75: validate_booking — cazuri negative + edge (multi-violare, ordine, promo) ----------
-- Fixture izolat: tip cu O SINGURĂ cameră + închidere + min stay 5 + CTA, toate pe 2038-06.
insert into unit_types (id, org_id, property_id, name, max_adults, max_children, base_price)
values ('300000dd-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001','Validator type', 2, 1, 100);
insert into units (id, org_id, property_id, unit_type_id, name)
values ('400000dd-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001','300000dd-0000-0000-0000-000000000001','Val 1');
insert into closures (org_id, property_id, unit_type_id, start_date, end_date, reason)
values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
        '300000dd-0000-0000-0000-000000000001','2038-06-10','2038-06-20','event');
insert into stay_rules (org_id, property_id, unit_type_id, name, start_date, end_date, min_stay)
values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
        '300000dd-0000-0000-0000-000000000001','Min 5 iun','2038-06-01','2038-06-30', 5);
insert into arrival_rules (org_id, property_id, unit_type_id, name, start_date, end_date, weekdays, no_arrival)
values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
        '300000dd-0000-0000-0000-000000000001','CTA iun','2038-06-10','2038-06-20', null, true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v jsonb;
begin
  -- 75a: interval curat, o singură cameră liberă → valid + warning LAST_UNIT
  v := public.validate_booking('300000dd-0000-0000-0000-000000000001','2038-07-05','2038-07-07', 2, 0);
  if (v->>'valid')::boolean and v->'warnings' @> '["LAST_UNIT"]'::jsonb then
    raise notice 'TEST 75a PASS: ultima cameră liberă → valid + warning LAST_UNIT';
  else raise exception 'TEST 75a FAIL: %', v; end if;

  -- 75b: date invalide (check_out <= check_in) → INVALID_DATES, fără alte verificări
  v := public.validate_booking('300000dd-0000-0000-0000-000000000001','2038-07-07','2038-07-05');
  if not (v->>'valid')::boolean and v->'errors' @> '["INVALID_DATES"]'::jsonb then
    raise notice 'TEST 75b PASS: date inversate → INVALID_DATES';
  else raise exception 'TEST 75b FAIL: %', v; end if;

  -- 75c: MULTI-violare soft simultană (închidere + min stay + CTA) → toate în errors, ordine canonică
  v := public.validate_booking('300000dd-0000-0000-0000-000000000001','2038-06-12','2038-06-14');
  if v->'errors' @> '["DATES_CLOSED","STAY_TOO_SHORT","NO_ARRIVAL"]'::jsonb
     and (v->'errors'->>0) = 'DATES_CLOSED' then
    raise notice 'TEST 75c PASS: 3 motive soft simultan, errors[0]=DATES_CLOSED (ordine canonică)';
  else raise exception 'TEST 75c FAIL: %', v; end if;

  -- 75d: aceleași date CU override → TOT soft-ul coboară în warnings, valid (fizicul e ok)
  v := public.validate_booking('300000dd-0000-0000-0000-000000000001','2038-06-12','2038-06-14', 1, 0, null, null, true);
  if (v->>'valid')::boolean
     and v->'warnings' @> '["DATES_CLOSED","STAY_TOO_SHORT","NO_ARRIVAL"]'::jsonb
     and v->'errors' = '[]'::jsonb then
    raise notice 'TEST 75d PASS: override coboară TOT soft-ul simultan → valid';
  else raise exception 'TEST 75d FAIL: %', v; end if;

  -- 75e: cod invalid, pe o fereastră FĂRĂ promoție automată (avans 30 zile: nu early ≥60,
  -- nu last-minute ≤72h; 2 nopți < stay 7) → PROMO_INVALID (override nu forțează codul)
  v := public.validate_booking('300000dd-0000-0000-0000-000000000001',
                               current_date + 30, current_date + 32, 1, 0, null, 'NOPE', true);
  if not (v->>'valid')::boolean and v->'errors' @> '["PROMO_INVALID"]'::jsonb then
    raise notice 'TEST 75e PASS: cod inexistent → PROMO_INVALID (override nu-l forțează)';
  else raise exception 'TEST 75e FAIL: %', v; end if;
end $$;
reset role;

-- 75f: FIZIC neoverridabil — ocupăm singura cameră (cu override pe soft), apoi validăm același interval
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v jsonb; v_id uuid;
begin
  v_id := public.create_booking('300000dd-0000-0000-0000-000000000001','2038-06-12','2038-06-14',
    '50000000-0000-0000-0000-000000000001', null, 1, 0, 'confirmed', null, true, null);
  if v_id is null then raise exception 'TEST 75f FAIL: create cu override a eșuat'; end if;
  -- camera e ocupată → UNIT_NOT_AVAILABLE rămâne eroare CHIAR și cu override
  v := public.validate_booking('300000dd-0000-0000-0000-000000000001','2038-06-12','2038-06-14', 1, 0, null, null, true);
  if not (v->>'valid')::boolean and v->'errors' @> '["UNIT_NOT_AVAILABLE"]'::jsonb then
    raise notice 'TEST 75f PASS: camera ocupată → UNIT_NOT_AVAILABLE neoverridabil (fizic)';
  else raise exception 'TEST 75f FAIL: %', v; end if;
end $$;
reset role;

-- 75g: promoție AUTOMATĂ aplicată → warning PROMO_APPLIED (fără cod), pe tipul cu promoții
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v jsonb;
begin
  -- 300000ff are early booking automat (-15%); interval îndepărtat 2039 => advance mare => aplicată
  v := public.validate_booking('300000ff-0000-0000-0000-000000000001','2039-05-10','2039-05-12');
  if v->'warnings' @> '["PROMO_APPLIED"]'::jsonb then
    raise notice 'TEST 75g PASS: promoție automată aplicată → warning PROMO_APPLIED';
  else raise exception 'TEST 75g FAIL: %', v; end if;
end $$;
reset role;

-- ---------- TEST 76: securitate strat validatori (izolare + override + motor inaccesibil) ----------
-- 76a: org B (owner) NU poate valida pe un tip din org A → FORBIDDEN (izolare cross-tenant)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
begin
  begin
    perform public.validate_booking('300000ee-0000-0000-0000-000000000001','2034-12-20','2034-12-22');
    raise exception 'TEST 76a FAIL: org B a validat pe tip din org A';
  exception when others then
    if sqlerrm like '%FORBIDDEN%' then raise notice 'TEST 76a PASS: validate_booking cross-tenant => FORBIDDEN';
    else raise; end if;
  end;
end $$;
reset role;

-- 76b: staff (non-manager) NU poate forța override la preview → soft rămâne în errors
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000e","role":"authenticated"}';
do $$
declare v jsonb;
begin
  v := public.validate_booking('300000ee-0000-0000-0000-000000000001','2034-12-20','2034-12-22', 1, 0, null, null, true);
  if v->'errors' @> '["NO_ARRIVAL"]'::jsonb and not (v->'warnings' @> '["NO_ARRIVAL"]'::jsonb) then
    raise notice 'TEST 76b PASS: staff nu poate forța override la preview (soft rămâne eroare)';
  else raise exception 'TEST 76b FAIL: %', v; end if;
end $$;
reset role;

-- 76c: motorul de preț + validatorii interni sunt INACCESIBILI direct (clientul nu poate fabrica
--      preț/availability). Aserție pe privilegiu — NU apelăm (apel revocat sub rol = segfault JIT).
do $$
begin
  if has_function_privilege('authenticated', 'app.compute_price(uuid,date,date)', 'execute')
     or has_function_privilege('authenticated',
          'app.validate_booking(uuid,uuid,date,date,integer,integer,text,boolean,timestamp with time zone,uuid)', 'execute')
     or has_function_privilege('authenticated', 'app.unit_is_free(uuid,date,date,integer,uuid)', 'execute')
     or has_function_privilege('authenticated', 'app.resolve_promotion(uuid,date,date,numeric,text,timestamp with time zone)', 'execute') then
    raise exception 'TEST 76c FAIL: motor de preț/availability apelabil direct de client';
  end if;
  raise notice 'TEST 76c PASS: compute_price/validate_booking/unit_is_free/resolve_promotion inaccesibile direct';
end $$;

-- ---------- TEST 77: update_booking_dates — mutare validă + re-validare la schimbarea datelor ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_id uuid; v_ci date;
begin
  -- rezervare pe interval curat (300000dd nu are reguli pe 2045)
  v_id := public.create_booking('300000dd-0000-0000-0000-000000000001','2045-03-01','2045-03-03',
    '50000000-0000-0000-0000-000000000001', null, 1, 0, 'confirmed', null, false, null);
  -- 77a: mutare pe alt interval liber → succes (datele se schimbă)
  perform public.update_booking_dates(v_id, '2045-04-01', '2045-04-03');
  select check_in into v_ci from bookings where id = v_id;
  if v_ci = '2045-04-01' then raise notice 'TEST 77a PASS: update_booking_dates mută pe interval liber';
  else raise exception 'TEST 77a FAIL: check_in=%', v_ci; end if;
  -- 77b: mutare pe o închidere → DATES_CLOSED (regulile se re-verifică la schimbarea datelor)
  begin
    perform public.update_booking_dates(v_id, '2038-06-12', '2038-06-14');
    raise exception 'TEST 77b FAIL: mutare pe interval închis acceptată';
  exception when others then
    if sqlerrm like '%DATES_CLOSED%' then raise notice 'TEST 77b PASS: mutare pe închidere => DATES_CLOSED (re-validare)';
    else raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- Sprint 5 — Analytics & Dashboard
-- ============================================================
-- tip + cameră izolate pe proprietatea A pentru metricile panoului
insert into unit_types (id, org_id, property_id, name, max_adults, max_children, base_price)
values ('30000055-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', 'Dashboard', 4, 0, 100);
insert into units (id, org_id, property_id, unit_type_id, name)
values ('40005500-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', '30000055-0000-0000-0000-000000000001', 'D-1');

-- ---------- TEST 78: get_dashboard_stats — sosiri/ocupare azi + izolare RLS ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare
  v_tz text; v_today date; v_id uuid; v_gc int;
  s0 record; s1 record;
begin
  select timezone into v_tz from properties where id = '20000000-0000-0000-0000-000000000001';
  v_today := (now() at time zone v_tz)::date;

  -- 78a: invariant numitor — ocupate + disponibile = total active
  select * into s0 from public.get_dashboard_stats('20000000-0000-0000-0000-000000000001');
  if s0.occupied_units + s0.available_units = s0.total_units then
    raise notice 'TEST 78a PASS: ocupate(%) + disponibile(%) = total(%)',
      s0.occupied_units, s0.available_units, s0.total_units;
  else
    raise exception 'TEST 78a FAIL: %/%/%', s0.occupied_units, s0.available_units, s0.total_units;
  end if;

  -- rezervare care sosește azi pe camera izolată (2 nopți, acoperă azi)
  v_id := public.create_booking('30000055-0000-0000-0000-000000000001', v_today, v_today + 2,
    '50000000-0000-0000-0000-000000000001', '40005500-0000-0000-0000-000000000001',
    2, 0, 'confirmed', null, false, null);
  select guests_count into v_gc from bookings where id = v_id;
  select * into s1 from public.get_dashboard_stats('20000000-0000-0000-0000-000000000001');

  -- 78b: sosirea de azi mută toți contoarele operaționale cu exact un pas
  if s1.arrivals_today = s0.arrivals_today + 1
     and s1.occupied_units = s0.occupied_units + 1
     and s1.available_units = s0.available_units - 1
     and s1.in_house_guests = s0.in_house_guests + v_gc then
    raise notice 'TEST 78b PASS: sosire azi → arrivals+1, occupied+1, available-1, in_house+%', v_gc;
  else
    raise exception 'TEST 78b FAIL: arrivals %→%, occupied %→%, available %→%, in_house %→%',
      s0.arrivals_today, s1.arrivals_today, s0.occupied_units, s1.occupied_units,
      s0.available_units, s1.available_units, s0.in_house_guests, s1.in_house_guests;
  end if;

  -- 78c: anularea ei iese din ocupare și din sosiri (nu mai e activă)
  update bookings set status = 'cancelled' where id = v_id;
  select * into s1 from public.get_dashboard_stats('20000000-0000-0000-0000-000000000001');
  if s1.arrivals_today = s0.arrivals_today and s1.occupied_units = s0.occupied_units then
    raise notice 'TEST 78c PASS: anulare → exclusă din sosiri/ocupare';
  else
    raise exception 'TEST 78c FAIL: arrivals=% occupied=%', s1.arrivals_today, s1.occupied_units;
  end if;
end $$;
reset role;

-- ---------- TEST 78d: get_dashboard_stats cross-org => FORBIDDEN ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
begin
  begin
    perform public.get_dashboard_stats('20000000-0000-0000-0000-000000000001');
    raise exception 'TEST 78d FAIL: owner-b a citit panoul proprietatii A';
  exception when others then
    if sqlerrm like '%FORBIDDEN%' then raise notice 'TEST 78d PASS: get_dashboard_stats cross-org => FORBIDDEN';
    else raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- Sprint 6.1 — RBAC Foundation
-- ============================================================
-- Fixtures (ca postgres → bypass RLS). Un membru „recepție" pe Org A:
-- role='staff' declanșează triggerul member_roles_sync → rolul Reception.
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000079', 'reception-a@test.ro');
insert into organization_members (org_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000079', 'staff');
-- al doilea rol (multi-rol → permisiunile se cumulează): Finance
insert into member_roles (member_id, role_id)
  select m.id, r.id
  from organization_members m, roles r
  where m.user_id = '00000000-0000-0000-0000-000000000079'
    and m.org_id = '10000000-0000-0000-0000-000000000001'
    and r.slug = 'finance' and r.org_id is null;
-- rol custom în Org B (pt. testul de izolare cross-tenant)
insert into roles (id, org_id, slug, name) values
  ('79000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000002',
   'custom-b', 'Custom B');

-- ---------- TEST 79a: trigger backfill enum→rol de sistem ----------
do $$
declare v_slug text;
begin
  select r.slug into v_slug
  from member_roles mr
  join organization_members m on m.id = mr.member_id
  join roles r on r.id = mr.role_id and r.is_system
  where m.user_id = '00000000-0000-0000-0000-000000000079' and r.slug = 'reception';
  if v_slug = 'reception' then
    raise notice 'TEST 79a PASS: staff → rol de sistem Reception (trigger sync)';
  else
    raise exception 'TEST 79a FAIL: rol mapat = %', v_slug;
  end if;
end $$;

-- ---------- TEST 79b: has_permission ca recepție (permisiune + union + scoping) ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000079","role":"authenticated"}';
do $$
declare v_orgA uuid := '10000000-0000-0000-0000-000000000001';
        v_propA uuid := '20000000-0000-0000-0000-000000000001';
begin
  -- recepția are booking.create
  if not app.has_permission(v_orgA, v_propA, 'booking.create') then
    raise exception 'TEST 79b FAIL: recepția nu are booking.create';
  end if;
  -- recepția NU are pricing.edit
  if app.has_permission(v_orgA, v_propA, 'pricing.edit') then
    raise exception 'TEST 79b FAIL: recepția are pricing.edit';
  end if;
  -- union: payment.refund vine din al doilea rol (Finance)
  if not app.has_permission(v_orgA, v_propA, 'payment.refund') then
    raise exception 'TEST 79b FAIL: union de roluri nu aduce payment.refund';
  end if;
  raise notice 'TEST 79b PASS: has_permission (booking.create da, pricing.edit nu, refund prin union)';
end $$;
reset role;

-- ---------- TEST 79c: enforcement rule = permisiune ȘI acces pe proprietate ----------
-- restrângem recepția la propB (Hotel Secret) → propA devine inaccesibilă
insert into member_property_access (member_id, property_id)
  select m.id, '20000000-0000-0000-0000-000000000002'
  from organization_members m
  where m.user_id = '00000000-0000-0000-0000-000000000079'
    and m.org_id = '10000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000079","role":"authenticated"}';
do $$
declare v_orgA uuid := '10000000-0000-0000-0000-000000000001';
        v_propA uuid := '20000000-0000-0000-0000-000000000001';
begin
  -- are permisiunea, dar NU are acces pe propA → fals
  if app.has_permission(v_orgA, v_propA, 'booking.create') then
    raise exception 'TEST 79c FAIL: acces la propA deși restrâns la propB';
  end if;
  -- fără scope de proprietate (p_property_id null) → doar permisiunea contează
  if not app.has_permission(v_orgA, null, 'booking.create') then
    raise exception 'TEST 79c FAIL: scoping pe null ar trebui să treacă';
  end if;
  raise notice 'TEST 79c PASS: permisiune ∧ acces proprietate (propA blocat, null permis)';
end $$;
reset role;

-- ---------- TEST 79d: izolare cross-tenant pe member_roles ----------
do $$
begin
  begin
    insert into member_roles (member_id, role_id)
      select m.id, '79000000-0000-0000-0000-0000000000b1'
      from organization_members m
      where m.user_id = '00000000-0000-0000-0000-000000000079'
        and m.org_id = '10000000-0000-0000-0000-000000000001';
    raise exception 'TEST 79d FAIL: membru Org A a primit rol custom din Org B';
  exception when others then
    if sqlerrm like '%ROLE_ORG_MISMATCH%' then
      raise notice 'TEST 79d PASS: rol custom din altă org => ROLE_ORG_MISMATCH';
    else raise; end if;
  end;
end $$;

-- ---------- TEST 79e: owner structural bypass-ează permisiunile ----------
-- facem temporar din recepție owner-ul Org A; deși rolul Reception n-are
-- organization.billing, bypass-ul pe owner_user_id îl acordă
update organizations set owner_user_id = '00000000-0000-0000-0000-000000000079'
  where id = '10000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000079","role":"authenticated"}';
do $$
declare v_orgA uuid := '10000000-0000-0000-0000-000000000001';
begin
  if not app.has_permission(v_orgA, null, 'organization.billing') then
    raise exception 'TEST 79e FAIL: owner nu bypass-ează spre organization.billing';
  end if;
  raise notice 'TEST 79e PASS: owner_user_id bypass → toate permisiunile';
end $$;
reset role;

-- ============================================================
-- Sprint 6.2 — RBAC Enforcement
-- ============================================================
-- Restaurăm owner-ul structural al Org A la owner-a (TEST 79e îl mutase pe ...079)
-- și creăm membri proaspeți cu UN SINGUR rol de sistem pentru izolare curată.
update organizations set owner_user_id = '00000000-0000-0000-0000-00000000000a'
  where id = '10000000-0000-0000-0000-000000000001';

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'hk-a@test.ro'),
  ('00000000-0000-0000-0000-0000000000a2', 'fin-a@test.ro'),
  ('00000000-0000-0000-0000-0000000000a3', 'ro-a@test.ro'),
  ('00000000-0000-0000-0000-0000000000a4', 'mgr-a@test.ro'),
  ('00000000-0000-0000-0000-0000000000a5', 'rec-a@test.ro'),
  ('00000000-0000-0000-0000-0000000000a6', 'recB-a@test.ro');
-- staff → trigger pune Reception; manager → trigger pune Manager
insert into organization_members (org_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'staff'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'staff'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'staff'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', 'manager'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a5', 'staff'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a6', 'staff');
-- înlocuim rolul Reception auto cu rolul de sistem dorit (housekeeping/finance/readonly)
update member_roles set role_id = (select id from roles where slug='housekeeping' and org_id is null)
  where member_id = (select id from organization_members
                     where user_id='00000000-0000-0000-0000-0000000000a1'
                       and org_id='10000000-0000-0000-0000-000000000001');
update member_roles set role_id = (select id from roles where slug='finance' and org_id is null)
  where member_id = (select id from organization_members
                     where user_id='00000000-0000-0000-0000-0000000000a2'
                       and org_id='10000000-0000-0000-0000-000000000001');
update member_roles set role_id = (select id from roles where slug='readonly' and org_id is null)
  where member_id = (select id from organization_members
                     where user_id='00000000-0000-0000-0000-0000000000a3'
                       and org_id='10000000-0000-0000-0000-000000000001');
-- recB restrâns la propB (Hotel Secret) pentru testul permisiune×acces
insert into member_property_access (member_id, property_id)
  select id, '20000000-0000-0000-0000-000000000002' from organization_members
  where user_id='00000000-0000-0000-0000-0000000000a6'
    and org_id='10000000-0000-0000-0000-000000000001';

-- ---------- TEST 80: RLS de scriere pe permisiuni (pozitiv + negativ) ----------
-- 80a: guests insert — reception (guest.create) DA, readonly NU
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';
do $$ begin
  insert into guests (org_id, full_name) values ('10000000-0000-0000-0000-000000000001', 'Test Rec');
  raise notice 'TEST 80a PASS: reception inserează guest (guest.create)';
end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
do $$ begin
  begin
    insert into guests (org_id, full_name) values ('10000000-0000-0000-0000-000000000001', 'Test RO');
    raise exception 'TEST 80a FAIL: readonly a inserat guest';
  exception when insufficient_privilege then
    raise notice 'TEST 80a PASS: readonly nu inserează guest (42501)';
  end;
end $$;
reset role;

-- 80b: units update status — housekeeping (unit.manage) DA, reception NU
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$ begin
  update units set status = 'inactive' where id = '40000000-0000-0000-0000-000000000002';
  if not found then raise exception 'TEST 80b FAIL: housekeeping nu a putut actualiza (0 rânduri)'; end if;
  update units set status = 'active' where id = '40000000-0000-0000-0000-000000000002';
  raise notice 'TEST 80b PASS: housekeeping schimbă status cameră (unit.manage)';
end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';
do $$ declare v_n int; begin
  update units set status = 'inactive' where id = '40000000-0000-0000-0000-000000000002';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise notice 'TEST 80b PASS: reception nu schimbă status cameră (RLS ascunde rândul la UPDATE)';
  else raise exception 'TEST 80b FAIL: reception a actualizat % rânduri', v_n; end if;
end $$;
reset role;

-- 80c: properties — manager edit DA, delete NU (fără property.delete); owner delete DA
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
do $$ begin
  update properties set city = 'Cluj' where id = '20000000-0000-0000-0000-000000000002';
  if not found then raise exception 'TEST 80c FAIL: manager nu a putut edita proprietatea'; end if;
  raise notice 'TEST 80c PASS: manager editează proprietatea (property.edit)';
end $$;
do $$ declare v_n int; begin
  delete from properties where id = '20000000-0000-0000-0000-000000000002';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise notice 'TEST 80c PASS: manager NU șterge proprietatea (fără property.delete)';
  else raise exception 'TEST 80c FAIL: manager a șters proprietatea'; end if;
end $$;
reset role;

-- 80d: closures insert — manager (rules.manage) DA, reception NU
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
do $$ begin
  insert into closures (org_id, property_id, start_date, end_date)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
          '2050-12-01','2050-12-05');
  raise notice 'TEST 80d PASS: manager creează închidere (rules.manage)';
end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';
do $$ begin
  begin
    insert into closures (org_id, property_id, start_date, end_date)
    values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
            '2050-12-10','2050-12-15');
    raise exception 'TEST 80d FAIL: reception a creat închidere';
  exception when insufficient_privilege then
    raise notice 'TEST 80d PASS: reception nu creează închidere (42501)';
  end;
end $$;
reset role;

-- 80e: WITH CHECK edge — reception nu poate muta un guest spre altă organizație
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';
do $$ begin
  begin
    update guests set org_id = '10000000-0000-0000-0000-000000000002'
    where id = '50000000-0000-0000-0000-000000000001';
    raise exception 'TEST 80e FAIL: guest mutat în altă org (WITH CHECK nu a prins)';
  exception when insufficient_privilege then
    raise notice 'TEST 80e PASS: WITH CHECK blochează mutarea guest-ului cross-org';
  end;
end $$;
reset role;

-- ---------- TEST 81: gărzi în RPC-uri DEFINER (FORBIDDEN) ----------
-- 81a: create_booking — reception DA, housekeeping FORBIDDEN
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';
do $$ declare v_b uuid; begin
  v_b := public.create_booking('30000000-0000-0000-0000-000000000001','2050-02-10','2050-02-12',
    '50000000-0000-0000-0000-000000000001', null, 1, 0, 'confirmed', null, false, null);
  if v_b is null then raise exception 'TEST 81a FAIL: reception nu a creat rezervarea'; end if;
  raise notice 'TEST 81a PASS: reception creează rezervare (booking.create)';
end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$ begin
  begin
    perform public.create_booking('30000000-0000-0000-0000-000000000001','2050-02-20','2050-02-22',
      '50000000-0000-0000-0000-000000000001', null, 1, 0, 'confirmed', null, false, null);
    raise exception 'TEST 81a FAIL: housekeeping a creat rezervare';
  exception when others then
    if sqlerrm like '%FORBIDDEN%' then raise notice 'TEST 81a PASS: housekeeping create_booking => FORBIDDEN';
    else raise; end if;
  end;
end $$;
reset role;

-- 81b: record_payment — reception încasare DA, reception refund FORBIDDEN, finance refund DA
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';
do $$ declare v_b uuid; begin
  v_b := public.create_booking('30000000-0000-0000-0000-000000000001','2050-04-10','2050-04-12',
    '50000000-0000-0000-0000-000000000001', null, 1, 0, 'confirmed', null, false, null);
  perform public.record_payment(v_b, 100, 'payment', 'cash');
  raise notice 'TEST 81b PASS: reception încasează (payment.record)';
  begin
    perform public.record_payment(v_b, 50, 'refund', 'cash');
    raise exception 'TEST 81b FAIL: reception a rambursat fără payment.refund';
  exception when others then
    if sqlerrm like '%FORBIDDEN%' then raise notice 'TEST 81b PASS: reception refund => FORBIDDEN';
    else raise; end if;
  end;
  -- păstrăm v_b pt finance prin temp table
  create temp table _rbac_b (id uuid) on commit drop;
  insert into _rbac_b values (v_b);
end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
do $$ declare v_b uuid; begin
  select id into v_b from _rbac_b limit 1;
  perform public.record_payment(v_b, 30, 'refund', 'cash');
  raise notice 'TEST 81b PASS: finance rambursează (payment.refund)';
end $$;
reset role;

-- 81c: update_booking_dates — readonly FORBIDDEN
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
do $$ declare v_b uuid; begin
  select id into v_b from _rbac_b limit 1;
  begin
    perform public.update_booking_dates(v_b, '2050-04-11', '2050-04-13');
    raise exception 'TEST 81c FAIL: readonly a modificat datele';
  exception when others then
    if sqlerrm like '%FORBIDDEN%' then raise notice 'TEST 81c PASS: readonly update_booking_dates => FORBIDDEN';
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 82: permisiune × acces pe proprietate (enforcement rule) ----------
-- recB are booking.create dar e restrâns la propB → create_booking pe tip din propA = FORBIDDEN
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
do $$ begin
  begin
    perform public.create_booking('30000000-0000-0000-0000-000000000001','2050-05-10','2050-05-12',
      '50000000-0000-0000-0000-000000000001', null, 1, 0, 'confirmed', null, false, null);
    raise exception 'TEST 82 FAIL: acces la propA deși restrâns la propB';
  exception when others then
    if sqlerrm like '%FORBIDDEN%' then raise notice 'TEST 82 PASS: booking.create fără acces pe propA => FORBIDDEN';
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 83: Manager Override (booking.override) ----------
-- închidere pe propA în 2050-03; manager poate forța, reception nu
insert into closures (org_id, property_id, unit_type_id, start_date, end_date)
values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001','2050-03-10','2050-03-15');
-- 83a: reception fără override → DATES_CLOSED
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';
do $$ begin
  begin
    perform public.create_booking('30000000-0000-0000-0000-000000000001','2050-03-11','2050-03-13',
      '50000000-0000-0000-0000-000000000001', null, 1, 0, 'confirmed', null, false, null);
    raise exception 'TEST 83a FAIL: rezervare pe interval închis acceptată';
  exception when others then
    if sqlerrm like '%DATES_CLOSED%' then raise notice 'TEST 83a PASS: reception fără override => DATES_CLOSED';
    else raise; end if;
  end;
  -- 83b: reception cu override → OVERRIDE_FORBIDDEN (nu are booking.override)
  begin
    perform public.create_booking('30000000-0000-0000-0000-000000000001','2050-03-11','2050-03-13',
      '50000000-0000-0000-0000-000000000001', null, 1, 0, 'confirmed', null, true, null);
    raise exception 'TEST 83b FAIL: reception a forțat override';
  exception when others then
    if sqlerrm like '%OVERRIDE_FORBIDDEN%' then raise notice 'TEST 83b PASS: reception override => OVERRIDE_FORBIDDEN';
    else raise; end if;
  end;
end $$;
reset role;
-- 83c: manager cu override → rezervarea trece peste închidere
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
do $$ declare v_b uuid; begin
  v_b := public.create_booking('30000000-0000-0000-0000-000000000001','2050-03-11','2050-03-13',
    '50000000-0000-0000-0000-000000000001', null, 1, 0, 'confirmed', null, true, null);
  if v_b is null then raise exception 'TEST 83c FAIL: manager nu a putut forța'; end if;
  raise notice 'TEST 83c PASS: manager override trece peste închidere (booking.override)';
end $$;
reset role;

-- ---------- TEST 84: get_my_permissions + multi-rol union ----------
-- ...079 = reception ∪ finance (din TEST 79); owner-ul a fost restaurat la owner-a
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000079","role":"authenticated"}';
do $$
declare v_perms text[]; v_orgA uuid := '10000000-0000-0000-0000-000000000001';
begin
  select array_agg(p) into v_perms from public.get_my_permissions(v_orgA) p;
  if 'booking.create' = any(v_perms) and 'payment.refund' = any(v_perms)
     and not ('pricing.edit' = any(v_perms)) then
    raise notice 'TEST 84a PASS: union reception+finance (create+refund, fără pricing.edit)';
  else
    raise exception 'TEST 84a FAIL: perms=%', v_perms;
  end if;
end $$;
reset role;
-- 84b: owner vede tot; cross-org → set gol
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_cnt int; v_cross int;
begin
  select count(*) into v_cnt from public.get_my_permissions('10000000-0000-0000-0000-000000000001');
  select count(*) into v_cross from public.get_my_permissions('10000000-0000-0000-0000-000000000002');
  if v_cnt >= 31 and v_cross = 0 then
    raise notice 'TEST 84b PASS: owner-a = set complet (%), cross-org Org B = gol', v_cnt;
  else
    raise exception 'TEST 84b FAIL: orgA=% orgB=%', v_cnt, v_cross;
  end if;
end $$;
reset role;

-- ============================================================
-- Sprint 6.3 — Member Management, Custom Roles & Profiles
-- ============================================================
-- conturi cu profil dar (încă) fără membership în Org A
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'newhire@test.ro'),
  ('00000000-0000-0000-0000-0000000000b9', 'nonmember@test.ro');

-- ---------- TEST 85: profiles (trigger + RLS) ----------
do $$ begin
  if (select count(*) from profiles where user_id='00000000-0000-0000-0000-0000000000b1') = 1
     and (select count(*) from profiles where user_id='00000000-0000-0000-0000-0000000000a5') = 1 then
    raise notice 'TEST 85a PASS: trigger creează profil la signup (+ backfill)';
  else raise exception 'TEST 85a FAIL'; end if;
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_same int; v_foreign int;
begin
  select count(*) into v_same from profiles where user_id='00000000-0000-0000-0000-0000000000a5'; -- coleg org A
  select count(*) into v_foreign from profiles where user_id='00000000-0000-0000-0000-00000000000b'; -- owner-b (org B)
  if v_same = 1 and v_foreign = 0 then
    raise notice 'TEST 85b PASS: profil coleg vizibil, profil din altă org invizibil';
  else raise exception 'TEST 85b FAIL: same=% foreign=%', v_same, v_foreign; end if;
  -- update profil străin → respins
  begin
    update profiles set full_name='hack' where user_id='00000000-0000-0000-0000-0000000000a5';
    if not found then raise notice 'TEST 85c PASS: update profil străin blocat (0 rânduri/RLS)';
    else raise exception 'TEST 85c FAIL: a actualizat profil străin'; end if;
  exception when insufficient_privilege then raise notice 'TEST 85c PASS: update profil străin => 42501';
  end;
  update profiles set full_name='Owner A' where user_id='00000000-0000-0000-0000-00000000000a';
end $$;
reset role;

-- ---------- TEST 86: add_member ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_m uuid; v_role uuid; v_g_before int; v_g_after int;
begin
  select count(*) into v_g_before from guests;
  -- 86a: email cu MAJUSCULE → match case-insensitiv; rol Reception
  v_m := public.add_member('10000000-0000-0000-0000-000000000001', 'NewHire@Test.ro',
           array[(select id from roles where slug='reception' and org_id is null)]);
  select role_id into v_role from member_roles where member_id = v_m;
  if v_role = (select id from roles where slug='reception' and org_id is null) then
    raise notice 'TEST 86a PASS: add_member (email normalizat) + rol Reception';
  else raise exception 'TEST 86a FAIL'; end if;
  -- 86f: lane — niciun guest atins
  select count(*) into v_g_after from guests;
  if v_g_before = v_g_after then raise notice 'TEST 86f PASS: add_member nu atinge `guests` (lane staff)';
  else raise exception 'TEST 86f FAIL: guests % → %', v_g_before, v_g_after; end if;
  -- 86b: email inexistent
  begin
    perform public.add_member('10000000-0000-0000-0000-000000000001', 'ghost@test.ro', '{}');
    raise exception 'TEST 86b FAIL';
  exception when others then
    if sqlerrm like '%USER_NOT_FOUND%' then raise notice 'TEST 86b PASS: email inexistent => USER_NOT_FOUND';
    else raise; end if;
  end;
  -- 86c: deja membru
  begin
    perform public.add_member('10000000-0000-0000-0000-000000000001', 'newhire@test.ro', '{}');
    raise exception 'TEST 86c FAIL';
  exception when others then
    if sqlerrm like '%ALREADY_MEMBER%' then raise notice 'TEST 86c PASS: deja membru => ALREADY_MEMBER';
    else raise; end if;
  end;
  -- 86g: rol custom din altă org
  begin
    perform public.add_member('10000000-0000-0000-0000-000000000001', 'nonmember@test.ro',
            array['79000000-0000-0000-0000-0000000000b1'::uuid]);
    raise exception 'TEST 86g FAIL';
  exception when others then
    if sqlerrm like '%ROLE_ORG_MISMATCH%' then raise notice 'TEST 86g PASS: rol din altă org => ROLE_ORG_MISMATCH';
    else raise; end if;
  end;
end $$;
reset role;
-- 86e: reception nu poate add_member
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';
do $$ begin
  begin
    perform public.add_member('10000000-0000-0000-0000-000000000001', 'nonmember@test.ro', '{}');
    raise exception 'TEST 86e FAIL';
  exception when others then
    if sqlerrm like '%FORBIDDEN%' then raise notice 'TEST 86e PASS: reception add_member => FORBIDDEN';
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 87: set_member_roles / set_member_property_access ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_m uuid;
begin
  select id into v_m from organization_members
  where user_id='00000000-0000-0000-0000-0000000000b1' and org_id='10000000-0000-0000-0000-000000000001';
  -- 87a: înlocuiește Reception cu Finance
  perform public.set_member_roles(v_m, array[(select id from roles where slug='finance' and org_id is null)]);
  -- 87c: proprietate din altă org → respins (Org B nu are proprietăți; folosim una validă din altă org? testăm un id inexistent ca proxy de mismatch)
  begin
    perform public.set_member_property_access(v_m, array['20000000-0000-0000-0000-0000000000ff'::uuid]);
    raise exception 'TEST 87c FAIL';
  exception when others then
    if sqlerrm like '%PROPERTY_ORG_MISMATCH%' then raise notice 'TEST 87c PASS: proprietate străină => PROPERTY_ORG_MISMATCH';
    else raise; end if;
  end;
  -- 87b: restrânge la propB (Hotel Secret, în Org A)
  perform public.set_member_property_access(v_m, array['20000000-0000-0000-0000-000000000002'::uuid]);
end $$;
reset role;
-- verificăm efectul rolurilor + scoping ca newhire
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$
declare v_orgA uuid := '10000000-0000-0000-0000-000000000001';
begin
  if app.has_permission(v_orgA, null, 'payment.refund')          -- din Finance (nou)
     and not app.has_permission(v_orgA, null, 'booking.create')  -- Reception înlocuit
     and not app.has_permission(v_orgA, '20000000-0000-0000-0000-000000000001', 'payment.refund') -- fără acces propA
  then
    raise notice 'TEST 87 PASS: roluri înlocuite (finance, nu reception) + scoping pe propB';
  else raise exception 'TEST 87 FAIL'; end if;
end $$;
reset role;

-- ---------- TEST 88: remove_member ----------
-- rulăm ca MANAGER (user.manage, dar ≠ owner) → testează CANNOT_REMOVE_OWNER
-- fără a se confunda cu garda de self-removal
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
do $$
declare v_owner_m uuid; v_m uuid; v_roles int;
begin
  -- 88a: owner-ul nu poate fi eliminat
  select id into v_owner_m from organization_members
  where user_id='00000000-0000-0000-0000-00000000000a' and org_id='10000000-0000-0000-0000-000000000001';
  begin
    perform public.remove_member(v_owner_m);
    raise exception 'TEST 88a FAIL';
  exception when others then
    if sqlerrm like '%CANNOT_REMOVE_OWNER%' then raise notice 'TEST 88a PASS: owner => CANNOT_REMOVE_OWNER';
    else raise; end if;
  end;
  -- 88b: membru normal → OK + cascade
  select id into v_m from organization_members
  where user_id='00000000-0000-0000-0000-0000000000b1' and org_id='10000000-0000-0000-0000-000000000001';
  perform public.remove_member(v_m);
  select count(*) into v_roles from member_roles where member_id = v_m;
  if not exists (select 1 from organization_members where id=v_m) and v_roles = 0 then
    raise notice 'TEST 88b PASS: membru eliminat + cascade member_roles';
  else raise exception 'TEST 88b FAIL'; end if;
end $$;
reset role;

-- ---------- TEST 89: transfer_ownership ----------
-- 89a: non-owner (manager) → FORBIDDEN
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
do $$ begin
  begin
    perform public.transfer_ownership('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a5');
    raise exception 'TEST 89a FAIL';
  exception when others then
    if sqlerrm like '%FORBIDDEN%' then raise notice 'TEST 89a PASS: non-owner transfer => FORBIDDEN';
    else raise; end if;
  end;
end $$;
reset role;
-- 89b/c: owner-a
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$ begin
  -- 89b: țintă care nu e membru
  begin
    perform public.transfer_ownership('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b9');
    raise exception 'TEST 89b FAIL';
  exception when others then
    if sqlerrm like '%NOT_A_MEMBER%' then raise notice 'TEST 89b PASS: țintă non-membru => NOT_A_MEMBER';
    else raise; end if;
  end;
  -- 89c: transfer valid către reception ...0a5
  perform public.transfer_ownership('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a5');
  if (select owner_user_id from organizations where id='10000000-0000-0000-0000-000000000001')
       = '00000000-0000-0000-0000-0000000000a5'
     and exists (select 1 from member_roles mr
       join organization_members m on m.id=mr.member_id
       where m.user_id='00000000-0000-0000-0000-0000000000a5'
         and mr.role_id=(select id from roles where slug='administrator' and org_id is null))
  then raise notice 'TEST 89c PASS: ownership transferat + rol Administrator acordat';
  else raise exception 'TEST 89c FAIL'; end if;
end $$;
reset role;
-- noul owner (...0a5) bypass-ează; verificăm
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';
do $$ begin
  if app.has_permission('10000000-0000-0000-0000-000000000001', null, 'organization.billing') then
    raise notice 'TEST 89d PASS: noul owner bypass-ează (organization.billing)';
  else raise exception 'TEST 89d FAIL'; end if;
end $$;
reset role;

-- ---------- TEST 90: roluri custom ----------
-- owner-a păstrează rolul Administrator (deci role.manage) chiar fără ownership
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_role uuid; v_cnt int;
begin
  -- 90a: creare rol custom
  v_role := public.create_role('10000000-0000-0000-0000-000000000001', 'Night Auditor',
              array['booking.view','payment.view']);
  select count(*) into v_cnt from role_permissions where role_id=v_role;
  if v_cnt = 2 then raise notice 'TEST 90a PASS: rol custom + 2 permisiuni';
  else raise exception 'TEST 90a FAIL: % permisiuni', v_cnt; end if;
  -- 90b: nume duplicat
  begin
    perform public.create_role('10000000-0000-0000-0000-000000000001', 'Night Auditor', '{}');
    raise exception 'TEST 90b FAIL';
  exception when others then
    if sqlerrm like '%ROLE_EXISTS%' then raise notice 'TEST 90b PASS: slug duplicat => ROLE_EXISTS';
    else raise; end if;
  end;
  -- 90c: permisiune inexistentă
  begin
    perform public.create_role('10000000-0000-0000-0000-000000000001', 'Bad Role', array['fake.perm']);
    raise exception 'TEST 90c FAIL';
  exception when foreign_key_violation then raise notice 'TEST 90c PASS: permisiune inventată => FK violation';
  end;
  -- 90d: update pe rol de sistem
  begin
    perform public.update_role((select id from roles where slug='administrator' and org_id is null), 'X', '{}');
    raise exception 'TEST 90d FAIL';
  exception when others then
    if sqlerrm like '%ROLE_IS_SYSTEM%' then raise notice 'TEST 90d PASS: editare rol sistem => ROLE_IS_SYSTEM';
    else raise; end if;
  end;
  -- 90f: atribuire (prin RPC) + ștergere → cascade pe member_roles
  declare v_m uuid;
  begin
    select id into v_m from organization_members
    where user_id='00000000-0000-0000-0000-0000000000a1' and org_id='10000000-0000-0000-0000-000000000001';
    perform public.set_member_roles(v_m, array[v_role]);
    perform public.delete_role(v_role);
    if not exists (select 1 from member_roles where role_id=v_role)
       and not exists (select 1 from roles where id=v_role) then
      raise notice 'TEST 90f PASS: delete_role custom → cascade member_roles, fără orfani';
    else raise exception 'TEST 90f FAIL'; end if;
  end;
end $$;
reset role;
-- 90e: manager (user.manage) POATE crea rol de bază; dar NU cu permisiuni elevate
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
do $$ begin
  -- rol de bază → OK
  perform public.create_role('10000000-0000-0000-0000-000000000001', 'Night Base', array['booking.view']);
  raise notice 'TEST 90e PASS: manager creează rol de bază (user.manage)';
  -- rol cu permisiune elevată → respins
  begin
    perform public.create_role('10000000-0000-0000-0000-000000000001', 'Fake Admin', array['user.manage']);
    raise exception 'TEST 90e FAIL: rol custom cu permisiune elevată acceptat';
  exception when others then
    if sqlerrm like '%ELEVATED_NOT_ALLOWED%' then raise notice 'TEST 90e PASS: permisiune elevată în rol custom => ELEVATED_NOT_ALLOWED';
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 91: get_org_members ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_total int; v_owner int;
begin
  select count(*) into v_total from public.get_org_members('10000000-0000-0000-0000-000000000001');
  select count(*) into v_owner from public.get_org_members('10000000-0000-0000-0000-000000000001') where is_owner;
  if v_total >= 1 and v_owner = 1 then
    raise notice 'TEST 91a PASS: get_org_members listează echipa (% membri, 1 owner)', v_total;
  else raise exception 'TEST 91a FAIL: total=% owner=%', v_total, v_owner; end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$ declare v int; begin
  select count(*) into v from public.get_org_members('10000000-0000-0000-0000-000000000001');
  if v = 0 then raise notice 'TEST 91b PASS: non-membru nu vede echipa altei org';
  else raise exception 'TEST 91b FAIL: % rânduri', v; end if;
end $$;
reset role;

-- ---------- TEST 92: gărzi anti-escaladare (subset + self) ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
do $$
declare v_self uuid;
begin
  -- 92a: manager nu poate acorda rol Administrator (tier mai mare decât al lui)
  begin
    perform public.add_member('10000000-0000-0000-0000-000000000001', 'nonmember@test.ro',
      array[(select id from roles where slug='administrator' and org_id is null)]);
    raise exception 'TEST 92a FAIL: manager a acordat Administrator';
  exception when others then
    if sqlerrm like '%ROLE_EXCEEDS_YOURS%' then raise notice 'TEST 92a PASS: manager → Administrator => ROLE_EXCEEDS_YOURS';
    else raise; end if;
  end;
  -- 92b: manager poate acorda Reception (subset al permisiunilor lui)
  perform public.add_member('10000000-0000-0000-0000-000000000001', 'nonmember@test.ro',
    array[(select id from roles where slug='reception' and org_id is null)]);
  raise notice 'TEST 92b PASS: manager → Reception (subset) OK';
  -- 92c: nu-și poate edita propriile roluri
  select id into v_self from organization_members
  where user_id='00000000-0000-0000-0000-0000000000a4' and org_id='10000000-0000-0000-0000-000000000001';
  begin
    perform public.set_member_roles(v_self, '{}');
    raise exception 'TEST 92c FAIL: manager și-a editat propriile roluri';
  exception when others then
    if sqlerrm like '%CANNOT_EDIT_SELF%' then raise notice 'TEST 92c PASS: self set_member_roles => CANNOT_EDIT_SELF';
    else raise; end if;
  end;
  -- 92d: nu se poate auto-elimina
  begin
    perform public.remove_member(v_self);
    raise exception 'TEST 92d FAIL: manager s-a auto-eliminat';
  exception when others then
    if sqlerrm like '%CANNOT_REMOVE_SELF%' then raise notice 'TEST 92d PASS: self remove_member => CANNOT_REMOVE_SELF';
    else raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- Sprint 6.3.2 — Autoritate prin tier-uri
-- ============================================================
-- al doilea admin (pt. admin↔admin), un reception scoped la propB,
-- și restrângem managerul ...0a4 la propB
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'admin2@test.ro'),
  ('00000000-0000-0000-0000-0000000000c2', 'recB2@test.ro'),
  ('00000000-0000-0000-0000-0000000000c4', 'wannabe@test.ro');
insert into organization_members (org_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'staff'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2', 'staff');
update member_roles set role_id = (select id from roles where slug='administrator' and org_id is null)
  where member_id = (select id from organization_members
                     where user_id='00000000-0000-0000-0000-0000000000c1' and org_id='10000000-0000-0000-0000-000000000001');
insert into member_property_access (member_id, property_id)
  select id, '20000000-0000-0000-0000-000000000002' from organization_members
  where user_id='00000000-0000-0000-0000-0000000000c2' and org_id='10000000-0000-0000-0000-000000000001';
insert into member_property_access (member_id, property_id)
  select id, '20000000-0000-0000-0000-000000000002' from organization_members
  where user_id='00000000-0000-0000-0000-0000000000a4' and org_id='10000000-0000-0000-0000-000000000001';

-- owner-a e ADMIN (tier 2): rolul administrator din enum owner, dar ownership a fost
-- transferat lui ...0a5 în TEST 89c → owner-a nu mai e owner structural
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_admin2 uuid; v_owner_m uuid;
begin
  -- 93a: admin nu poate gestiona alt admin
  select id into v_admin2 from organization_members
  where user_id='00000000-0000-0000-0000-0000000000c1' and org_id='10000000-0000-0000-0000-000000000001';
  begin
    perform public.set_member_roles(v_admin2, '{}');
    raise exception 'TEST 93a FAIL: admin a gestionat alt admin';
  exception when others then
    if sqlerrm like '%NOT_AUTHORIZED_OVER_MEMBER%' then raise notice 'TEST 93a PASS: admin↔admin => NOT_AUTHORIZED_OVER_MEMBER';
    else raise; end if;
  end;
  -- 93b: admin acordă manager (OK) dar nu administrator (ROLE_EXCEEDS_YOURS)
  perform public.add_member('10000000-0000-0000-0000-000000000001', 'wannabe@test.ro',
    array[(select id from roles where slug='manager' and org_id is null)]);
  raise notice 'TEST 93b PASS: admin acordă rol Manager';
  begin
    perform public.set_member_roles(
      (select id from organization_members where user_id='00000000-0000-0000-0000-0000000000c4'
         and org_id='10000000-0000-0000-0000-000000000001'),
      array[(select id from roles where slug='administrator' and org_id is null)]);
    raise exception 'TEST 93b FAIL: admin a acordat Administrator';
  exception when others then
    if sqlerrm like '%ROLE_EXCEEDS_YOURS%' then raise notice 'TEST 93b PASS: admin → Administrator => ROLE_EXCEEDS_YOURS';
    else raise; end if;
  end;
  -- 93c: owner-ul structural (...0a5) e intangibil pentru admin
  select id into v_owner_m from organization_members
  where user_id='00000000-0000-0000-0000-0000000000a5' and org_id='10000000-0000-0000-0000-000000000001';
  begin
    perform public.set_member_roles(v_owner_m, '{}');
    raise exception 'TEST 93c FAIL: admin a modificat owner-ul';
  exception when others then
    if sqlerrm like '%NOT_AUTHORIZED_OVER_MEMBER%' then raise notice 'TEST 93c PASS: owner intangibil pentru admin';
    else raise; end if;
  end;
end $$;
reset role;

-- manager ...0a4 (restrâns la propB)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
do $$
declare v_recB2 uuid; v_full uuid;
begin
  select id into v_recB2 from organization_members
  where user_id='00000000-0000-0000-0000-0000000000c2' and org_id='10000000-0000-0000-0000-000000000001';
  -- 93d: manager poate gestiona un base scoped la propB, dar NU-i dă acces la propA
  perform public.set_member_roles(v_recB2, array[(select id from roles where slug='housekeeping' and org_id is null)]);
  raise notice 'TEST 93d PASS: manager gestionează base din proprietatea lui';
  begin
    perform public.set_member_property_access(v_recB2, array['20000000-0000-0000-0000-000000000001'::uuid]);
    raise exception 'TEST 93d FAIL: manager a dat acces la propA';
  exception when others then
    if sqlerrm like '%PROPERTY_FORBIDDEN%' then raise notice 'TEST 93d PASS: manager → acces propA => PROPERTY_FORBIDDEN';
    else raise; end if;
  end;
  -- 93e: manager NU poate gestiona un base cu acces complet (vede propA)
  select id into v_full from organization_members
  where user_id='00000000-0000-0000-0000-0000000000b9' and org_id='10000000-0000-0000-0000-000000000001';
  begin
    perform public.set_member_roles(v_full, '{}');
    raise exception 'TEST 93e FAIL: manager a gestionat un membru cu acces complet';
  exception when others then
    if sqlerrm like '%NOT_AUTHORIZED_OVER_MEMBER%' then raise notice 'TEST 93e PASS: manager nu gestionează membru cu acces complet';
    else raise; end if;
  end;
  -- 93f: manager restrâns nu VEDE propA (RLS pe properties)
  if (select count(*) from properties where id='20000000-0000-0000-0000-000000000001') = 0
     and (select count(*) from properties where id='20000000-0000-0000-0000-000000000002') = 1 then
    raise notice 'TEST 93f PASS: manager restrâns vede doar propB, nu propA';
  else raise exception 'TEST 93f FAIL: vizibilitate proprietăți greșită'; end if;
end $$;
reset role;

-- ---------- TEST 94: creare proprietăți — admin DA, manager NU ----------
-- 94a: manager nu mai are property.create
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
do $$ begin
  begin
    insert into properties (org_id, name, slug, currency)
    values ('10000000-0000-0000-0000-000000000001','Mgr Prop','mgr-prop-x','RON');
    raise exception 'TEST 94a FAIL: manager a creat o proprietate';
  exception when insufficient_privilege then
    raise notice 'TEST 94a PASS: manager nu creează proprietăți (42501)';
  end;
end $$;
reset role;
-- 94b: admin (owner-a, tier 2) poate crea + vedea
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$ declare v_id uuid; begin
  insert into properties (org_id, name, slug, currency)
  values ('10000000-0000-0000-0000-000000000001','Admin Prop','admin-prop-x','RON')
  returning id into v_id;
  if exists (select 1 from properties where id = v_id) then
    raise notice 'TEST 94b PASS: admin creează + vede proprietatea';
  else raise exception 'TEST 94b FAIL: admin nu vede proprietatea creată'; end if;
end $$;
reset role;

-- ---------- TEST 95: „toate proprietățile" nu ocolește restricția actorului ----------
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c5', 'newbase@test.ro');
-- manager ...0a4 e restrâns la propB (din TEST 93)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
do $$
declare v_m uuid; v_props uuid[];
begin
  -- 95a: membrul adăugat de un actor restrâns MOȘTENEȘTE scope-ul (propB), nu acces complet
  v_m := public.add_member('10000000-0000-0000-0000-000000000001', 'newbase@test.ro',
    array[(select id from roles where slug='housekeeping' and org_id is null)]);
  select array_agg(property_id) into v_props from member_property_access where member_id = v_m;
  if v_props = array['20000000-0000-0000-0000-000000000002'::uuid] then
    raise notice 'TEST 95a PASS: membru nou moștenește scope-ul actorului (propB), nu acces complet';
  else raise exception 'TEST 95a FAIL: scope nou = %', v_props; end if;
  -- 95b: actor restrâns NU poate acorda „toate" (listă goală)
  begin
    perform public.set_member_property_access(v_m, '{}');
    raise exception 'TEST 95b FAIL: actor restrâns a acordat „toate"';
  exception when others then
    if sqlerrm like '%PROPERTY_FORBIDDEN%' then raise notice 'TEST 95b PASS: „toate" de la actor restrâns => PROPERTY_FORBIDDEN';
    else raise; end if;
  end;
  -- 95c: poate seta un subset al proprietăților lui (propB)
  perform public.set_member_property_access(v_m, array['20000000-0000-0000-0000-000000000002'::uuid]);
  raise notice 'TEST 95c PASS: actor restrâns acordă subset propriu (propB)';
end $$;
reset role;
-- 95d: actor NERESTRICȚIONAT (admin owner-a) POATE acorda „toate"
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_m uuid;
begin
  select id into v_m from organization_members
  where user_id='00000000-0000-0000-0000-0000000000c5' and org_id='10000000-0000-0000-0000-000000000001';
  perform public.set_member_property_access(v_m, '{}');
  if not exists (select 1 from member_property_access where member_id = v_m) then
    raise notice 'TEST 95d PASS: admin nerestricționat acordă „toate" (acces complet)';
  else raise exception 'TEST 95d FAIL'; end if;
end $$;
reset role;

-- ---------- TEST 96: ADMIN restrâns — blocare server-side (bypass UI imposibil) ----------
-- scenariul exact: administrator cu acces la o singură proprietate (propB) NU poate,
-- apelând RPC-ul DIRECT (fără interfață), să acorde „toate" sau propA.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c6', 'radmin@test.ro'),
  ('00000000-0000-0000-0000-0000000000c7', 'target7@test.ro');
insert into organization_members (org_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c6', 'staff');
update member_roles set role_id = (select id from roles where slug='administrator' and org_id is null)
  where member_id = (select id from organization_members
                     where user_id='00000000-0000-0000-0000-0000000000c6' and org_id='10000000-0000-0000-0000-000000000001');
insert into member_property_access (member_id, property_id)
  select id, '20000000-0000-0000-0000-000000000002' from organization_members
  where user_id='00000000-0000-0000-0000-0000000000c6' and org_id='10000000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c6","role":"authenticated"}';
do $$
declare v_m uuid; v_props uuid[];
begin
  -- 96a: membru adăugat de admin restrâns moștenește propB (nu acces complet)
  v_m := public.add_member('10000000-0000-0000-0000-000000000001', 'target7@test.ro',
    array[(select id from roles where slug='reception' and org_id is null)]);
  select array_agg(property_id) into v_props from member_property_access where member_id = v_m;
  if v_props = array['20000000-0000-0000-0000-000000000002'::uuid] then
    raise notice 'TEST 96a PASS: admin restrâns → membru nou moștenește propB';
  else raise exception 'TEST 96a FAIL: %', v_props; end if;
  -- 96b: APEL DIRECT RPC cu „toate" (listă goală) → blocat server-side
  begin
    perform public.set_member_property_access(v_m, '{}');
    raise exception 'TEST 96b FAIL: admin restrâns a acordat „toate" prin RPC direct';
  exception when others then
    if sqlerrm like '%PROPERTY_FORBIDDEN%' then
      raise notice 'TEST 96b PASS: „toate" prin RPC direct (fără UI) => PROPERTY_FORBIDDEN';
    else raise; end if;
  end;
  -- 96c: APEL DIRECT cu propA (pe care n-o are) → blocat server-side
  begin
    perform public.set_member_property_access(v_m, array['20000000-0000-0000-0000-000000000001'::uuid]);
    raise exception 'TEST 96c FAIL: admin restrâns a acordat propA prin RPC direct';
  exception when others then
    if sqlerrm like '%PROPERTY_FORBIDDEN%' then
      raise notice 'TEST 96c PASS: propA inaccesibilă prin RPC direct => PROPERTY_FORBIDDEN';
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 97: add_member cu selecție EXPLICITĂ de proprietăți ----------
-- Acoperă fluxul „cere proprietățile la invitare": subset valid, „toate", și
-- încercarea de a hardcoda o proprietate inaccesibilă actorului.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'exp-subset@test.ro'),
  ('00000000-0000-0000-0000-0000000000d2', 'exp-all@test.ro'),
  ('00000000-0000-0000-0000-0000000000d3', 'exp-hardcode@test.ro'),
  ('00000000-0000-0000-0000-0000000000d4', 'exp-restr-ok@test.ro'),
  ('00000000-0000-0000-0000-0000000000d5', 'exp-restr-all@test.ro');

-- 97a/97b: actor NERESTRICȚIONAT (owner-a) acordă explicit
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare v_m uuid; v_props uuid[];
begin
  -- 97a: subset explicit [propA] → exact acea proprietate
  v_m := public.add_member('10000000-0000-0000-0000-000000000001', 'exp-subset@test.ro',
    array[(select id from roles where slug='housekeeping' and org_id is null)],
    array['20000000-0000-0000-0000-000000000001'::uuid]);
  select array_agg(property_id) into v_props from member_property_access where member_id = v_m;
  if v_props = array['20000000-0000-0000-0000-000000000001'::uuid] then
    raise notice 'TEST 97a PASS: selecție explicită → doar proprietatea aleasă (propA)';
  else raise exception 'TEST 97a FAIL: scope = %', v_props; end if;

  -- 97b: „toate" (listă goală) de la actor nerestrâns → acces complet (fără rânduri mpa)
  v_m := public.add_member('10000000-0000-0000-0000-000000000001', 'exp-all@test.ro',
    array[(select id from roles where slug='housekeeping' and org_id is null)], '{}');
  if not exists (select 1 from member_property_access where member_id = v_m) then
    raise notice 'TEST 97b PASS: „toate" de la actor nerestrâns → acces complet';
  else raise exception 'TEST 97b FAIL: a creat rânduri mpa pentru „toate"'; end if;

  -- 97c: „hardcode" o proprietate la care nici actorul nu... (aici owner are tot,
  -- deci testăm cu o proprietate din ALTĂ org → PROPERTY_ORG_MISMATCH)
  begin
    perform public.add_member('10000000-0000-0000-0000-000000000001', 'exp-hardcode@test.ro',
      array[(select id from roles where slug='housekeeping' and org_id is null)],
      array['20000000-0000-0000-0000-0000000000ff'::uuid]);
    raise exception 'TEST 97c FAIL: a acceptat proprietate din altă org';
  exception when others then
    if sqlerrm like '%PROPERTY_ORG_MISMATCH%' then
      raise notice 'TEST 97c PASS: proprietate din altă org la invitare => PROPERTY_ORG_MISMATCH';
    else raise; end if;
  end;
end $$;
reset role;

-- 97d/97e: actor RESTRÂNS (manager ...0a4, doar propB) — hardcode propA = inaccesibilă
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
do $$
declare v_m uuid; v_props uuid[];
begin
  -- 97d: subset propriu (propB) → permis, exact propB
  v_m := public.add_member('10000000-0000-0000-0000-000000000001', 'exp-restr-ok@test.ro',
    array[(select id from roles where slug='housekeeping' and org_id is null)],
    array['20000000-0000-0000-0000-000000000002'::uuid]);
  select array_agg(property_id) into v_props from member_property_access where member_id = v_m;
  if v_props = array['20000000-0000-0000-0000-000000000002'::uuid] then
    raise notice 'TEST 97d PASS: actor restrâns acordă explicit subsetul propriu (propB)';
  else raise exception 'TEST 97d FAIL: scope = %', v_props; end if;

  -- 97e-1: hardcode propA (la care actorul restrâns NU are acces) → PROPERTY_FORBIDDEN
  begin
    perform public.add_member('10000000-0000-0000-0000-000000000001', 'exp-hardcode@test.ro',
      array[(select id from roles where slug='housekeeping' and org_id is null)],
      array['20000000-0000-0000-0000-000000000001'::uuid]);
    raise exception 'TEST 97e FAIL: actor restrâns a hardcodat propA';
  exception when others then
    if sqlerrm like '%PROPERTY_FORBIDDEN%' then
      raise notice 'TEST 97e PASS: hardcode propA de la actor restrâns => PROPERTY_FORBIDDEN';
    else raise; end if;
  end;

  -- 97e-2: „toate" (listă goală) de la actor restrâns → PROPERTY_FORBIDDEN
  begin
    perform public.add_member('10000000-0000-0000-0000-000000000001', 'exp-restr-all@test.ro',
      array[(select id from roles where slug='housekeeping' and org_id is null)], '{}');
    raise exception 'TEST 97f FAIL: actor restrâns a acordat „toate" la invitare';
  exception when others then
    if sqlerrm like '%PROPERTY_FORBIDDEN%' then
      raise notice 'TEST 97f PASS: „toate" la invitare de la actor restrâns => PROPERTY_FORBIDDEN';
    else raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- Sprint 7 — entity_events (audit generic) + get_activity_feed
-- ============================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare
  v_rule_id uuid;
  v_promo_id uuid;
  v_event record;
  v_count int;
begin
  -- 98a: creare proprietate => entity_events 'created'
  insert into properties (id, org_id, name, slug, is_published)
  values ('20000000-0000-0000-0000-0000000000aa', '10000000-0000-0000-0000-000000000001',
          'Pensiune Test', 'pensiune-test-98', false);
  select * into v_event from entity_events
    where entity_type = 'property' and entity_id = '20000000-0000-0000-0000-0000000000aa';
  if v_event.event_type = 'created' and v_event.new_data->>'name' = 'Pensiune Test' then
    raise notice 'TEST 98a PASS: creare proprietate => entity_events(created)';
  else raise exception 'TEST 98a FAIL: %', v_event; end if;

  -- 98b: update proprietate => 'updated' cu diff corect, property_id = id-ul propriu
  update properties set name = 'Pensiune Actualizată' where id = '20000000-0000-0000-0000-0000000000aa';
  select * into v_event from entity_events
    where entity_type = 'property' and entity_id = '20000000-0000-0000-0000-0000000000aa'
      and event_type = 'updated';
  if v_event.old_data->>'name' = 'Pensiune Test'
     and v_event.new_data->>'name' = 'Pensiune Actualizată'
     and v_event.property_id = '20000000-0000-0000-0000-0000000000aa' then
    raise notice 'TEST 98b PASS: update proprietate => diff corect + property_id auto-referențial';
  else raise exception 'TEST 98b FAIL: %', v_event; end if;

  -- 98c: creare oaspete => entity_events 'created', property_id NULL (entitate org-wide)
  insert into guests (id, org_id, full_name, email)
  values ('50000000-0000-0000-0000-0000000000aa', '10000000-0000-0000-0000-000000000001',
          'Oaspete Test 98', 'oaspete98@test.ro');
  select * into v_event from entity_events
    where entity_type = 'guest' and entity_id = '50000000-0000-0000-0000-0000000000aa';
  if v_event.event_type = 'created' and v_event.property_id is null then
    raise notice 'TEST 98c PASS: creare oaspete => entity_events(created), property_id NULL';
  else raise exception 'TEST 98c FAIL: %', v_event; end if;

  -- 98d/e/f: rate_rule — created → updated (preț) → deleted (old_data păstrează ultima valoare)
  insert into rate_rules (org_id, property_id, unit_type_id, kind, name, start_date, end_date, price)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001', 'season', 'Test98', '2027-01-01', '2027-01-31', 100)
  returning id into v_rule_id;
  if exists (select 1 from entity_events where entity_type = 'rate_rule' and entity_id = v_rule_id and event_type = 'created') then
    raise notice 'TEST 98d PASS: creare rate_rule => entity_events(created)';
  else raise exception 'TEST 98d FAIL'; end if;

  update rate_rules set price = 250 where id = v_rule_id;
  select * into v_event from entity_events
    where entity_type = 'rate_rule' and entity_id = v_rule_id and event_type = 'updated';
  if (v_event.old_data->>'price')::numeric = 100 and (v_event.new_data->>'price')::numeric = 250 then
    raise notice 'TEST 98e PASS: update rate_rule => diff preț (100 → 250)';
  else raise exception 'TEST 98e FAIL: %', v_event; end if;

  delete from rate_rules where id = v_rule_id;
  select * into v_event from entity_events
    where entity_type = 'rate_rule' and entity_id = v_rule_id and event_type = 'deleted';
  if (v_event.old_data->>'price')::numeric = 250 then
    raise notice 'TEST 98f PASS: delete rate_rule => entity_events(deleted) cu ultima valoare';
  else raise exception 'TEST 98f FAIL: %', v_event; end if;

  -- 98g/h/i: promoție — created → archived (is_active false) → restored (is_active true)
  insert into promotions (org_id, property_id, name, discount_type, discount_value, is_active)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
          'Test98', 'percent', 10, true)
  returning id into v_promo_id;
  if exists (select 1 from entity_events where entity_type = 'promotion' and entity_id = v_promo_id and event_type = 'created') then
    raise notice 'TEST 98g PASS: creare promoție => entity_events(created)';
  else raise exception 'TEST 98g FAIL'; end if;

  update promotions set is_active = false where id = v_promo_id;
  if exists (select 1 from entity_events where entity_type = 'promotion' and entity_id = v_promo_id and event_type = 'archived') then
    raise notice 'TEST 98h PASS: is_active true→false => entity_events(archived)';
  else raise exception 'TEST 98h FAIL'; end if;

  update promotions set is_active = true where id = v_promo_id;
  if exists (select 1 from entity_events where entity_type = 'promotion' and entity_id = v_promo_id and event_type = 'restored') then
    raise notice 'TEST 98i PASS: is_active false→true => entity_events(restored)';
  else raise exception 'TEST 98i FAIL'; end if;

  -- 98j: no-op update (touch updated_at fără schimbare reală) => NU generează eveniment nou
  select count(*) into v_count from entity_events where entity_type = 'promotion' and entity_id = v_promo_id;
  update promotions set name = name where id = v_promo_id;  -- doar updated_at se schimbă (trigger touch)
  if (select count(*) from entity_events where entity_type = 'promotion' and entity_id = v_promo_id) = v_count then
    raise notice 'TEST 98j PASS: update no-op (doar updated_at) => fără eveniment nou';
  else raise exception 'TEST 98j FAIL: a generat eveniment pentru un update fără schimbare reală'; end if;

  -- 98k: get_activity_feed include evenimentele de mai sus. Limită mare (nu 50) —
  -- în această tranzacție unică now() e înghețat la începutul tranzacției, deci
  -- created_at e identic pe mii de rânduri din testele anterioare; cu un LIMIT mic,
  -- "order by created_at desc, id desc" ar alege arbitrar 50 din ele (tiebreak pe
  -- uuid aleator) — flaky, nu o eroare reală de query.
  if exists (
    select 1 from public.get_activity_feed('20000000-0000-0000-0000-000000000001', 100000, 0)
    where entity_type = 'rate_rule' and entity_id = v_rule_id and event_type = 'created'
  ) then
    raise notice 'TEST 98k PASS: get_activity_feed include evenimentele entity_events ale proprietății';
  else raise exception 'TEST 98k FAIL: rate_rule creat nu apare în activity feed'; end if;
end $$;
reset role;

-- ---------- TEST 99: izolare RLS pe entity_events + get_activity_feed ----------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare v_count int;
begin
  -- 99a: owner B (alt org, fără acces la propA) => get_activity_feed ridică FORBIDDEN
  begin
    perform public.get_activity_feed('20000000-0000-0000-0000-000000000001', 20, 0);
    raise exception 'TEST 99a FAIL: owner B a putut citi activity feed-ul propA (altă org)';
  exception when others then
    if sqlerrm like '%FORBIDDEN%' then
      raise notice 'TEST 99a PASS: get_activity_feed pe proprietate din altă org => FORBIDDEN';
    else raise; end if;
  end;

  -- 99b: owner B nu vede direct rândurile entity_events ale org A (RLS pe select)
  select count(*) into v_count from entity_events where property_id = '20000000-0000-0000-0000-000000000001';
  if v_count = 0 then
    raise notice 'TEST 99b PASS: select direct pe entity_events ale org A => 0 rânduri (RLS)';
  else raise exception 'TEST 99b FAIL: owner B a văzut % rânduri din org A', v_count; end if;

  -- 99c: insert direct în entity_events (bypass trigger) => respins, fără politică de insert
  begin
    insert into entity_events (org_id, property_id, entity_type, entity_id, event_type)
    values ('10000000-0000-0000-0000-000000000002', null, 'property', gen_random_uuid(), 'created');
    raise exception 'TEST 99c FAIL: insert direct în entity_events a fost permis';
  exception when others then
    raise notice 'TEST 99c PASS: insert direct în entity_events respins (scris doar prin trigger): %', sqlerrm;
  end;
end $$;
reset role;

-- ---------- TEST 100: audit.view — permisiune reutilizată (Sprint 6.1), cablată acum ----------
-- audit.view e elevată: owner (structural) + administrator o au; manager și
-- rolurile de bază NU (role_redesign.sql) — exact ce verificăm aici.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'admin-audit@test.ro'),
  ('00000000-0000-0000-0000-0000000000e2', 'mgr-audit@test.ro');
insert into organization_members (org_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', 'staff'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e2', 'manager');
update member_roles set role_id = (select id from roles where slug='administrator' and org_id is null)
  where member_id = (select id from organization_members
                      where user_id='00000000-0000-0000-0000-0000000000e1'
                        and org_id='10000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
do $$
declare v_count int;
begin
  -- 100a: administrator are audit.view (din role_redesign: tot, mai puțin billing)
  if exists (select 1 from public.get_my_permissions('10000000-0000-0000-0000-000000000001') where get_my_permissions = 'audit.view') then
    raise notice 'TEST 100a PASS: administrator are audit.view';
  else raise exception 'TEST 100a FAIL: administrator ar trebui să aibă audit.view'; end if;

  -- 100b: administrator poate citi feed-ul + entity_events direct
  select count(*) into v_count from public.get_activity_feed('20000000-0000-0000-0000-000000000001', 50, 0);
  if v_count > 0 then
    raise notice 'TEST 100b PASS: administrator citește get_activity_feed (% rânduri)', v_count;
  else raise exception 'TEST 100b FAIL: administrator nu vede nimic în feed'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
do $$
declare v_count int;
begin
  -- 100c: manager NU are audit.view (exclus explicit în role_redesign.sql)
  if not exists (select 1 from public.get_my_permissions('10000000-0000-0000-0000-000000000001') where get_my_permissions = 'audit.view') then
    raise notice 'TEST 100c PASS: manager NU are audit.view';
  else raise exception 'TEST 100c FAIL: manager nu ar trebui să aibă audit.view'; end if;

  -- 100d: manager => get_activity_feed respinge cu FORBIDDEN (nu doar listă goală)
  begin
    perform public.get_activity_feed('20000000-0000-0000-0000-000000000001', 50, 0);
    raise exception 'TEST 100d FAIL: manager a putut citi activity feed-ul';
  exception when others then
    if sqlerrm like '%FORBIDDEN%' then
      raise notice 'TEST 100d PASS: manager => get_activity_feed FORBIDDEN (fără audit.view)';
    else raise; end if;
  end;

  -- 100e: manager nu vede direct entity_events (RLS pe has_permission, nu doar can_access_property)
  select count(*) into v_count from entity_events where property_id = '20000000-0000-0000-0000-000000000001';
  if v_count = 0 then
    raise notice 'TEST 100e PASS: manager (acces la proprietate, dar fără audit.view) => 0 rânduri pe entity_events';
  else raise exception 'TEST 100e FAIL: manager a văzut % rânduri pe entity_events fără audit.view', v_count; end if;
end $$;
reset role;

-- ---------- TEST 101: filtre get_activity_feed (entity_type / event_type / interval) ----------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare
  v_total int;
  v_filtered int;
  v_distinct_types int;
begin
  select count(*) into v_total from public.get_activity_feed('20000000-0000-0000-0000-000000000001', 100000, 0);

  -- 101a: filtrul pe entity_types restrânge strict la tipurile cerute
  select count(distinct entity_type) into v_distinct_types
    from public.get_activity_feed('20000000-0000-0000-0000-000000000001', 100000, 0, array['rate_rule']);
  select count(*) into v_filtered
    from public.get_activity_feed('20000000-0000-0000-0000-000000000001', 100000, 0, array['rate_rule']);
  if v_distinct_types = 1 and v_filtered > 0 and v_filtered < v_total then
    raise notice 'TEST 101a PASS: filtrul entity_types=[rate_rule] => doar rate_rule (% din % rânduri)', v_filtered, v_total;
  else raise exception 'TEST 101a FAIL: distinct_types=%, filtered=%, total=%', v_distinct_types, v_filtered, v_total; end if;

  -- 101b: filtrul pe event_types restrânge strict la tipurile de eveniment cerute
  if not exists (
    select 1 from public.get_activity_feed('20000000-0000-0000-0000-000000000001', 100000, 0, null, array['created'])
    where event_type <> 'created'
  ) then
    raise notice 'TEST 101b PASS: filtrul event_types=[created] => doar evenimente created';
  else raise exception 'TEST 101b FAIL: filtrul event_types a lăsat evenimente de alt tip'; end if;

  -- 101c: interval de dată în viitor (fără evenimente reale) => 0 rânduri
  select count(*) into v_filtered from public.get_activity_feed(
    '20000000-0000-0000-0000-000000000001', 100000, 0, null, null, '2099-01-01'::timestamptz, '2099-12-31'::timestamptz
  );
  if v_filtered = 0 then
    raise notice 'TEST 101c PASS: interval de dată fără evenimente => 0 rânduri';
  else raise exception 'TEST 101c FAIL: interval din 2099 a întors % rânduri', v_filtered; end if;

  -- 101d: interval acoperind tot (de la 2000) => identic cu fără filtru de dată
  select count(*) into v_filtered from public.get_activity_feed(
    '20000000-0000-0000-0000-000000000001', 100000, 0, null, null, '2000-01-01'::timestamptz, null
  );
  if v_filtered = v_total then
    raise notice 'TEST 101d PASS: interval larg (de la 2000) => identic cu fără filtru (% rânduri)', v_total;
  else raise exception 'TEST 101d FAIL: filtered=%, total=%', v_filtered, v_total; end if;
end $$;
reset role;

-- ============================================================
-- Sprint 8 — Housekeeping
-- Reutilizează fixturile RBAC din TEST 80: hk-a (a1, housekeeping/unit.manage),
-- mgr-a (a4, manager), rec-a (a5, reception, fără unit.manage).
-- TEST 89c a transferat ownership-ul structural către a5 (rec-a) — restaurăm
-- owner-a, altfel a5 bypass-ează toate permisiunile (nu mai e "reception simplu").
update organizations set owner_user_id = '00000000-0000-0000-0000-00000000000a'
  where id = '10000000-0000-0000-0000-000000000001';
-- a5 a primit și rolul Administrator (de sistem) la transfer — îl scoatem, păstrând
-- doar mapping-ul standard de reception (enum 'staff' din TEST 80 setup).
delete from member_roles
  where member_id = (select id from organization_members
                      where user_id = '00000000-0000-0000-0000-0000000000a5'
                        and org_id = '10000000-0000-0000-0000-000000000001')
    and role_id = (select id from roles where slug = 'administrator' and org_id is null);
insert into member_roles (member_id, role_id)
  select (select id from organization_members
          where user_id = '00000000-0000-0000-0000-0000000000a5'
            and org_id = '10000000-0000-0000-0000-000000000001'),
         (select id from roles where slug = 'reception' and org_id is null)
  on conflict do nothing;

-- TEST 93 a restrâns managerul a4 la propB — restaurăm acces complet, altfel
-- nu mai poate scrie pe camerele din propA folosite mai jos.
delete from member_property_access
  where member_id = (select id from organization_members
                      where user_id = '00000000-0000-0000-0000-0000000000a4'
                        and org_id = '10000000-0000-0000-0000-000000000001');

-- TEST 90f a reatribuit temporar rolurile lui a1 (custom role, apoi șters) —
-- restaurăm explicit rolul housekeeping înainte de a-l reutiliza aici.
delete from member_roles
  where member_id = (select id from organization_members
                      where user_id = '00000000-0000-0000-0000-0000000000a1'
                        and org_id = '10000000-0000-0000-0000-000000000001');
insert into member_roles (member_id, role_id)
  select (select id from organization_members
          where user_id = '00000000-0000-0000-0000-0000000000a1'
            and org_id = '10000000-0000-0000-0000-000000000001'),
         (select id from roles where slug = 'housekeeping' and org_id is null);
-- ============================================================

-- ---------- TEST 102: scrierea pe cleaning_status — RLS pe unit.manage ----------
-- 102a: housekeeping schimbă cleaning_status DA (unit.manage)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$ begin
  update units set cleaning_status = 'dirty' where id = '40000000-0000-0000-0000-000000000002';
  if not found then raise exception 'TEST 102a FAIL: housekeeping nu a putut schimba cleaning_status'; end if;
  raise notice 'TEST 102a PASS: housekeeping schimbă cleaning_status (unit.manage)';
end $$;
reset role;

-- 102b: reception NU schimbă cleaning_status (RLS ascunde rândul la UPDATE)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';
do $$ declare v_n int; begin
  update units set cleaning_status = 'inspected' where id = '40000000-0000-0000-0000-000000000002';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise notice 'TEST 102b PASS: reception nu schimbă cleaning_status (fără unit.manage)';
  else raise exception 'TEST 102b FAIL: reception a actualizat % rânduri', v_n; end if;
end $$;
reset role;

-- 102c: manager schimbă cleaning_status DA (unit.manage prin permisiuni complete)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
do $$ begin
  update units set cleaning_status = 'clean' where id = '40000000-0000-0000-0000-000000000002';
  if not found then raise exception 'TEST 102c FAIL: manager nu a putut schimba cleaning_status'; end if;
  raise notice 'TEST 102c PASS: manager schimbă cleaning_status (unit.manage)';
end $$;
reset role;

-- 102d: cleaning_status_at se actualizează automat la schimbarea de stare
do $$ declare v_at timestamptz; begin
  select cleaning_status_at into v_at from units where id = '40000000-0000-0000-0000-000000000002';
  if v_at > now() - interval '1 minute' then
    raise notice 'TEST 102d PASS: cleaning_status_at marchează momentul schimbării';
  else raise exception 'TEST 102d FAIL: cleaning_status_at nu a fost actualizat'; end if;
end $$;

-- ---------- TEST 103: get_housekeeping_board — gated pe unit.manage, nu doar membership ----------
-- 103a: housekeeping citește panoul (unit.manage)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$ declare v_n int; begin
  select count(*) into v_n from public.get_housekeeping_board('20000000-0000-0000-0000-000000000001');
  if v_n >= 2 then raise notice 'TEST 103a PASS: housekeeping citește get_housekeeping_board (% camere)', v_n;
  else raise exception 'TEST 103a FAIL: housekeeping a primit % camere', v_n; end if;
end $$;
reset role;

-- 103b: reception (membru org, acces la proprietate, dar fără unit.manage) => FORBIDDEN
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';
do $$ begin
  begin
    perform public.get_housekeeping_board('20000000-0000-0000-0000-000000000001');
    raise exception 'TEST 103b FAIL: reception a citit panoul housekeeping';
  exception when others then
    if sqlerrm like '%FORBIDDEN%' then raise notice 'TEST 103b PASS: reception => FORBIDDEN (fără unit.manage)';
    else raise; end if;
  end;
end $$;
reset role;

-- 103c: proprietate din altă org => FORBIDDEN (izolare tenant, înaintea verificării de permisiune)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$ begin
  begin
    perform public.get_housekeeping_board('20000000-0000-0000-0000-000000000003');
    raise exception 'TEST 103c FAIL: housekeeping a citit panoul altei org';
  exception when others then
    if sqlerrm like '%FORBIDDEN%' or sqlerrm like '%PROPERTY_NOT_FOUND%' then
      raise notice 'TEST 103c PASS: proprietate din altă org => %', sqlerrm;
    else raise; end if;
  end;
end $$;
reset role;

-- ---------- TEST 104: bulk_set_unit_cleaning_status — RLS, fără raport parțial ----------
-- 104a: housekeeping actualizează în masă (RLS autorizează ambele camere)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$ declare v_updated int; begin
  v_updated := public.bulk_set_unit_cleaning_status(
    array['40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002']::uuid[], 'inspected');
  if v_updated = 2 then raise notice 'TEST 104a PASS: housekeeping marchează 2 camere "inspected" în masă';
  else raise exception 'TEST 104a FAIL: % camere actualizate (esperat 2)', v_updated; end if;
end $$;
reset role;

-- 104b: reception => 0 actualizate (RLS filtrează rândurile, fără excepție)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';
do $$ declare v_updated int; begin
  v_updated := public.bulk_set_unit_cleaning_status(
    array['40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002']::uuid[], 'clean');
  if v_updated = 0 then raise notice 'TEST 104b PASS: reception => 0 camere actualizate (fără unit.manage)';
  else raise exception 'TEST 104b FAIL: reception a actualizat % camere', v_updated; end if;
end $$;
reset role;

-- ---------- TEST 105: Auto Dirty — check-out pune camera automat pe "dirty" ----------
-- reset camera 1 pe 'clean' (a rămas 'inspected' din TEST 104a)
update units set cleaning_status = 'clean' where id = '40000000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';
do $$ declare v_b uuid; begin
  v_b := public.create_booking('30000000-0000-0000-0000-000000000001','2061-03-10','2061-03-12',
    '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 1, 0, 'confirmed', null, false, null);
  update bookings set status = 'checked_in' where id = v_b;
  update bookings set status = 'checked_out' where id = v_b;
  raise notice 'TEST 105a PASS: rezervare dusă pe checked_out de reception (booking.edit)';
end $$;
reset role;

do $$ declare v_status text; begin
  select cleaning_status into v_status from units where id = '40000000-0000-0000-0000-000000000001';
  if v_status = 'dirty' then raise notice 'TEST 105b PASS: Auto Dirty — check-out pune camera pe "dirty"';
  else raise exception 'TEST 105b FAIL: cleaning_status = % (esperat dirty)', v_status; end if;
end $$;

-- 105c: trecerea clean -> dirty (declanșată de checkout) e auditată
do $$ begin
  if exists (
    select 1 from unit_events
    where unit_id = '40000000-0000-0000-0000-000000000001'
      and event_type = 'cleaning_status_changed'
      and old_data->>'cleaning_status' = 'clean'
      and new_data->>'cleaning_status' = 'dirty'
  ) then
    raise notice 'TEST 105c PASS: Auto Dirty e auditată în unit_events (cleaning_status_changed)';
  else raise exception 'TEST 105c FAIL: eveniment clean->dirty nu a fost găsit'; end if;
end $$;

-- ---------- TEST 106: actor pe ultima schimbare (JOIN profiles/auth.users, nu mapare client-side) ----------
-- 106a: Auto Dirty (105a, declanșat de reception rec-a) a marcat actorul corect
-- (uuid auth.uid(), nu un "system user" artificial) — e cine a apăsat check-out.
do $$ declare v_by uuid; begin
  select cleaning_status_by into v_by from units where id = '40000000-0000-0000-0000-000000000001';
  if v_by = '00000000-0000-0000-0000-0000000000a5' then
    raise notice 'TEST 106a PASS: cleaning_status_by = actorul check-out-ului (rec-a, nu un sistem artificial)';
  else raise exception 'TEST 106a FAIL: cleaning_status_by = %', v_by; end if;
end $$;

-- 106b: schimbare manuală (housekeeping) suprascrie actorul cu cel curent
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$ begin
  update units set cleaning_status = 'clean' where id = '40000000-0000-0000-0000-000000000001';
end $$;
reset role;
do $$ declare v_by uuid; begin
  select cleaning_status_by into v_by from units where id = '40000000-0000-0000-0000-000000000001';
  if v_by = '00000000-0000-0000-0000-0000000000a1' then
    raise notice 'TEST 106b PASS: schimbare manuală => cleaning_status_by = housekeeping';
  else raise exception 'TEST 106b FAIL: cleaning_status_by = %', v_by; end if;
end $$;

-- 106c: get_housekeeping_board întoarce numele afișabil prin JOIN (profiles.full_name,
-- fallback auth.users.email — fixturile de test nu au full_name, deci cade pe email),
-- fără niciun fetch separat de membri necesar pe frontend.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$ declare v_name text; begin
  select cleaning_status_by_name into v_name from public.get_housekeeping_board('20000000-0000-0000-0000-000000000001')
  where unit_id = '40000000-0000-0000-0000-000000000001';
  if v_name = 'hk-a@test.ro' then
    raise notice 'TEST 106c PASS: get_housekeeping_board întoarce cleaning_status_by_name via JOIN (%)', v_name;
  else raise exception 'TEST 106c FAIL: cleaning_status_by_name = %', v_name; end if;
end $$;
reset role;

-- 106d: evenimentul cleaning_status_changed include numele camerei (unit_name)
-- — fără el, Activity Feed arăta generic "Cameră: ..." fără să spună CARE cameră.
-- (notă: toate evenimentele dintr-o tranzacție au același now(), deci nu se poate
-- căuta "ultimul" după created_at — verificăm conținutul tranziției 106b, nu ordinea.)
do $$ begin
  if exists (
    select 1 from unit_events
    where unit_id = '40000000-0000-0000-0000-000000000001'
      and event_type = 'cleaning_status_changed'
      and old_data->>'cleaning_status' = 'dirty'
      and new_data->>'cleaning_status' = 'clean'
      and new_data->>'unit_name' = 'Camera 1'
  ) then
    raise notice 'TEST 106d PASS: evenimentul de curățenie include numele camerei (Camera 1)';
  else raise exception 'TEST 106d FAIL: eveniment cu unit_name=Camera 1 nu a fost găsit'; end if;
end $$;

-- ---------- TEST 107: get_activity_feed.actor_name — JOIN profiles server-side ----------
-- Înlocuiește maparea client-side (fetch la toți membrii org-ului doar pentru
-- email→nume) cu un singur LEFT JOIN pe profiles în RPC. Acoperă și
-- booking_events, care nu are deloc actor_email — singura sursă de nume e
-- acum actor_id → profiles, nu un fallback inexistent.

-- owner-a ('a') are profiles.full_name = 'Owner A' (setat la TEST 85b) — actor
-- cu profil cunoscut. Generăm un eveniment nou (property update), proaspăt
-- atribuit lui 'a', ca să-l localizăm precis în feed.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$ begin
  update properties set name = 'Pensiune Actualizată TEST107'
    where id = '20000000-0000-0000-0000-0000000000aa';
end $$;
reset role;

do $$ declare v_name text; begin
  select actor_name into v_name from public.get_activity_feed(
    '20000000-0000-0000-0000-0000000000aa', 100000, 0, array['property']
  ) where entity_id = '20000000-0000-0000-0000-0000000000aa' and event_type = 'updated'
    and new_data->>'name' = 'Pensiune Actualizată TEST107';
  if v_name = 'Owner A' then
    raise notice 'TEST 107a PASS: actor_name rezolvat din profiles.full_name (Owner A), fără mapare client-side';
  else raise exception 'TEST 107a FAIL: actor_name = %', coalesce(v_name, '<NULL>'); end if;
end $$;

-- hk-a (a1) nu are profiles.full_name (fixturile de test nu îl setează) =>
-- actor_name trebuie să cadă pe actor_email. NOTĂ: triggerele de audit citesc
-- emailul din auth.jwt()->>'email', iar request.jwt.claims din fixturile de
-- test nu populează 'email' (doar sub/role) — actor_email ar fi mereu NULL
-- pentru evenimente generate prin trigger în acest harness. Inserăm direct
-- (ca postgres, fără RLS) un entity_events sintetic cu un actor_email
-- explicit și fără rând în profiles, ca să verificăm strict fallback-ul
-- coalesce(profiles.full_name, actor_email) din RPC, nu limitarea fixture-ului.
insert into entity_events (org_id, property_id, entity_type, entity_id, actor_id, actor_email, event_type, new_data)
values (
  '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
  'closure', '60000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000a1',
  'hk-a-snapshot@test.ro', 'created', '{"reason":"test 107b"}'::jsonb
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$ declare v_name text; v_email text; begin
  select actor_name, actor_email into v_name, v_email from public.get_activity_feed(
    '20000000-0000-0000-0000-000000000001', 100000, 0, array['closure']
  ) where entity_id = '60000000-0000-0000-0000-0000000000aa' and event_type = 'created';
  if v_name = v_email and v_email = 'hk-a-snapshot@test.ro' then
    raise notice 'TEST 107b PASS: fără profil/full_name => actor_name cade pe actor_email (%)', v_email;
  else raise exception 'TEST 107b FAIL: actor_name=%, actor_email=%', coalesce(v_name,'<NULL>'), coalesce(v_email,'<NULL>'); end if;
end $$;
reset role;

-- ============================================================
-- Sprint 9 — Manual Price Override
-- Reutilizează actorii RBAC: a4 (manager, ARE booking.price_override),
-- a5 (reception, NU are). Owner-a (owner structural) bypass.
-- Date 2028 (libere) + auto-asignare ca să nu lovim fixturile existente.
-- Curățăm promoțiile org-ului → baseline de preț determinist (engine raw =
-- total stocat), ca să verificăm clar matematica override-ului. (Faptul că
-- override-ul ÎNLOCUIEȘTE promoția e testat separat la TEST 108a: promotion_id
-- devine null când setezi total manual.)
-- ============================================================
update promotions set is_active = false where org_id = '10000000-0000-0000-0000-000000000001';

-- ---------- TEST 108: gate permisiune la CREARE cu override ----------
-- 108a: manager creează rezervare cu total absolut 500 (override înlocuiește promo)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
do $$ declare v_b uuid; v_rec record; begin
  v_b := public.create_booking('30000000-0000-0000-0000-000000000001','2028-02-10','2028-02-13',
    '50000000-0000-0000-0000-000000000001', null, 1, 0, 'confirmed', null, false, null,
    'total', 500, null, 'Sync Booking.com');
  select total_amount, price_override_kind, price_override_value, price_override_by,
         promotion_id, discount_amount, price_override_note
    into v_rec from bookings where id = v_b;
  if v_rec.total_amount = 500 and v_rec.price_override_kind = 'total'
     and v_rec.price_override_by = '00000000-0000-0000-0000-0000000000a4'
     and v_rec.promotion_id is null and v_rec.discount_amount = 0 then
    raise notice 'TEST 108a PASS: manager creează rezervare cu total override 500 (promo înlocuită)';
  else raise exception 'TEST 108a FAIL: total=%, kind=%, by=%, promo=%', v_rec.total_amount, v_rec.price_override_kind, v_rec.price_override_by, v_rec.promotion_id; end if;
end $$;
reset role;

-- 108b: reception NU poate seta override la creare => PRICE_OVERRIDE_FORBIDDEN
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';
do $$ begin
  begin
    perform public.create_booking('30000000-0000-0000-0000-000000000001','2028-03-10','2028-03-12',
      '50000000-0000-0000-0000-000000000001', null, 1, 0, 'confirmed', null, false, null,
      'total', 200, null, null);
    raise exception 'TEST 108b FAIL: reception a setat override de preț';
  exception when others then
    if sqlerrm like '%PRICE_OVERRIDE_FORBIDDEN%' then raise notice 'TEST 108b PASS: reception => PRICE_OVERRIDE_FORBIDDEN';
    else raise; end if;
  end;
end $$;
reset role;

-- 108c: reception POATE crea fără override (regresie: override null nu blochează)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';
do $$ declare v_b uuid; begin
  v_b := public.create_booking('30000000-0000-0000-0000-000000000001','2028-03-10','2028-03-12',
    '50000000-0000-0000-0000-000000000001', null, 1, 0, 'confirmed', null, false, null);
  if v_b is not null then raise notice 'TEST 108c PASS: reception creează normal fără override';
  else raise exception 'TEST 108c FAIL'; end if;
end $$;
reset role;

-- ---------- TEST 109: editare preț pe rezervare existentă ----------
-- pregătim o rezervare normală (preț calculat de motor) creată de manager
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
do $$ declare v_b uuid; v_computed numeric; v_after numeric; begin
  v_b := public.create_booking('30000000-0000-0000-0000-000000000001','2028-04-10','2028-04-13',
    '50000000-0000-0000-0000-000000000001', null, 1, 0, 'confirmed', null, false, null);
  select total_amount into v_computed from bookings where id = v_b;

  -- 109a: ajustare -50 pe total
  perform public.override_booking_price(v_b, 'adjustment', -50, null, 'Reducere fidelitate');
  select total_amount into v_after from bookings where id = v_b;
  if v_after = v_computed - 50 then raise notice 'TEST 109a PASS: editare adjustment -50 (% -> %)', v_computed, v_after;
  else raise exception 'TEST 109a FAIL: computed=%, after=%', v_computed, v_after; end if;

  -- 109b: per_night override (3 nopți: 80+80+90 = 250)
  perform public.override_booking_price(v_b, 'per_night', null,
    '[{"date":"2028-04-10","rate":80},{"date":"2028-04-11","rate":80},{"date":"2028-04-12","rate":90}]'::jsonb, null);
  select total_amount into v_after from bookings where id = v_b;
  if v_after = 250 then raise notice 'TEST 109b PASS: editare per_night => 250';
  else raise exception 'TEST 109b FAIL: per_night total=%', v_after; end if;

  -- 109c: curățare override (kind null) => revine la prețul calculat
  perform public.override_booking_price(v_b, null, null, null, null);
  select total_amount into v_after from bookings where id = v_b;
  if v_after = v_computed then raise notice 'TEST 109c PASS: clear override => revine la preț calculat (%)', v_after;
  else raise exception 'TEST 109c FAIL: computed=%, after_clear=%', v_computed, v_after; end if;

  -- 109d: marcaj override curățat în coloane
  perform 1 from bookings where id = v_b and price_override_kind is null and price_override_by is null;
  if found then raise notice 'TEST 109d PASS: coloanele de override curățate la clear';
  else raise exception 'TEST 109d FAIL: coloanele de override nu sunt null'; end if;
end $$;
reset role;

-- 109e: reception NU poate edita prețul => FORBIDDEN
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
do $$ declare v_b uuid; begin
  v_b := public.create_booking('30000000-0000-0000-0000-000000000001','2028-05-10','2028-05-12',
    '50000000-0000-0000-0000-000000000001', null, 1, 0, 'confirmed', null, false, null);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}', true);
  begin
    perform public.override_booking_price(v_b, 'total', 100, null, null);
    raise exception 'TEST 109e FAIL: reception a editat prețul';
  exception when others then
    if sqlerrm like '%FORBIDDEN%' then raise notice 'TEST 109e PASS: reception override_booking_price => FORBIDDEN';
    else raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- Sprint 9.1 — Notă editabilă pe rezervare (update_booking_notes)
-- Reutilizează booking.edit (deja are reception a5). a1 (hk-a, housekeeping)
-- NU are booking.edit => negativ.
-- ============================================================

-- 110a: reception adaugă/editează nota pe o rezervare existentă
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
do $$ declare v_b uuid; v_note text; begin
  v_b := public.create_booking('30000000-0000-0000-0000-000000000001','2028-06-10','2028-06-12',
    '50000000-0000-0000-0000-000000000001', null, 1, 0, 'confirmed', null, false, null);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}', true);
  perform public.update_booking_notes(v_b, 'Client cere pat suplimentar');
  select notes into v_note from bookings where id = v_b;
  if v_note = 'Client cere pat suplimentar' then raise notice 'TEST 110a PASS: reception adaugă notă';
  else raise exception 'TEST 110a FAIL: notes=%', v_note; end if;

  -- 110b: editare ulterioară (suprascrie, nu adaugă)
  perform public.update_booking_notes(v_b, 'Sosire după ora 22');
  select notes into v_note from bookings where id = v_b;
  if v_note = 'Sosire după ora 22' then raise notice 'TEST 110b PASS: nota se poate edita din nou';
  else raise exception 'TEST 110b FAIL: notes=%', v_note; end if;

  -- 110c: text gol => notes redevine NULL (nu string gol)
  perform public.update_booking_notes(v_b, '   ');
  select notes into v_note from bookings where id = v_b;
  if v_note is null then raise notice 'TEST 110c PASS: notă goală => NULL';
  else raise exception 'TEST 110c FAIL: notes=%', v_note; end if;
end $$;
reset role;

-- 110d: housekeeping (a1, fără booking.edit) => FORBIDDEN
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
do $$ declare v_b uuid; begin
  v_b := public.create_booking('30000000-0000-0000-0000-000000000001','2028-06-15','2028-06-17',
    '50000000-0000-0000-0000-000000000001', null, 1, 0, 'confirmed', null, false, null);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  begin
    perform public.update_booking_notes(v_b, 'nu ar trebui să meargă');
    raise exception 'TEST 110d FAIL: housekeeping a editat nota';
  exception when others then
    if sqlerrm like '%FORBIDDEN%' then raise notice 'TEST 110d PASS: housekeeping update_booking_notes => FORBIDDEN';
    else raise; end if;
  end;
end $$;
reset role;

rollback;
