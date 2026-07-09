import type { GuestSelection } from "./guest-quick-field"
import type { useFindOrCreateGuest } from "./hooks"

// Rezolvă selecția din GuestQuickField la un guest_id efectiv: „existing" întoarce
// direct id-ul deja cunoscut; „new" creează oaspetele (cu dedupe email/telefon,
// server-side) prin find_or_create_guest. Sursă unică — extras din fostul
// quick-booking-dialog, folosit acum de singurul BookingFormDialog.
export async function resolveGuestId(
  guest: GuestSelection,
  findOrCreate: ReturnType<typeof useFindOrCreateGuest>
): Promise<string> {
  if (guest.kind === "existing") return guest.guestId
  const result = await findOrCreate.mutateAsync({
    fullName: guest.fullName,
    email: guest.email,
    phone: guest.phone,
  })
  return result.guest_id
}
