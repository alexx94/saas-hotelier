-- ============================================================
-- Sprint 6.3.3 — Redesign clar al rolurilor de sistem
--
-- Problema: administrator și manager erau aproape identici, iar managerul avea
-- `property.create` (putea adăuga proprietăți noi) — incoerent cu scoping-ul pe
-- proprietăți (creează o proprietate, dar restrâns fiind nu o mai poate vedea).
--
-- Ierarhia corectă:
--   OWNER (structural): tot + billing/abonament + ownership/ștergere org. Doar el.
--   ADMIN: management users/roluri/PROPRIETĂȚI (creare/ștergere) + setări org +
--          audit + tot operațional. FĂRĂ billing/abonament/ownership („doar în jos").
--   MANAGER: operațional DOAR în proprietățile la care are acces + gestionează
--            useri de bază. FĂRĂ creare/ștergere proprietăți, fără role.manage,
--            fără setări org/billing/audit.
--   BASE (reception/housekeeping/finance/readonly + custom): task-uri specifice.
-- ============================================================

-- property.create/delete devin ELEVATE (admin-only, interzise în roluri custom)
update permissions set is_elevated = true where key in ('property.create', 'property.delete');

-- ============ administrator = tot, mai puțin billing (owner-only) ============
delete from role_permissions rp using roles r
  where rp.role_id = r.id and r.slug = 'administrator' and r.org_id is null;
insert into role_permissions (role_id, permission_key)
  select r.id, p.key from roles r cross join permissions p
  where r.slug = 'administrator' and r.org_id is null
    and p.key <> 'organization.billing';

-- ============ manager = operațional + management base, FĂRĂ structural/admin ============
delete from role_permissions rp using roles r
  where rp.role_id = r.id and r.slug = 'manager' and r.org_id is null;
insert into role_permissions (role_id, permission_key)
  select r.id, p.key from roles r cross join permissions p
  where r.slug = 'manager' and r.org_id is null
    and p.key not in (
      'property.create', 'property.delete',  -- structural → doar admin/owner
      'role.manage',                          -- managementul de roluri → admin
      'organization.edit', 'organization.billing', 'audit.view'  -- platformă/org → admin/owner
    );

-- Notă: `organization.billing` nu mai e acordat NICIUNUI rol — rămâne exclusiv
-- pentru owner (prin bypass structural). Reprezintă abonamentul/facturarea.
