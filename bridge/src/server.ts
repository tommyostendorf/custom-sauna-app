/**
 * Sauna Bridge — a small always-on HTTP service that translates simple REST
 * calls into the Clearlight sauna's Gizwits LAN protocol.
 *
 * The PWA (or anything else) talks to this; this talks to the sauna. It holds a
 * single persistent connection to the sauna and auto-reconnects on its own.
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { ClearlightDevice } from './gizwits/device';
import { SaunaState } from './gizwits/protocol';
import {
  getPresets, savePreset, deletePreset,
  getSessions, startSession, endSession, updateOpenSessionMaxTemp,
} from './store';

// --- Config ---
const SAUNA_HOST = process.env.SAUNA_HOST;
const PORT = Number(process.env.PORT ?? 8787);
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN?.trim() || null;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '*').trim();

if (!SAUNA_HOST) {
  console.error('FATAL: SAUNA_HOST is not set. Copy .env.example to .env and set the sauna IP.');
  process.exit(1);
}

// --- Temperature helpers (the protocol stores temps in Fahrenheit) ---
const cToF = (c: number) => (c * 9) / 5 + 32;
const fToC = (f: number) => ((f - 32) * 5) / 9;
const round1 = (n: number) => Math.round(n * 10) / 10;

// --- The single sauna connection ---
const device = new ClearlightDevice({
  host: SAUNA_HOST,
  pollingInterval: 10000,
  log: (msg, ...args) => console.log('[sauna] ' + msg, ...args),
});

function connectWithRetry() {
  device.connect().catch((err) => {
    // The device schedules its own reconnect on disconnect; this only covers the
    // very first attempt failing (e.g. sauna powered off at startup).
    console.warn('[sauna] initial connect failed, retrying in 10s:', err.message);
    setTimeout(connectWithRetry, 10000);
  });
}
connectWithRetry();

device.on('authenticated', () => console.log('[sauna] connected and authenticated'));
device.on('disconnected', () => console.log('[sauna] disconnected'));
device.on('error', (e: Error) => console.warn('[sauna] error:', e.message));

// Auto-log sessions by watching power transitions in the state stream.
device.on('state', (state: SaunaState, prev: SaunaState | null) => {
  if (state.power) updateOpenSessionMaxTemp(state.currentTemp);
  if (prev && state.power !== prev.power) {
    if (state.power) startSession(state.currentTemp);
    else endSession();
  } else if (!prev && state.power) {
    // First state we ever saw and it's already on — begin a session.
    startSession(state.currentTemp);
  }
});

// --- Present the raw state in a friendly shape ---
function formatState(s: SaunaState) {
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
    displayUnit: s.celsius ? 'C' : 'F',
  };
}

// --- App ---
const app = express();
app.use(express.json());
app.use(cors({ origin: ALLOWED_ORIGINS === '*' ? true : ALLOWED_ORIGINS.split(',').map((o) => o.trim()) }));

// Health check is public (no auth) so monitoring can hit it freely.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, sauna: { host: SAUNA_HOST, connected: device.isConnected } });
});

// Auth middleware for everything below (only if a token is configured).
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!BRIDGE_TOKEN) return next();
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token !== BRIDGE_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// Wrap an async control action: ensure connected, run it, return fresh state.
async function runControl(res: Response, action: () => Promise<void>) {
  if (!device.isConnected) {
    return res.status(503).json({ error: 'Sauna is offline (not connected). Is it powered on?' });
  }
  try {
    await action();
    res.json({ ok: true, state: device.state ? formatState(device.state) : null });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
}

// --- Status ---
app.get('/api/status', (_req, res) => {
  res.json({
    connected: device.isConnected,
    state: device.state ? formatState(device.state) : null,
  });
});

// --- Power ---
app.post('/api/power', (req, res) => {
  const { on } = req.body ?? {};
  if (typeof on !== 'boolean') return res.status(400).json({ error: 'Body must be { on: boolean }' });
  runControl(res, () => device.setPower(on));
});

// --- Temperature ---
app.post('/api/temperature', (req, res) => {
  const { value, unit } = req.body ?? {};
  if (typeof value !== 'number') return res.status(400).json({ error: 'Body must be { value: number, unit?: "F"|"C" }' });
  const tempF = (unit ?? 'F').toUpperCase() === 'C' ? cToF(value) : value;
  if (tempF < 60 || tempF > 180) return res.status(400).json({ error: 'Temperature out of range (60-180F)' });
  runControl(res, () => device.setTargetTemperature(Math.round(tempF)));
});

// --- Timer (session length, minutes) ---
app.post('/api/timer', (req, res) => {
  const { minutes } = req.body ?? {};
  if (typeof minutes !== 'number' || minutes < 0 || minutes > 60) {
    return res.status(400).json({ error: 'Body must be { minutes: 0-60 }' });
  }
  runControl(res, () => device.setTimer(Math.round(minutes)));
});

// --- Delayed start ("turn on in N minutes") ---
app.post('/api/delayed-start', (req, res) => {
  const { minutes } = req.body ?? {};
  if (typeof minutes !== 'number' || minutes < 0 || minutes > 23 * 60 + 59) {
    return res.status(400).json({ error: 'Body must be { minutes: 0-1439 }' });
  }
  runControl(res, () => (minutes === 0 ? device.cancelDelayedStart() : device.setDelayedStart(minutes)));
});

// --- Lights ---
app.post('/api/lights', (req, res) => {
  const { which, on } = req.body ?? {};
  if ((which !== 'internal' && which !== 'external') || typeof on !== 'boolean') {
    return res.status(400).json({ error: 'Body must be { which: "internal"|"external", on: boolean }' });
  }
  runControl(res, () => (which === 'internal' ? device.setInternalLight(on) : device.setExternalLight(on)));
});

// --- Presets (stored on the bridge) ---
app.get('/api/presets', (_req, res) => res.json({ presets: getPresets() }));

app.post('/api/presets', (req, res) => {
  const p = req.body ?? {};
  if (typeof p.name !== 'string' || typeof p.temperatureF !== 'number') {
    return res.status(400).json({ error: 'Preset requires at least { name, temperatureF }' });
  }
  const preset = savePreset({
    id: p.id,
    name: p.name,
    emoji: p.emoji,
    temperatureF: p.temperatureF,
    timerMinutes: Number(p.timerMinutes ?? 30),
    delayedStartMinutes: Number(p.delayedStartMinutes ?? 0),
    internalLight: !!p.internalLight,
    externalLight: !!p.externalLight,
    startMusic: !!p.startMusic,
  });
  res.json({ ok: true, preset });
});

app.delete('/api/presets/:id', (req, res) => {
  const ok = deletePreset(req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
});

// --- Session history ---
app.get('/api/sessions', (_req, res) => res.json({ sessions: getSessions() }));

app.listen(PORT, () => {
  console.log(`Sauna bridge listening on http://0.0.0.0:${PORT}`);
  console.log(`  -> talking to sauna at ${SAUNA_HOST}`);
  console.log(`  -> auth: ${BRIDGE_TOKEN ? 'token required' : 'OPEN (no token set)'}`);
});
