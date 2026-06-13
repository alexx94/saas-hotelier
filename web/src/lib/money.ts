// Formatare monedă consistentă pe tot UI-ul: "120.00 RON".
// Centralizată aici ca să poată evolua ușor (ex. Intl.NumberFormat pe locale).
export function formatMoney(amount: number | string, currency: string): string {
  return `${Number(amount).toFixed(2)} ${currency}`
}
