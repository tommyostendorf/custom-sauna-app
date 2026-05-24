/**
 * Client for the sauna bridge HTTP API.
 *
 * The bridge URL comes from NEXT_PUBLIC_BRIDGE_URL. In local dev it defaults to
 * the bridge on the same machine. In production it points at the Tailscale HTTPS
 * URL (set in Vercel env). An optional token is sent as a Bearer header.
 */

import { Plunge, Preset, SaunaStatus, Session, ServiceState, Settings, Visit } from "./types";

const BASE =
  process.env.NEXT_PUBLIC_BRIDGE_URL?.replace(/\/$/, "") || "http://localhost:8787";
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

export const api = {
  getStatus: () => req<SaunaStatus>("/api/status"),
  setPower: (on: boolean) => post("/api/power", { on }),
  setTemperature: (value: number, unit: "F" | "C" = "F") =>
    post("/api/temperature", { value, unit }),
  setTimer: (minutes: number) => post("/api/timer", { minutes }),
  setDelayedStart: (minutes: number) => post("/api/delayed-start", { minutes }),
  setLight: (which: "internal" | "external", on: boolean) =>
    post("/api/lights", { which, on }),

  getPresets: () => req<{ presets: Preset[] }>("/api/presets").then((r) => r.presets),
  savePreset: (p: Partial<Preset>) =>
    req<{ preset: Preset }>("/api/presets", {
      method: "POST",
      body: JSON.stringify(p),
    }).then((r) => r.preset),
  deletePreset: (id: string) => req(`/api/presets/${id}`, { method: "DELETE" }),

  getSessions: () => req<{ sessions: Session[] }>("/api/sessions").then((r) => r.sessions),

  getSettings: () => req<{ settings: Settings }>("/api/settings").then((r) => r.settings),
  saveSettings: (patch: Partial<Settings>) =>
    req<{ settings: Settings }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(patch),
    }).then((r) => r.settings),

  getVisits: () => req<{ visits: Visit[]; open: Visit | null }>("/api/visits"),
  checkIn: () => post("/api/visits/checkin", {}),
  checkOut: () => post("/api/visits/checkout", {}),

  getPlunges: () => req<{ plunges: Plunge[] }>("/api/plunges").then((r) => r.plunges),
  addPlunge: (durationSec: number, tempF?: number, note?: string) =>
    post("/api/plunges", { durationSec, tempF, note }),

  getService: () => req<{ service: ServiceState }>("/api/service").then((r) => r.service),
  markCleaned: () => post("/api/service/cleaned", {}),
  markServiced: () => post("/api/service/serviced", {}),
};

/**
 * Apply a preset: set temperature, timer, lights, then either start now or arm a
 * delayed start. Runs sequentially because each command waits for the sauna to ACK.
 */
export async function applyPreset(p: Preset): Promise<void> {
  await api.setTemperature(p.temperatureF, "F");
  await api.setTimer(p.timerMinutes);
  await api.setLight("internal", p.internalLight);
  await api.setLight("external", p.externalLight);
  if (p.delayedStartMinutes > 0) {
    await api.setDelayedStart(p.delayedStartMinutes);
  } else {
    await api.setPower(true);
  }
}
