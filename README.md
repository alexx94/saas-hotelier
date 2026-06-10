# SaaS Hotelier — PMS multi-tenant

Sistem de management hotelier (Property Management System) multi-tenant: gestionezi proprietăți, tipuri de camere, rezervări, oaspeți și o pagină publică de rezervare per proprietate.

## Ce știe să facă

- **Multi-tenancy** — organizații cu membri și roluri (owner/manager/staff), izolate prin RLS.
- **Proprietăți & tipuri de camere** — CRUD proprietăți; tipuri de camere cu generare bulk de camere ("10 camere" dintr-un click) și adăugare ulterioară de camere la un tip existent.
- **Lifecycle camere** — 4 stări (activă / inactivă / mentenanță / arhivată); arhivarea e blocată dacă există rezervări viitoare.
- **Calendar rezervări** — grilă camere × zile, cu tip + capacitate per cameră și tooltip de detalii (oaspete, date, nopți, total) la click pe o rezervare.
- **Rezervări** — creare cu alocare automată sau manuală a camerei, estimare cost pe nopți, schimbare status, mutare în altă cameră, istoric audit.
- **Oaspeți** — căutare după nume / email / telefon, creare inline cu anti-duplicare.
- **Pagină publică** `/p/{slug}` — disponibilitate + formular de rezervare (anonim, status pending).
- **Cont** — meniu user cu setări (schimbare parolă), navigabil prin hash (`#settings/account`).
- **i18n** — texte în română, ușor de extins (`web/src/lib/i18n/`).
- **Mobile responsive** — sidebar colapsabil, layout adaptat.

## Stack

- **Frontend**: React + TypeScript + Vite, TanStack Router & Query, shadcn/ui, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + RLS + funcții RPC), rulat local prin Docker

## Quick start

Necesită [Supabase CLI](https://supabase.com/docs/guides/cli) și Node.js.

```bash
# 1. Pornește Supabase local (PostgreSQL + Auth în Docker)
supabase start

# 2. Configurează frontend-ul
cd web
cp .env.example .env.local   # completează cu valorile din `supabase start`
npm install
npm run dev                  # → http://localhost:5173
```

- Supabase Studio: http://127.0.0.1:54323
- La prima rulare, creează un cont prin pagina de signup, apoi o organizație (onboarding).

## Structură

```
supabase/migrations/   # schema DB (organizații, proprietăți, camere, rezervări, RPC-uri)
supabase/tests/        # teste DB (psql)
web/src/features/      # cod organizat pe feature (bookings, guests, properties, auth…)
web/src/routes/        # rute file-based TanStack Router
web/src/lib/i18n/      # texte UI
docs/ARCHITECTURE.md   # design detaliat
```

## Licență

Proiect educațional.
