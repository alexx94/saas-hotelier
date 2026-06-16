-- ============================================================
-- Migrația 34 (Sprint 4.8 — integritate promoții „à la Mews")
--
--   Odată ce o promoție a fost FOLOSITĂ (uses_count > 0), identitatea ei financiară
--   — codul (voucher string), tipul și valoarea reducerii — devine IMUTABILĂ.
--   Rezervările o referă (promotion_id) și au snapshot imuabil (discount_amount +
--   price_breakdown), deci modificarea retroactivă a ofertei ar face referința să
--   „mintă" față de ce a primit rezervarea. Restul (perioade, limită, scope, condiții,
--   is_active) rămâne editabil operațional.
--
--   Model Mews: „Locked Dependencies + Snapshot Ledger Invoicing". Ranforțat aici pe
--   BACKEND (trigger), nu doar în UI. Ștergerea unei promoții folosite e deja blocată
--   de FK NO ACTION pe bookings.promotion_id (se dezactivează în loc).
-- ============================================================

create function app.guard_promotion_update() returns trigger
language plpgsql as $$
begin
  -- uses_count > 0 ⟺ promoția e referită de cel puțin o rezervare (motorul incrementează
  -- contorul și setează booking.promotion_id în aceeași tranzacție)
  if old.uses_count > 0 then
    if new.code is distinct from old.code
       or new.discount_type is distinct from old.discount_type
       or new.discount_value is distinct from old.discount_value then
      raise exception 'PROMOTION_LOCKED';
    end if;
  end if;
  return new;
end $$;

create trigger promotions_guard_update
  before update on promotions
  for each row execute function app.guard_promotion_update();
