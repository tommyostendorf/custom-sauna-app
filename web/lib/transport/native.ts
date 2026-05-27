/**
 * Native backend (Mode B) — runs the Gizwits protocol directly on the phone, no
 * bridge. This is the shipped consumer path.
 *
 * Phase 2 wires live device CONTROL (power/temp/timer/lights/status). Persistence
 * (presets, history, visits, plunges, service, settings) and side services
 * (Spotify, push) are stubbed here and implemented on-device in Phase 3 — the
 * stubs return safe defaults so the UI renders without a bridge.
 */

import {
  Plunge,
  Preset,
  SaunaState,
  SaunaStatus,
  Session,
  ServiceState,
  Settings,
  Visit,
} from "../types";
import { Estimate, SaunaBackend } from "./types";
import { NativeClearlightDevice } from "../native/device";
import { RawSaunaState } from "../native/gizwits";
import { getSaunaHost } from "../native/host";

const round1 = (n: number) => Math.round(n * 10) / 10;
const fToC = (f: number) => ((f - 32) * 5) / 9;
const cToF = (c: number) => (c * 9) / 5 + 32;

/** Identical mapping to the bridge's formatState(), so the UI sees the same shape. */
function mapState(s: RawSaunaState): SaunaState {
  return {
    power: s.power,
    currentTemp: { f: s.currentTemp, c: round1(fToC(s.currentTemp)) },
    targetTemp: { f: s.setTemp, c: round1(fToC(s.setTemp)) },
    timerMinutes: s.setHour * 60 + s.setMinute,
    delayedStart: {
      enabled: s.preTimeEnabled,
      minutes: s.preTimeHour * 60 + s.preTimeMinute,
    },
    lights: { internal: s.internalLight, external: s.externalLight },
    heaters: { left: s.left, right: s.right },
    displayUnit: s.celsius ? "C" : "F",
  };
}

const DEFAULT_SETTINGS: Settings = { saunaName: "My Sauna", stopMusicOnOff: false };
const DEFAULT_SERVICE: ServiceState = {
  lastCleanedAt: null,
  cleanIntervalDays: 30,
  lastServicedAt: null,
  serviceIntervalDays: 365,
};

export class NativeBackend implements SaunaBackend {
  private device = new NativeClearlightDevice(getSaunaHost);

  /** Expose the device for lifecycle hooks (background resume reconnect). */
  get nativeDevice(): NativeClearlightDevice {
    return this.device;
  }

  // --- Control (live) ---
  getStatus = async (): Promise<SaunaStatus> => {
    const { connected, state } = await this.device.getStatus();
    return { connected, state: state ? mapState(state) : null };
  };
  setPower = (on: boolean) => this.device.setPower(on);
  setTemperature = (value: number, unit: "F" | "C" = "F") =>
    this.device.setTargetTemperature(unit === "C" ? cToF(value) : value);
  setTimer = (minutes: number) => this.device.setTimer(minutes);
  setDelayedStart = (minutes: number) =>
    minutes === 0 ? this.device.cancelDelayedStart() : this.device.setDelayedStart(minutes);
  setLight = (which: "internal" | "external", on: boolean) =>
    which === "internal" ? this.device.setInternalLight(on) : this.device.setExternalLight(on);

  // --- Store (Phase 3 TODO: persist on device) ---
  getPresets = async (): Promise<Preset[]> => [];
  savePreset = async (p: Partial<Preset>): Promise<Preset> => ({
    id: p.id ?? `${Date.now()}`,
    name: p.name ?? "Preset",
    emoji: p.emoji,
    temperatureF: p.temperatureF ?? 150,
    timerMinutes: p.timerMinutes ?? 30,
    delayedStartMinutes: p.delayedStartMinutes ?? 0,
    internalLight: !!p.internalLight,
    externalLight: !!p.externalLight,
    startMusic: !!p.startMusic,
  });
  deletePreset = async () => ({ ok: true });
  getSessions = async (): Promise<Session[]> => [];
  getEstimate = async (): Promise<Estimate> => ({ minutes: 0, ratePerMin: 0, samples: 0 });
  getSettings = async (): Promise<Settings> => DEFAULT_SETTINGS;
  saveSettings = async (patch: Partial<Settings>): Promise<Settings> => ({ ...DEFAULT_SETTINGS, ...patch });
  getVisits = async (): Promise<{ visits: Visit[]; open: Visit | null }> => ({ visits: [], open: null });
  checkIn = async () => ({ ok: true });
  checkOut = async () => ({ ok: true });
  getPlunges = async (): Promise<Plunge[]> => [];
  addPlunge = async () => ({ ok: true });
  getService = async (): Promise<ServiceState> => DEFAULT_SERVICE;
  markCleaned = async () => ({ ok: true });
  markServiced = async () => ({ ok: true });

  // --- Services (Phase 5/6 TODO: APNs + in-app Spotify) ---
  spotifyConnect = async () => ({ ok: false });
  spotifyStatus = async () => ({ connected: false });
  spotifyDisconnect = async () => ({ ok: true });
  getVapidPublic = async () => ({ publicKey: null });
  pushSubscribe = async () => ({ ok: false });
  pushTest = async () => ({ subscriptions: 0, sent: 0, errors: [] as string[] });
}
