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

interface Data {
  presets: Preset[];
  sessions: Session[];
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

const DEFAULTS: Data = {
  presets: [
    { id: 'p1', name: 'Quick Session', emoji: '🔥', temperatureF: 150, timerMinutes: 30, delayedStartMinutes: 0, internalLight: true, externalLight: false },
    { id: 'p2', name: 'Full Detox', emoji: '💧', temperatureF: 165, timerMinutes: 45, delayedStartMinutes: 0, internalLight: true, externalLight: false },
    { id: 'p3', name: 'Warm Up in 30', emoji: '⏰', temperatureF: 160, timerMinutes: 40, delayedStartMinutes: 30, internalLight: true, externalLight: false },
  ],
  sessions: [],
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
