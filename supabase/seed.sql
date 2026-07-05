-- ============================================================
-- Seed LOCAL pentru dezvoltare / testare manuală.
-- Rulează automat la `supabase db reset` (config.toml → [db.seed] sql_paths).
-- NU se aplică în producție (acolo rulează doar migrările din supabase/migrations).
--
-- Cont demo:  test@hotel.ro  /  test1234   (owner pe organizația „Hotel Demo")
--
-- Populează: 1 organizație + 1 proprietate publicată, 3 tipuri de cameră (11 camere,
-- numerotate simplu 1-11), tarife (sezon + override), 3 oaspeți, 5 rezervări
-- (trecut/curent/viitor), 2 promoții (cod + automată), o închidere (stop-sell), un
-- blocaj de cameră (mentenanță) și un site public activat (slug `hotel-demo`, temă
-- „serene”, fără poze — demonstrează fallback-urile). Datele de rezervare sunt
-- relative la `current_date`.
-- ============================================================

-- ── 1. Cont auth (test@hotel.ro / test1234) ──
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change)
values (
  '00000000-0000-0000-0000-000000000000',
  'a0000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'test@hotel.ro',
  crypt('test1234', gen_salt('bf')), now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{}', '', '', '', '');

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '{"sub":"a0000000-0000-0000-0000-000000000001","email":"test@hotel.ro"}'::jsonb,
  'email', now(), now(), now());

-- ── 2. Organizație + membru owner ──
-- owner_user_id = owner structural (RBAC Sprint 6.1); insertul membrului owner
-- declanșează triggerul member_roles_sync → rolul de sistem Administrator
insert into organizations (id, name, slug, owner_user_id) values
  ('b0000000-0000-0000-0000-000000000001', 'Hotel Demo', 'hotel-demo',
   'a0000000-0000-0000-0000-000000000001');

insert into organization_members (org_id, user_id, role) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'owner');

-- ── 3. Proprietate publicată ──
insert into properties (id, org_id, name, slug, is_published, currency) values
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'Hotel Demo Marea Neagră', 'hotel-demo', true, 'RON');

-- ── 4. Tipuri de cameră ──
insert into unit_types
  (id, org_id, property_id, name, max_adults, max_children, base_price, min_stay, max_stay, turnover_days, sort_order)
values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001', 'Dublă Standard', 2, 1, 280, 1, 30, 1, 1),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001', 'Triplă',         3, 1, 360, 1, 30, 1, 2),
  ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001', 'Apartament',     4, 2, 480, 2, 30, 1, 3);

-- ── 5. Camere (numerotare simplă 1-11): duble 1-6, triple 7-9, apartamente 10-11 ──
insert into units (id, org_id, property_id, unit_type_id, name) values
  ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '1'),
  ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '2'),
  ('e0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '3'),
  ('e0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '4'),
  ('e0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '5'),
  ('e0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '6'),
  ('e0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', '7'),
  ('e0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', '8'),
  ('e0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', '9'),
  ('e0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', '10'),
  ('e0000000-0000-0000-0000-000000000011', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', '11');

-- ── 6. Tarife (sezon de vară pe Dublă + override de sărbători pe Apartament) ──
insert into rate_rules (org_id, property_id, unit_type_id, kind, name, start_date, end_date, price) values
  ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000001', 'season',   'Vară',           (date_trunc('year', current_date) + interval '6 month')::date, (date_trunc('year', current_date) + interval '8 month')::date, 350),
  ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000003', 'override', 'Sărbători iarnă', (date_trunc('year', current_date) + interval '1 year' - interval '7 day')::date, (date_trunc('year', current_date) + interval '1 year' + interval '2 day')::date, 650);

-- ── 7. Oaspeți ──
insert into guests (id, org_id, full_name, email, phone) values
  ('f0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Andrei Ionescu', 'andrei.ionescu@example.com', '+40721000111'),
  ('f0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Maria Pop',      'maria.pop@example.com',      '+40722000222'),
  ('f0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'George Marin',   'george.marin@example.com',   '+40723000333');

-- ── 8. Promoții (cod + automată early booking) ──
do $$
declare v_early uuid;
begin
  insert into promotions (org_id, property_id, name, code, discount_type, discount_value)
  values ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
          'Bun venit', 'WELCOME10', 'percent', 10);

  insert into promotions (org_id, property_id, name, discount_type, discount_value)
  values ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
          'Early booking', 'percent', 15)
  returning id into v_early;
  insert into promotion_rules (promotion_id, rule_type, value) values (v_early, 'min_advance_days', 30);
end $$;

-- ── 9. Închidere (stop-sell pe Apartament, lună viitoare) + blocaj cameră (mentenanță) ──
insert into closures (org_id, property_id, unit_type_id, start_date, end_date, reason) values
  ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000003', current_date + 30, current_date + 34, 'maintenance');

insert into room_blocks (org_id, property_id, unit_id, start_date, end_date, reason) values
  ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000005', current_date + 10, current_date + 13, 'maintenance');

-- ── 10. Rezervări (trecut / curent / viitor), cu snapshot de preț din motorul real ──
-- Total + breakdown vin din app.compute_price (sursă unică, prin lateral), nu hardcodate.
-- Camere distincte → fără suprapunere (constrângerea EXCLUDE).
insert into bookings (
  org_id, property_id, unit_type_id, unit_id, guest_id, status,
  check_in, check_out, adults, children, total_amount, unit_price, price_breakdown,
  currency, source, booked_full_name, booked_email, booked_phone)
select
  'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  b.type, b.unit, b.guest, b.status, b.ci, b.co, b.adults, b.children,
  (q.j->>'total')::numeric, (q.j->>'avg_nightly')::numeric, q.j,
  'RON', b.source, b.name, b.email, b.phone
from (values
  ('d0000000-0000-0000-0000-000000000001'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'f0000000-0000-0000-0000-000000000001'::uuid, 'checked_out', (current_date - 20), (current_date - 17), 2, 0, 'admin',  'Andrei Ionescu', 'andrei.ionescu@example.com', '+40721000111'),
  ('d0000000-0000-0000-0000-000000000001'::uuid, 'e0000000-0000-0000-0000-000000000002'::uuid, 'f0000000-0000-0000-0000-000000000002'::uuid, 'confirmed',   (current_date + 3),  (current_date + 6),  2, 1, 'admin',  'Maria Pop',      'maria.pop@example.com',      '+40722000222'),
  ('d0000000-0000-0000-0000-000000000003'::uuid, 'e0000000-0000-0000-0000-000000000010'::uuid, 'f0000000-0000-0000-0000-000000000003'::uuid, 'confirmed',   (current_date + 12), (current_date + 16), 3, 0, 'admin',  'George Marin',   'george.marin@example.com',   '+40723000333'),
  ('d0000000-0000-0000-0000-000000000002'::uuid, 'e0000000-0000-0000-0000-000000000007'::uuid, 'f0000000-0000-0000-0000-000000000001'::uuid, 'pending',     (current_date + 40), (current_date + 44), 2, 0, 'public', 'Andrei Ionescu', 'andrei.ionescu@example.com', '+40721000111'),
  ('d0000000-0000-0000-0000-000000000001'::uuid, 'e0000000-0000-0000-0000-000000000003'::uuid, 'f0000000-0000-0000-0000-000000000002'::uuid, 'confirmed',   (current_date + 5),  (current_date + 8),  2, 0, 'admin',  'Maria Pop',      'maria.pop@example.com',      '+40722000222')
) as b(type, unit, guest, status, ci, co, adults, children, source, name, email, phone)
cross join lateral (select app.compute_price(b.type, b.ci, b.co) as j) q;

-- ── 11. Site public (Sprint 10) — slug `hotel-demo`, activat, temă „serene” ──
-- Fără site_photos: nu putem pune fișiere reale în Storage din seed, deci site-ul
-- demo demonstrează intenționat fallback-urile fără poze (hero/galerie/camere).
insert into property_sites (
  org_id, property_id, slug, theme, is_enabled, contact_phone, contact_email, map_embed_url, content)
values (
  'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  'hotel-demo', 'serene', true, '+40241000111', 'contact@hotel-demo.ro',
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2848.0!2d28.6558!3d44.1733!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNDTCsDEwJzI0LjAiTiAyOMKwMzknMjEuMCJF!5e0!3m2!1sro!2sro!4v1700000000000!5m2!1sro!2sro',
  jsonb_build_object(
    'hero', jsonb_build_object(
      'title', 'Hotel Demo Marea Neagră',
      'subtitle', 'Cazare de bun-simț la câțiva pași de plajă, în inima Constanței'
    ),
    'about', jsonb_build_object(
      'enabled', true,
      'text', 'Hotel Demo Marea Neagră întâmpină oaspeții încă din 2010, la câteva minute de plajă și de centrul vechi al Constanței. Camerele sunt proaspăt renovate, iar echipa noastră vorbește română, engleză și franceză. Fie că vii pentru o vacanță de vară sau un city break de weekend, găsești liniște, curățenie și un mic dejun bun.'
    ),
    'rooms_teaser', jsonb_build_object('enabled', true, 'count', 2),
    'services', jsonb_build_object(
      'enabled', true,
      'items', jsonb_build_array(
        jsonb_build_object('icon', 'wifi', 'title', 'Wi-Fi gratuit', 'description', 'Internet de mare viteză, inclus în toate camerele și în spațiile comune.'),
        jsonb_build_object('icon', 'breakfast', 'title', 'Mic dejun inclus', 'description', 'Bufet suedez zilnic, cu produse locale, între 07:00 și 10:30.'),
        jsonb_build_object('icon', 'parking', 'title', 'Parcare privată', 'description', 'Loc de parcare gratuit, supravegheat video, la 2 minute de recepție.'),
        jsonb_build_object('icon', 'pool', 'title', 'Piscină exterioară', 'description', 'Deschisă sezonier, cu șezlonguri și umbrele puse la dispoziție gratuit.')
      )
    ),
    'map', jsonb_build_object('enabled', true),
    'contact', jsonb_build_object('enabled', true),
    'pages', jsonb_build_object('rooms', true, 'book', true)
  ));
