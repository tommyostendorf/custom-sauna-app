/**
 * Backend factory — picks how the app reaches the sauna.
 *
 * Phase 0: always HTTP (Mode A, the Node bridge). In later phases this branches on
 * Capacitor.isNativePlatform() to return a native, bridge-free backend on the phone.
 */

import { HttpBackend } from "./http";
import { SaunaBackend } from "./types";

let cached: SaunaBackend | null = null;

export function getBackend(): SaunaBackend {
  if (cached) return cached;
  // Phase 2+ will add: if (Capacitor.isNativePlatform()) cached = new NativeBackend();
  cached = new HttpBackend();
  return cached;
}
