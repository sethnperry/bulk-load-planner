export function normState(s: string) {
  return String(s || "").trim().toUpperCase();
}

export function normCity(s: string) {
  return String(s || "").trim();
}
