// lib/ui/once.ts

export function getOnce(key: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(key) === "1";
}

export function setOnce(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, "1");
}
