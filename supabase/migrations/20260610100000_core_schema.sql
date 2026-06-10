-- ============================================================
-- SaaS Hotelier — schema core (vezi docs/ARCHITECTURE.md)
-- ============================================================

create extension if not exists btree_gist;

-- schema internă pentru funcții helper (nu e expusă prin API)
create schema if not exists app;

-- ============ TENANCY ============

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

create table organization_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner','manager','staff')),
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);
create index organization_members_user_idx on organization_members (user_id);

-- ============ INVENTAR ============

create table properties (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  name            text not null,
  slug            text not null unique,            -- URL public: /p/{slug}
  type            text not null default 'hotel'
                  check (type in ('hotel','villa','apartment','hostel','guesthouse')),
  description     jsonb not null default '{}',     -- {"ro": "...", "en": "..."}
  address         text,
  city            text,
  country         char(2) not null default 'RO',   -- ISO 3166-1
  timezone        text not null default 'Europe/Bucharest',
  currency        char(3) not null default 'RON',  -- ISO 4217
  default_locale  text not null default 'ro',
  is_published    boolean not null default false,
  settings        jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
create index properties_org_idx on properties (org_id);

-- restricție opțională per proprietate (gol = acces la toate proprietățile org-ului)
create table member_property_access (
  member_id   uuid not null references organization_members(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  primary key (member_id, property_id)
);

-- tipul vândut public: "Cameră dublă standard", "Vila întreagă"
create table unit_types (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  property_id  uuid not null references properties(id) on delete cascade,
  name         text not null,
  description  jsonb not null default '{}',
  capacity     int  not null default 2 check (capacity > 0),
  base_price   numeric(12,2) not null default 0 check (base_price >= 0),
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
create index unit_types_property_idx on unit_types (property_id);

-- camera fizică: pe ea stau rezervările și constraint-ul anti-double-booking
create table units (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,
  unit_type_id  uuid not null references unit_types(id) on delete cascade,
  name          text not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (property_id, name)
);
create index units_property_idx on units (property_id);
create index units_type_idx on units (unit_type_id);

-- ============ GUESTS & BOOKINGS ============

create table guests (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  full_name   text not null,
  email       text,
  phone       text,
  notes       text,
  created_at  timestamptz not null default now()
);
create index guests_org_email_idx on guests (org_id, email);

create table bookings (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,
  unit_type_id  uuid not null references unit_types(id) on delete restrict,
  unit_id       uuid not null references units(id) on delete restrict,
  guest_id      uuid references guests(id),
  status        text not null default 'pending'
                check (status in ('pending','confirmed','cancelled',
                                  'checked_in','checked_out','no_show','blocked')),
  check_in      date not null,
  check_out     date not null,
  stay          daterange generated always as
                (daterange(check_in, check_out, '[)')) stored,
  guests_count  int not null default 1 check (guests_count > 0),
  total_amount  numeric(12,2) not null default 0 check (total_amount >= 0),
  currency      char(3) not null,
  source        text not null default 'admin'
                check (source in ('admin','public','blocked')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (check_out > check_in),
  check (status = 'blocked' or guest_id is not null),

  -- inima sistemului: două rezervări active nu se pot suprapune pe aceeași cameră
  constraint no_double_booking exclude using gist
    (unit_id with =, stay with &&)
    where (status not in ('cancelled','no_show'))
);
create index bookings_property_checkin_idx on bookings (property_id, check_in);
create index bookings_org_created_idx on bookings (org_id, created_at desc);

-- updated_at automat
create function app.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger bookings_set_updated_at
  before update on bookings
  for each row execute function app.set_updated_at();
