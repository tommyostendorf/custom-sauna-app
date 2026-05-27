/**
 * Where the sauna lives on the local network, for native mode.
 *
 * For now this defaults to a known IP and can be overridden (persisted in
 * localStorage). A proper discovery / "find my sauna" onboarding flow comes later;
 * consumers won't all be at the same address.
 */

const KEY = "insaunity.saunaHost";
const DEFAULT_HOST = "192.168.86.216";

export function getSaunaHost(): string {
  if (typeof localStorage === "undefined") return DEFAULT_HOST;
  return localStorage.getItem(KEY)?.trim() || DEFAULT_HOST;
}

export function setSaunaHost(host: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, host.trim());
}
