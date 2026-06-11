-- ============================================================
-- Migrația 11 (Sprint 2.1): căutare oaspeți după telefon, indiferent de format
--   guests.phone păstrează formatul tastat ("+40 722-111.222");
--   phone_search = doar cifrele (generată din app.normalize_phone, ca
--   indexul unic) => "0722111" găsește oaspetele oricum a fost salvat.
-- ============================================================

alter table guests
  add column phone_search text
  generated always as (app.normalize_phone(phone)) stored;
