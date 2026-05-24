/**
 * HTTP backend (Mode A) — talks to the Node bridge over its REST API.
 *
 * This is the existing behavior, moved verbatim out of lib/api.ts. The bridge URL
 * comes from NEXT_PUBLIC_BRIDGE_URL (empty = same-origin, so a bridge that serves
 * this app "just works"). An optional Bearer token is sent if configured.
 */

import {
  Plunge,
  Preset,
  SaunaStatus,
  Session,
  ServiceState,
  Settings,
  Visit,
} from "../types";
import { Estimate, SaunaBackend } from "./types";

const BASE = process.env.NEXT_PUBLIC_BRIDGE_URL?.replace(/\/$/, "") ?? "";
const TOKEN = process.env.NEXT_PUBLIC_BRIDGE_TOKEN;

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

const post = (path: string, body: unknown) =>
  req(path, { method: "POST", body: JSON.stringify(body) });

export class HttpBackend implements SaunaBackend {
  // --- Control ---
  getStatus = () => req<SaunaStatus>("/api/status");
  setPower = (on: boolean) => post("/api/power", { on });
  setTemperature = (value: number, unit: "F" | "C" = "F") =>
    post("/api/temperature", { value, unit });
  setTimer = (minutes: number) => post("/api/timer", { minutes });
  setDelayedStart = (minutes: number) => post("/api/delayed-start", { minutes });
  setLight = (which: "internal" | "external", on: boolean) =>
    post("/api/lights", { which, on });

  // --- Store ---
  getPresets = () => req<{ presets: Preset[] }>("/api/presets").then((r) => r.presets);
  savePreset = (p: Partial<Preset>) =>
    req<{ preset: Preset }>("/api/presets", {
      method: "POST",
      body: JSON.stringify(p),
    }).then((r) => r.preset);
  deletePreset = (id: string) => req(`/api/presets/${id}`, { method: "DELETE" });

  getSessions = () =>
    req<{ sessions: Session[] }>("/api/sessions").then((r) => r.sessions);

  getEstimate = (fromF: number, toF: number) =>
    req<Estimate>(`/api/estimate?from=${Math.round(fromF)}&to=${Math.round(toF)}`);

  getSettings = () =>
    req<{ settings: Settings }>("/api/settings").then((r) => r.settings);
  saveSettings = (patch: Partial<Settings>) =>
    req<{ settings: Settings }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(patch),
    }).then((r) => r.settings);

  getVisits = () =>
    req<{ visits: Visit[]; open: Visit | null }>("/api/visits");
  checkIn = () => post("/api/visits/checkin", {});
  checkOut = () => post("/api/visits/checkout", {});

  getPlunges = () =>
    req<{ plunges: Plunge[] }>("/api/plunges").then((r) => r.plunges);
  addPlunge = (durationSec: number, tempF?: number, note?: string) =>
    post("/api/plunges", { durationSec, tempF, note });

  getService = () =>
    req<{ service: ServiceState }>("/api/service").then((r) => r.service);
  markCleaned = () => post("/api/service/cleaned", {});
  markServiced = () => post("/api/service/serviced", {});

  // --- Services ---
  spotifyConnect = (refreshToken: string, clientId: string) =>
    post("/api/spotify/connect", { refreshToken, clientId });
  spotifyStatus = () => req<{ connected: boolean }>("/api/spotify/status");
  spotifyDisconnect = () => post("/api/spotify/disconnect", {});

  getVapidPublic = () => req<{ publicKey: string | null }>("/api/push/vapid");
  pushSubscribe = (subscription: unknown) =>
    post("/api/push/subscribe", { subscription });
  pushTest = () =>
    req<{ subscriptions: number; sent: number; errors: string[] }>("/api/push/test", {
      method: "POST",
      body: JSON.stringify({}),
    });
}
