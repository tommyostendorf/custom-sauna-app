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
