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
  "common.no_results": "Niciun rezultat",
  "common.back": "Înapoi",

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
} as const

export type TranslationKey = keyof typeof ro
