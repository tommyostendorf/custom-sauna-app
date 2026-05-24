/**
 * Transport interfaces — the seam between the UI and however we reach the sauna.
 *
 * There are two backends behind these interfaces:
 *  - HTTP (Mode A): talks to the Node bridge over REST. Default everywhere today.
 *  - Native (Mode B, added in later phases): runs the Gizwits protocol and on-device
 *    storage directly on the phone via Capacitor, with no bridge.
 *
 * Splitting the old flat `api` object into these interfaces lets us swap the
 * implementation at runtime (per platform) without touching any UI component.
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

export interface Estimate {
  minutes: number;
  ratePerMin: number;
  samples: number;
}

/** Live device I/O — the only part that must talk to the sauna in real time. */
export interface SaunaControl {
  getStatus(): Promise<SaunaStatus>;
  setPower(on: boolean): Promise<unknown>;
  setTemperature(value: number, unit?: "F" | "C"): Promise<unknown>;
  setTimer(minutes: number): Promise<unknown>;
  setDelayedStart(minutes: number): Promise<unknown>;
  setLight(which: "internal" | "external", on: boolean): Promise<unknown>;
}

/** Persisted data — presets, history, settings, etc. Bridge-backed today; on-device in native mode. */
export interface SaunaStore {
  getPresets(): Promise<Preset[]>;
  savePreset(p: Partial<Preset>): Promise<Preset>;
  deletePreset(id: string): Promise<unknown>;
  getSessions(): Promise<Session[]>;
  getEstimate(fromF: number, toF: number): Promise<Estimate>;
  getSettings(): Promise<Settings>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;
  getVisits(): Promise<{ visits: Visit[]; open: Visit | null }>;
  checkIn(): Promise<unknown>;
  checkOut(): Promise<unknown>;
  getPlunges(): Promise<Plunge[]>;
  addPlunge(durationSec: number, tempF?: number, note?: string): Promise<unknown>;
  getService(): Promise<ServiceState>;
  markCleaned(): Promise<unknown>;
  markServiced(): Promise<unknown>;
}

/** Bridge-only side services (Spotify, web-push). Native equivalents come later (APNs, in-app PKCE). */
export interface SaunaServices {
  spotifyConnect(refreshToken: string, clientId: string): Promise<unknown>;
  spotifyStatus(): Promise<{ connected: boolean }>;
  spotifyDisconnect(): Promise<unknown>;
  getVapidPublic(): Promise<{ publicKey: string | null }>;
  pushSubscribe(subscription: unknown): Promise<unknown>;
  pushTest(): Promise<{ subscriptions: number; sent: number; errors: string[] }>;
}

/** The full backend surface the `api` object exposes. */
export interface SaunaBackend extends SaunaControl, SaunaStore, SaunaServices {}
