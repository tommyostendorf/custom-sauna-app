/**
 * Backend factory — picks how the app reaches the sauna.
 *
 * Native (Capacitor) builds run the Gizwits protocol directly on the device with no
 * bridge (Mode B). Everything else (web/PWA) talks to the Node bridge over HTTP
 * (Mode A), unchanged.
 */

import { Capacitor } from "@capacitor/core";
import { HttpBackend } from "./http";
import { NativeBackend } from "./native";
import { SaunaBackend } from "./types";

let cached: SaunaBackend | null = null;

export function getBackend(): SaunaBackend {
  if (cached) return cached;
  cached = Capacitor.isNativePlatform() ? new NativeBackend() : new HttpBackend();
  return cached;
}
