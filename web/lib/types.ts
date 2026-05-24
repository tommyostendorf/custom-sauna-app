export interface SaunaState {
  power: boolean;
  currentTemp: { f: number; c: number };
  targetTemp: { f: number; c: number };
  timerMinutes: number;
  delayedStart: { enabled: boolean; minutes: number };
  lights: { internal: boolean; external: boolean };
  heaters: { left: number; right: number };
  displayUnit: "F" | "C";
}

export interface SaunaStatus {
  connected: boolean;
  state: SaunaState | null;
}

export interface Preset {
  id: string;
  name: string;
  emoji?: string;
  temperatureF: number;
  timerMinutes: number;
  delayedStartMinutes: number;
  internalLight: boolean;
  externalLight: boolean;
  startMusic?: boolean;
}

export interface Session {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  maxTempF: number;
}

export interface Settings {
  saunaName: string;
  stopMusicOnOff: boolean;
}

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
