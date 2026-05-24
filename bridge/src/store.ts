/**
 * Tiny JSON-file persistence for presets and session history.
 * Good enough for a single-home bridge — no database needed.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface Preset {
  id: string;
  name: string;
  emoji?: string;
  temperatureF: number;
  timerMinutes: number;
  delayedStartMinutes: number; // 0 = start now
  internalLight: boolean;
  externalLight: boolean;
  startMusic?: boolean; // launch the iOS Spotify shortcut when applied
}

export interface Session {
  id: string;
  startedAt: string; // ISO
  endedAt: string | null; // ISO, null while in progress
  durationMinutes: number | null;
  maxTempF: number;
}

export interface Settings {
  saunaName: string;
  stopMusicOnOff: boolean;
}

/** A real visit — when the person actually got in and out (separate from heater on/off). */
export interface Visit {
  id: string;
  inAt: string;
  outAt: string | null;
  minutes: number | null;
}

export interface Plunge {
  id: string;
  at: string;
  durationSec: number;
  tempF: number | null;
  note: string | null;
}

export interface ServiceState {
  lastCleanedAt: string | null;
  cleanIntervalDays: number;
  lastServicedAt: string | null;
  serviceIntervalDays: number;
}

export interface SpotifyAuth {
  refreshToken: string | null;
  clientId: string | null;
}

interface Data {
  presets: Preset[];
  sessions: Session[];
  settings: Settings;
  visits: Visit[];
  plunges: Plunge[];
  service: ServiceState;
  spotify: SpotifyAuth;
  /** Learned heat-up rates in °F per minute (most recent last). */
  heatRate: { samples: number[] };
}

/** Fallback heat-up rate (°F/min) before the sauna has learned its own. */
export const DEFAULT_HEAT_RATE = 2.5;

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

const DEFAULTS: Data = {
  presets: [
    { id: 'p1', name: 'Quick Session', emoji: '🔥', temperatureF: 150, timerMinutes: 30, delayedStartMinutes: 0, internalLight: true, externalLight: false },
    { id: 'p2', name: 'Full Detox', emoji: '💧', temperatureF: 165, timerMinutes: 45, delayedStartMinutes: 0, internalLight: true, externalLight: false },
    { id: 'p3', name: 'Warm Up in 30', emoji: '⏰', temperatureF: 160, timerMinutes: 40, delayedStartMinutes: 30, internalLight: true, externalLight: false },
  ],
  sessions: [],
  settings: { saunaName: 'My Sauna', stopMusicOnOff: false },
  visits: [],
  plunges: [],
  service: { lastCleanedAt: null, cleanIntervalDays: 7, lastServicedAt: null, serviceIntervalDays: 180 },
  spotify: { refreshToken: null, clientId: null },
  heatRate: { samples: [] },
};

let data: Data = DEFAULTS;

function load(): void {
  try {
    if (fs.existsSync(DATA_FILE)) {
      data = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
    } else {
      save();
    }
  } catch (e) {
    console.warn('[store] could not read store.json, using defaults:', (e as Error).message);
  }
}

function save(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[store] could not write store.json:', (e as Error).message);
  }
}

load();

// --- Presets ---
export const getPresets = (): Preset[] => data.presets;

export function savePreset(p: Omit<Preset, 'id'> & { id?: string }): Preset {
  const preset: Preset = { ...p, id: p.id || 'p' + Date.now() };
  const idx = data.presets.findIndex((x) => x.id === preset.id);
  if (idx >= 0) data.presets[idx] = preset;
  else data.presets.push(preset);
  save();
  return preset;
}

export function deletePreset(id: string): boolean {
  const before = data.presets.length;
  data.presets = data.presets.filter((p) => p.id !== id);
  if (data.presets.length !== before) { save(); return true; }
  return false;
}

// --- Sessions ---
export const getSessions = (): Session[] => data.sessions.slice().reverse(); // newest first

export function startSession(currentTempF: number): void {
  // Avoid duplicate open sessions
  if (data.sessions.some((s) => s.endedAt === null)) return;
  data.sessions.push({
    id: 's' + Date.now(),
    startedAt: new Date().toISOString(),
    endedAt: null,
    durationMinutes: null,
    maxTempF: currentTempF,
  });
  save();
}

export function updateOpenSessionMaxTemp(currentTempF: number): void {
  const open = data.sessions.find((s) => s.endedAt === null);
  if (open && currentTempF > open.maxTempF) {
    open.maxTempF = currentTempF;
    save();
  }
}

export function endSession(): void {
  const open = data.sessions.find((s) => s.endedAt === null);
  if (!open) return;
  const ended = new Date();
  open.endedAt = ended.toISOString();
  open.durationMinutes = Math.round((ended.getTime() - new Date(open.startedAt).getTime()) / 60000);
  save();
}

// --- Settings ---
export const getSettings = (): Settings => data.settings;

export function saveSettings(patch: Partial<Settings>): Settings {
  data.settings = { ...data.settings, ...patch };
  save();
  return data.settings;
}

// --- Visits (time actually spent inside) ---
export const getVisits = (): Visit[] => data.visits.slice().reverse();
export const getOpenVisit = (): Visit | undefined => data.visits.find((v) => v.outAt === null);

export function checkInVisit(): Visit {
  let open = data.visits.find((v) => v.outAt === null);
  if (!open) {
    open = { id: 'v' + Date.now(), inAt: new Date().toISOString(), outAt: null, minutes: null };
    data.visits.push(open);
    save();
  }
  return open;
}

export function checkOutVisit(): Visit | null {
  const open = data.visits.find((v) => v.outAt === null);
  if (!open) return null;
  const out = new Date();
  open.outAt = out.toISOString();
  open.minutes = Math.max(1, Math.round((out.getTime() - new Date(open.inAt).getTime()) / 60000));
  save();
  return open;
}

// --- Cold plunges ---
export const getPlunges = (): Plunge[] => data.plunges.slice().reverse();

export function addPlunge(p: { durationSec: number; tempF?: number | null; note?: string | null }): Plunge {
  const plunge: Plunge = {
    id: 'cp' + Date.now(),
    at: new Date().toISOString(),
    durationSec: Math.max(0, Math.round(p.durationSec)),
    tempF: p.tempF ?? null,
    note: p.note ?? null,
  };
  data.plunges.push(plunge);
  save();
  return plunge;
}

// --- Service / cleaning schedule ---
export const getService = (): ServiceState => data.service;

export function updateService(patch: Partial<ServiceState>): ServiceState {
  data.service = { ...data.service, ...patch };
  save();
  return data.service;
}

export function markCleaned(): ServiceState {
  data.service.lastCleanedAt = new Date().toISOString();
  save();
  return data.service;
}

export function markServiced(): ServiceState {
  data.service.lastServicedAt = new Date().toISOString();
  save();
  return data.service;
}

// --- Spotify auth (for bridge-side auto-pause) ---
export const getSpotify = (): SpotifyAuth => data.spotify;

export function setSpotify(refreshToken: string, clientId: string): SpotifyAuth {
  data.spotify = { refreshToken, clientId };
  save();
  return data.spotify;
}

export function clearSpotify(): void {
  data.spotify = { refreshToken: null, clientId: null };
  save();
}

// --- Heat-up rate learning ---
/** Average learned heat-up rate (°F/min), or the default if none recorded yet. */
export function getHeatRate(): { ratePerMin: number; samples: number } {
  const s = data.heatRate.samples;
  if (s.length === 0) return { ratePerMin: DEFAULT_HEAT_RATE, samples: 0 };
  const avg = s.reduce((a, b) => a + b, 0) / s.length;
  return { ratePerMin: avg, samples: s.length };
}

export function addHeatSample(ratePerMin: number): void {
  data.heatRate.samples.push(ratePerMin);
  if (data.heatRate.samples.length > 10) data.heatRate.samples.shift();
  save();
}
