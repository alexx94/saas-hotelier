export const ro = {
  // comune
  "common.save": "Salvează",
  "common.cancel": "Anulează",
  "common.delete": "Șterge",
  "common.edit": "Editează",
  "common.add": "Adaugă",
  "common.search": "Caută",
  "common.loading": "Se încarcă...",
  "common.actions": "Acțiuni",
  "common.name": "Nume",
  "common.error": "A apărut o eroare",
  "common.confirm_delete": "Sigur vrei să ștergi?",
  "common.confirm_action": "Confirmare acțiune",
  "common.no_results": "Niciun rezultat",
  "common.back": "Înapoi",
  "common.prev_page": "Înapoi",
  "common.next_page": "Înainte",
  "common.show_more": "Afișează mai mult",
  "history.end": "Ai ajuns la finalul istoricului.",

  // auth
  "auth.email": "Email",
  "auth.password": "Parolă",
  "auth.login": "Autentificare",
  "auth.signup": "Creează cont",
  "auth.logout": "Deconectare",
  "auth.no_account": "Nu ai cont?",
  "auth.have_account": "Ai deja cont?",
  "auth.invalid_credentials": "Email sau parolă greșite",
  "auth.signup_success": "Cont creat. Verifică emailul pentru confirmare.",

  // onboarding
  "onboarding.title": "Creează organizația ta",
  "onboarding.subtitle": "Organizația grupează proprietățile și echipa ta.",
  "onboarding.org_name": "Numele organizației",
  "onboarding.org_slug": "Identificator (URL)",
  "onboarding.create": "Creează organizația",

  // navigație
  "nav.dashboard": "Panou",
  "nav.calendar": "Calendar",
  "nav.bookings": "Rezervări",
  "nav.properties": "Proprietăți",
  "nav.guests": "Oaspeți",

  // proprietăți
  "properties.title": "Proprietăți",
  "properties.add": "Adaugă proprietate",
  "properties.empty": "Nu ai nicio proprietate încă.",
  "properties.name": "Numele proprietății",
  "properties.slug": "Identificator URL (pagina publică)",
  "properties.type": "Tip",
  "properties.type.hotel": "Hotel",
  "properties.type.villa": "Vilă",
  "properties.type.apartment": "Apartament",
  "properties.type.hostel": "Hostel",
  "properties.type.guesthouse": "Pensiune",
  "properties.city": "Oraș",
  "properties.address": "Adresă",
  "properties.currency": "Monedă",
  "properties.published": "Publicat",
  "properties.unpublished": "Nepublicat",
  "properties.publish": "Publică pagina",
  "properties.unpublish": "Retrage pagina",
  "properties.public_page": "Pagina publică",

  // tipuri de camere
  "unit_types.title": "Tipuri de camere",
  "unit_types.add": "Adaugă tip de cameră",
  "unit_types.empty": "Niciun tip de cameră definit.",
  "unit_types.name": "Numele tipului",
  "unit_types.capacity": "Capacitate (persoane)",
  "unit_types.base_price": "Preț / noapte",
  "unit_types.rooms_count": "Număr de camere",
  "unit_types.room_prefix": "Prefix camere",
  "unit_types.units": "camere",
  "unit_types.archive": "Arhivează",
  "unit_types.archived": "Arhivat",
  "unit_types.delete_blocked":
    "Tipul are rezervări în istoric și nu poate fi șters. L-am arhivat.",

  // rezervări
  "bookings.title": "Rezervări",
  "bookings.add": "Rezervare nouă",
  "bookings.empty": "Nicio rezervare.",
  "bookings.guest": "Oaspete",
  "bookings.unit": "Camera",
  "bookings.unit_type": "Tip cameră",
  "bookings.check_in": "Check-in",
  "bookings.check_out": "Check-out",
  "bookings.guests_count": "Persoane",
  "bookings.total": "Total",
  "bookings.status": "Status",
  "bookings.notes": "Note",
  "bookings.source": "Sursă",
  "bookings.not_available": "Nu există camere libere pe intervalul ales.",
  "bookings.unit_blocked":
    "Camera este blocată (mentenanță/indisponibilă) pe intervalul ales.",
  "calendar.legend.unavailable": "Cameră indisponibilă (status)",
  "bookings.created": "Rezervare creată",
  "bookings.block": "Blochează camera",

  // statusuri
  "status.pending": "În așteptare",
  "status.confirmed": "Confirmată",
  "status.cancelled": "Anulată",
  "status.checked_in": "Cazat",
  "status.checked_out": "Plecat",
  "status.no_show": "Neprezentare",
  "status.blocked": "Blocată",

  // oaspeți
  "guests.title": "Oaspeți",
  "guests.add": "Adaugă oaspete",
  "guests.empty": "Niciun oaspete.",
  "guests.full_name": "Nume complet",
  "guests.phone": "Telefon",

  // stări camere
  "unit.status.active": "Activă",
  "unit.status.inactive": "Inactivă",
  "unit.status.out_of_service": "În mentenanță",
  "unit.status.archived": "Arhivată",
  "unit.status_label": "Stare cameră",
  "unit.has_future_bookings": "Camera are rezervări viitoare. Mută-le sau anulează-le mai întâi.",
  "unit.archived_warning": "Camerele arhivate nu mai pot fi rezervate.",

  // reasignare booking
  "bookings.reassign": "Mută în altă cameră",
  "bookings.reassign_title": "Mută rezervarea",
  "bookings.reassign_select": "Alege camera nouă",
  "bookings.reassigned_ok": "Rezervarea a fost mutată cu succes",
  "bookings.not_reassignable": "Rezervarea nu poate fi mutată (status final).",
  "bookings.unit_not_available": "Camera aleasă nu este disponibilă pe acest interval.",

  // selecție cameră
  "bookings.room_selection": "Alocare cameră",
  "bookings.auto_assign": "Alocare automată",
  "bookings.manual_select": "Aleg camera manual",
  "bookings.select_unit": "Selectează camera",
  "bookings.unit_occupied": "ocupată",
  "bookings.unit_free": "liberă",

  // istoric booking
  "bookings.history": "Istoric",
  "bookings.history_empty": "Niciun eveniment înregistrat.",
  "bookings.event.created": "Rezervare creată",
  "bookings.event.status_changed": "Status schimbat",
  "bookings.event.reassigned": "Cameră schimbată",
  "bookings.event.dates_changed": "Date modificate",
  "bookings.event.updated": "Actualizată",

  // guest search
  "guests.search_placeholder": "Caută după nume, email sau telefon",
  "guests.select_or_create": "Selectează sau creează oaspete",
  "guests.create_new": "Creează oaspete nou",
  "guests.found_by_email": "Oaspete existent găsit după email",
  "guests.found_by_phone": "Oaspete existent găsit după telefon",
  "guests.duplicate": "Există deja un oaspete cu acest email sau telefon.",

  // booking — total și nopți
  "bookings.nights": "nopți",
  "bookings.per_night": "/ noapte",
  "bookings.price_estimate": "Estimare cost",
  "calendar.room_type": "Tip cameră",

  // camere — adaugă mai multe
  "units.add_more": "Adaugă camere în plus",
  "units.add_count": "Câte camere",
  "units.add_prefix": "Prefix",
  "units.added_toast": "camere adăugate",

  // camere — numerotare bulk (Sprint 3)
  "units.numbering": "Număr camere",
  "units.numbering_placeholder": "ex: 101-120 sau 20",
  "units.numbering_hint":
    "Interval (101-120) sau număr de camere (cu start opțional).",
  "units.start_at": "Începe de la",
  "units.invalid_numbering":
    "Format invalid. Folosește un interval (ex: 101-120) sau un număr de camere (max 500).",

  // camere — operațiuni bulk (Sprint 3)
  "units.selected": "selectate",
  "units.bulk_activate": "Activează",
  "units.bulk_deactivate": "Dezactivează",
  "units.bulk_archive": "Arhivează",
  "units.bulk_block": "Blochează",
  "units.block": "Blochează",
  "units.bulk_updated_toast": "camere actualizate",
  "units.bulk_blocked_toast": "Blocate (au rezervări viitoare):",
  "units.bulk_archive_confirm":
    "Arhivezi camerele selectate? Nu vor mai putea fi rezervate.",
  "units.bulk_delete": "Șterge",
  "units.bulk_deleted_toast": "camere șterse",
  "units.bulk_deactivated_toast": "dezactivate (au rezervări istorice)",

  // camere — istoric (Sprint 3)
  "units.history": "Istoric cameră",
  "units.history_empty": "Niciun eveniment înregistrat.",
  "unit.event.created": "Cameră creată",
  "unit.event.status_changed": "Stare schimbată",
  "unit.event.renamed": "Redenumită",
  "unit.event.block_created": "Blocaj creat",
  "unit.event.block_updated": "Blocaj modificat",
  "unit.event.block_removed": "Blocaj eliminat",
  "unit.event.by": "de",

  // tipuri de camere — istoric + ștergere blocată (Sprint 3)
  "unit_types.history": "Istoric tip cameră",
  "unit_type.event.created": "Tip creat",
  "unit_type.event.updated": "Actualizat",
  "unit_type.event.archived": "Arhivat",
  "unit_type.event.restored": "Reactivat",
  // blocaje de disponibilitate (Sprint 3 — Availability Blocks)
  "blocks.title": "Blocaje",
  "blocks.manage": "Blocaje",
  "blocks.add": "Adaugă blocaj",
  "blocks.create": "Creează blocaj",
  "blocks.start": "De la",
  "blocks.end": "Până la",
  "blocks.reason": "Motiv",
  "blocks.notes": "Note",
  "blocks.empty": "Niciun blocaj pentru această cameră.",
  "blocks.created": "Blocaj creat. Camera nu poate fi rezervată pe interval.",
  "blocks.removed": "Blocaj eliminat. Camera redevine disponibilă.",
  "blocks.overlaps": "Intervalul se suprapune cu o rezervare sau alt blocaj existent.",
  "blocks.invalid_dates": "Data de sfârșit trebuie să fie după cea de început.",
  "blocks.unit_not_active": "Doar camerele active pot fi blocate.",
  "blocks.bulk_done": "camere blocate",
  "blocks.bulk_skipped": "Sărite (suprapunere cu rezervări/blocaje):",
  "blocks.confirm_remove": "Elimini acest blocaj? Camera redevine disponibilă pe interval.",
  "blocks.remove": "Elimină blocajul",
  "blocks.bulk_remove": "Elimină blocajele din interval",
  "blocks.bulk_remove_confirm":
    "Elimini toate blocajele care ating intervalul ales, de pe camerele selectate?",
  "blocks.bulk_removed_toast": "blocaje eliminate",
  "blocks.reason.maintenance": "Mentenanță",
  "blocks.reason.renovation": "Renovare",
  "blocks.reason.owner_use": "Uz proprietar",
  "blocks.reason.internal_use": "Uz intern",
  "blocks.reason.other": "Alt motiv",

  "unit_types.restore": "Reactivează",
  "unit_types.restored_toast": "Tipul a fost reactivat.",
  "unit_types.has_future_bookings":
    "Tipul are camere cu rezervări viitoare. Mută-le sau anulează-le mai întâi.",

  // booking — UX date
  "bookings.checkout_from": "de la",
  "bookings.nights_quick": "nopți rapide",

  // setări cont
  "nav.settings": "Setări",
  "settings.account": "Cont",
  "auth.new_password": "Parolă nouă",
  "auth.confirm_password": "Confirmă parola",
  "auth.change_password": "Schimbă parola",
  "auth.password_changed": "Parola a fost schimbată cu succes",

  // booking — confirmări schimbare status
  "bookings.confirm_action": "Confirmare acțiune",
  "bookings.confirm_continue": "Continuă",
  "bookings.warn_early_checkin":
    "Data de check-in nu a sosit încă. Cazezi oaspetele mai devreme?",
  "bookings.warn_early_checkout":
    "Oaspetele pleacă mai devreme decât data de check-out. Continui?",
  "bookings.warn_no_show_early":
    "Data de check-in nu a trecut încă. Sigur marchezi neprezentare?",
  "bookings.warn_revert":
    "Revii la statusul anterior. Continui?",
  "bookings.warn_reinstate":
    "Rezervarea anulată va fi reactivată. Camera trebuie să fie liberă pe interval. Continui?",
  "bookings.revert_section": "Corectează",

  // booking — editare date
  "bookings.edit_dates": "Modifică datele",
  "bookings.dates_updated": "Datele rezervării au fost actualizate",
  "bookings.not_editable": "Rezervarea nu mai poate fi modificată (status final)",
  "bookings.invalid_transition": "Această tranziție de status nu este permisă",
  "bookings.invalid_date_range": "Check-out trebuie să fie după check-in",

  // pagina publică
  "public.check_availability": "Verifică disponibilitatea",
  "public.book_now": "Rezervă",
  "public.no_availability": "Nu există camere disponibile pe acest interval.",
  "public.per_night": "/ noapte",
  "public.total_for_stay": "total pentru sejur",
  "public.available_rooms": "camere disponibile",
  "public.your_details": "Datele tale",
  "public.booking_success":
    "Rezervarea ta a fost trimisă! Vei primi confirmarea pe email.",
  "public.booking_ref": "Cod rezervare",

  // profil oaspete (Sprint 2)
  "guests.profile": "Profil oaspete",
  "guests.edit": "Editează profilul",
  "guests.updated": "Profilul a fost actualizat",
  "guests.deleted": "Oaspetele a fost șters",
  "guests.delete_blocked":
    "Oaspetele are rezervări în istoric și nu poate fi șters.",
  "guests.delete_confirm":
    "Ștergi definitiv acest profil de oaspete?",
  "guests.bookings_title": "Rezervările oaspetelui",
  "guests.no_bookings": "Nicio rezervare pentru acest oaspete.",
  "guests.stat_total": "Total rezervări",
  "guests.stat_upcoming": "Viitoare",
  "guests.stat_cancelled": "Anulate",
  "guests.member_since": "Adăugat la",
  "guests.notes": "Note interne",
  "guests.view_profile": "Vezi profilul",
  "guests.not_found": "Oaspetele nu a fost găsit.",

  // pagina rezervării (Sprint 2)
  "bookings.detail_title": "Detalii rezervare",
  "bookings.view_details": "Vezi detaliile",
  "bookings.property": "Proprietate",
  "bookings.created_at": "Creată la",
  "bookings.not_found": "Rezervarea nu a fost găsită.",
  "bookings.snapshot_title": "Datele de la rezervare",
  "bookings.snapshot_hint":
    "Datele introduse în momentul rezervării. Profilul oaspetelui poate diferi.",
  "bookings.linked_profile": "Profil asociat",
  "bookings.link_guest": "Asociază alt profil",
  "bookings.link_guest_hint":
    "Leagă rezervarea de alt profil de oaspete. Datele de la rezervare rămân neschimbate.",
  "bookings.guest_linked": "Profilul a fost asociat rezervării",
  "bookings.event.guest_changed": "Profil oaspete schimbat",
  "bookings.source.admin": "Recepție",
  "bookings.source.public": "Pagina publică",
  "bookings.source.blocked": "Blocare",
  "bookings.unit_price": "Preț / noapte",
  "bookings.event.payment_status": "Stare plată schimbată",

  // plăți (Sprint 4)
  "payments.title": "Plăți",
  "payments.payment": "Plată",
  "payments.add": "Adaugă plată",
  "payments.add_refund": "Rambursare",
  "payments.amount": "Sumă",
  "payments.method": "Metodă",
  "payments.paid_at": "Data plății",
  "payments.note": "Notă",
  "payments.paid": "Încasat",
  "payments.balance": "Rest de plată",
  "payments.balance_due": "Rest de plată",
  "payments.overpaid": "Încasat în plus",
  "payments.overpaid_warning": "Atenție: s-a încasat mai mult decât totalul, cu",
  "payments.recorded_by": "consemnat de",
  "payments.empty": "Nicio plată înregistrată.",
  "payments.recorded": "Plată înregistrată",
  "payments.refund_recorded": "Rambursare înregistrată",
  "payments.deleted": "Plată ștearsă",
  "payments.delete": "Șterge plata",
  "payments.delete_confirm": "Ștergi această tranzacție? Starea plății se recalculează.",
  "payments.invalid_amount": "Suma trebuie să fie mai mare decât zero.",
  "payments.status.unpaid": "Neplătit",
  "payments.status.partial": "Parțial",
  "payments.status.paid": "Plătit",
  "payments.status.refunded": "Rambursat",
  "payments.method.cash": "Numerar",
  "payments.method.card": "Card",
  "payments.method.bank_transfer": "Transfer bancar",
  "payments.method.online": "Online",
  "payments.method.other": "Altă metodă",

  // venit (Sprint 4 — dashboard)
  "revenue.title": "Venit",
  "revenue.today": "Venit azi",
  "revenue.month": "Venit luna aceasta",
  "revenue.year": "Venit anul acesta",
} as const

export type TranslationKey = keyof typeof ro
