# RPC — Plăți & Venit (Sprint 4)

> Fundație pentru plăți reale fără a lega schema de un procesator. Banii trăiesc într-un **registru (ledger)** `payments`; starea de plată a rezervării e un **agregat cached** întreținut de trigger. Când vine Stripe, fiecare webhook devine un rând în `payments` (`provider='stripe'`, `provider_ref=payment_intent`) — restul logicii rămâne neschimbat. Pentru e-factură, `provider_ref` poate ține seria/numărul facturii.

## Model de date

```
bookings.unit_price      ← snapshot preț/noapte la momentul rezervării (base_price se poate schimba)
bookings.total_amount    ← total snapshot (deja exista)
bookings.amount_paid     ← agregat cached: încasat − rambursat (doar tranzacții 'completed')
bookings.payment_status  ← unpaid / partial / paid / refunded (derivat din amount_paid vs total)

payments (ledger)
  kind     payment | refund          (amount mereu pozitiv; semnul îl dă kind în agregare)
  status   pending | completed | failed   (doar 'completed' intră în agregate/venit — pregătit Stripe async)
  provider 'manual' azi; 'stripe' mâine
  provider_ref  id tranzacție extern / serie factură
  paid_at  data efectivă a încasării (baza pentru revenue dashboard, în tz proprietății)
```

**De ce ledger + agregat cached și nu un singur câmp:** un câmp manual `payment_status` nu ar suporta plăți parțiale, rambursări, reconciliere cu un procesator, sau raportare de venit. Ledger-ul e singura sursă de adevăr; `amount_paid`/`payment_status` sunt o proiecție rapidă pentru liste (nu se numără pe client — vezi convenția „agregări mereu server-side").

## Trigger de sincronizare

`payments_sync_booking` (AFTER INSERT/UPDATE/DELETE pe `payments`) → `app.sync_booking_payment(booking_id)` recalculează `amount_paid` și `payment_status` din ledger. Nu scrie dacă nimic nu se schimbă (fără update-uri no-op, fără zgomot în audit). Schimbarea de `payment_status` e auditată în `booking_events` (`event_type='payment_status'`), vizibilă în istoricul rezervării.

Reguli stare: `net = încasat − rambursat`. `net ≤ 0 ∧ rambursat > 0 → refunded`; `net ≤ 0 → unpaid`; `net ≥ total → paid`; altfel `partial`.

---

## `record_payment(p_booking_id, p_amount, p_kind, p_method, p_paid_at, p_note, p_provider_ref) returns uuid`

**Scop**: înregistrează o încasare (`kind='payment'`) sau o rambursare (`kind='refund'`). Azi e singura cale de scriere în ledger (manual). Webhook-urile viitoare vor insera direct, sub un alt grant.

| | |
|---|---|
| Migrație | `20260613120000` |
| Security | DEFINER (`set search_path = ''`) |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Autorizare | `app.can_access_property(booking.property_id)` → `FORBIDDEN` |
| Frontend | `features/payments/api.ts` → `recordPayment()`, hook `useRecordPayment`, folosit în `payments-card.tsx` / `record-payment-dialog.tsx` |

**Validări/erori**: `BOOKING_NOT_FOUND`, `FORBIDDEN`, `BOOKING_NOT_PAYABLE` (rezervare `blocked`), `INVALID_KIND`, `INVALID_AMOUNT` (≤ 0), `INVALID_METHOD`. Moneda se ia din rezervare (nu de la client); `provider='manual'`, `status='completed'`, `recorded_by=auth.uid()` sunt forțate.

**Cine a consemnat** (migrația 23): `recorded_by_email` = snapshot din `auth.jwt()->>'email'` la momentul plății — același pattern ca `unit_events.actor_email`. Frontend-ul îl afișează direct pe fiecare tranzacție, fără join spre `auth.users` (neexpus prin API). Loguri complete pe termen lung.

**Supraîncasare**: `amount_paid` poate depăși `total_amount` (se încasează mai mult). Statusul rămâne `paid` (acoperit), dar UI-ul derivă `diff = total − amount_paid` **fără trunchiere**: `diff < 0` → „Încasat în plus" + avertisment; rambursarea excedentului readuce restul la 0. Sursa de adevăr e ledger-ul; nimic nu se „pierde".

**Ștergere**: corecția unei înregistrări greșite = `DELETE` direct pe `payments` sub RLS (`payments_delete`, doar owner/manager); trigger-ul resincronizează. Frontend: `deletePayment()` / `useDeletePayment`.

---

## `get_revenue_summary(p_property_id) returns table(revenue_today, revenue_month, revenue_year, currency)`

**Scop**: venit azi / luna curentă / anul curent pentru dashboard. Agregare **server-side** (convenția proiectului), în **timezone-ul proprietății**, suma tranzacțiilor `completed` cu refund pe minus.

| | |
|---|---|
| Migrație | `20260613120000` |
| Security | DEFINER, `stable` (`set search_path = ''`) |
| Grants | `authenticated` ✅ · `anon`/PUBLIC ❌ |
| Autorizare | `app.can_access_property(p_property_id)` → `FORBIDDEN` |
| Frontend | `features/payments/api.ts` → `fetchRevenueSummary()`, hook `useRevenueSummary`, folosit în `revenue-cards.tsx` (dashboard) |

**Notă scalare**: când plățile vor avea `status='pending'` (Stripe async), ele NU intră în venit până devin `completed` — comportament corect by design.
