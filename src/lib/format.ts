export function money(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: paise % 100 ? 2 : 0 }).format(paise / 100);
}
export function date(value: Date | string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(value));
}
export function statusLabel(text: string) {
  return text.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
export function tomorrowDate() {
  return new Date(Date.now()+86400000).toISOString().slice(0,10);
}