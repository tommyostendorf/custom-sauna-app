/**
 * Sauna Bridge — a small always-on HTTP service that translates simple REST
 * calls into the Clearlight sauna's Gizwits LAN protocol.
 *
 * The PWA (or anything else) talks to this; this talks to the sauna. It holds a
 * single persistent connection to the sauna and auto-reconnects on its own.
 */

import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { ClearlightDevice } from './gizwits/device';
import { SaunaState } from './gizwits/protocol';
import { findSaunaIp } from './findSauna';
import { isSpotifyConnected, pausePlayback } from './spotify';
import { ensureVapid, getVapidPublic, saveSubscription, sendToAll } from './push';
import {
  getPresets, savePreset, deletePreset,
  getSessions, startSession, endSession, updateOpenSessionMaxTemp,
  getSettings, saveSettings,
  getVisits, getOpenVisit, checkInVisit, checkOutVisit,
  getPlunges, addPlunge,
  getService, markCleaned, markServiced,
  setSpotify, clearSpotify,
  getHeatRate, addHeatSample,
} from './store';

// --- Config ---
const SAUNA_HOST = process.env.SAUNA_HOST;
const PORT = Number(process.env.PORT ?? 8787);
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN?.trim() || null;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '*').trim();

// Network interface to bind to. Defaults to localhost so the ONLY way in is via
// Tailscale (which proxies the tailnet to 127.0.0.1) — this keeps other devices on
// the same WiFi from reaching the bridge directly, which matters because there's no
// auth by default and the bridge controls a heater. Set BIND_HOST=0.0.0.0 to expose
// it on the whole local network instead (less safe; only do this on a trusted LAN).
const BIND_HOST = (process.env.BIND_HOST ?? '127.0.0.1').trim();

if (!SAUNA_HOST) {
  console.error('FATAL: SAUNA_HOST is not set. Copy .env.example to .env and set the sauna IP.');
  process.exit(1);
}

// --- Temperature helpers (the protocol stores temps in Fahrenheit) ---
const cToF = (c: number) => (c * 9) / 5 + 32;
const fToC = (f: number) => ((f - 32) * 5) / 9;
const round1 = (n: number) => Math.round(n * 10) / 10;

// Ensure Web Push keys exist (auto-generated + stored on first run).
ensureVapid();

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

// Self-healing: if we can't reach the sauna for a couple of attempts, scan the LAN
// for its control port and update the host (handles DHCP moving the sauna's IP).
let failureCount = 0;
let scanning = false;
async function rescanForSauna() {
  if (scanning) return;
  scanning = true;
  try {
    const ip = await findSaunaIp();
    if (ip && ip !== device.currentHost) {
      console.log(`[sauna] relocated: ${device.currentHost} -> ${ip}`);
      device.setHost(ip);
    }
  } catch (e) {
    console.warn('[sauna] rescan failed:', (e as Error).message);
  } finally {
    scanning = false;
  }
}
device.on('authenticated', () => { failureCount = 0; });
device.on('disconnected', () => {
  failureCount += 1;
  if (failureCount >= 2) {
    failureCount = 0;
    void rescanForSauna();
  }
});

// Session reminder: ~30 min after check-in, nudge once per visit.
let remindedVisitId: string | null = null;
setInterval(() => {
  const open = getOpenVisit();
  if (!open) {
    remindedVisitId = null;
    return;
  }
  const minutes = (Date.now() - new Date(open.inAt).getTime()) / 60000;
  if (minutes >= 30 && remindedVisitId !== open.id) {
    remindedVisitId = open.id;
    void sendToAll("You've been in 30 minutes ⏱️", 'Hydrate and listen to your body.');
  }
}, 30000);

// Track the start of a heat-up so we can learn the sauna's °F/min rate.
let heatStart: { ms: number; temp: number } | null = null;

// Auto-log sessions by watching power transitions in the state stream.
device.on('state', (state: SaunaState, prev: SaunaState | null) => {
  if (state.power) updateOpenSessionMaxTemp(state.currentTemp);

  // --- Notify when the sauna reaches target temperature (once per crossing) ---
  if (state.power && prev && prev.currentTemp < state.setTemp && state.currentTemp >= state.setTemp) {
    void sendToAll('Sauna ready 🔥', `Your sauna has reached ${state.setTemp}°F.`);
  }

  // --- Heat-up rate learning ---
  if (prev && !prev.power && state.power) heatStart = { ms: Date.now(), temp: state.currentTemp };
  if (!state.power) heatStart = null;
  if (state.power && heatStart && state.currentTemp - heatStart.temp >= 10) {
    const minutes = (Date.now() - heatStart.ms) / 60000;
    const rate = minutes > 0 ? (state.currentTemp - heatStart.temp) / minutes : 0;
    if (rate > 0.2 && rate < 20) {
      addHeatSample(rate);
      console.log(`[heat] learned rate ${rate.toFixed(2)} °F/min`);
    }
    heatStart = null; // one sample per heat-up
  }

  if (prev && state.power !== prev.power) {
    if (state.power) {
      startSession(state.currentTemp);
    } else {
      endSession();
      // Sauna just turned off — pause the music too (even if Tommy already left).
      if (isSpotifyConnected()) {
        pausePlayback().then((ok) => console.log('[spotify] auto-pause on power-off:', ok));
      }
    }
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
  if (typeof minutes !== 'number' || minutes < 0 || minutes > 359) {
    return res.status(400).json({ error: 'Body must be { minutes: 0-359 }' });
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

// --- Heat-up estimate (for "Ready by" scheduling) ---
app.get('/api/estimate', (req, res) => {
  const from = Number(req.query.from);
  const to = Number(req.query.to);
  const { ratePerMin, samples } = getHeatRate();
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return res.status(400).json({ error: 'Pass numeric ?from= and ?to= (Fahrenheit)' });
  }
  const minutes = to > from ? Math.max(1, Math.round((to - from) / ratePerMin)) : 0;
  res.json({ minutes, ratePerMin: Math.round(ratePerMin * 10) / 10, samples });
});

// --- Settings ---
app.get('/api/settings', (_req, res) => res.json({ settings: getSettings() }));

app.put('/api/settings', (req, res) => {
  const patch = req.body ?? {};
  const next: Record<string, unknown> = {};
  if (typeof patch.saunaName === 'string') next.saunaName = patch.saunaName.slice(0, 40);
  if (typeof patch.stopMusicOnOff === 'boolean') next.stopMusicOnOff = patch.stopMusicOnOff;
  res.json({ ok: true, settings: saveSettings(next) });
});

// --- Visits (time inside) ---
app.get('/api/visits', (_req, res) => res.json({ visits: getVisits(), open: getOpenVisit() ?? null }));
app.post('/api/visits/checkin', (_req, res) => res.json({ ok: true, visit: checkInVisit() }));
app.post('/api/visits/checkout', (_req, res) => res.json({ ok: true, visit: checkOutVisit() }));

// --- Cold plunges ---
app.get('/api/plunges', (_req, res) => res.json({ plunges: getPlunges() }));
app.post('/api/plunges', (req, res) => {
  const { durationSec, tempF, note } = req.body ?? {};
  if (typeof durationSec !== 'number' || durationSec < 0) {
    return res.status(400).json({ error: 'Body must include durationSec (seconds)' });
  }
  res.json({ ok: true, plunge: addPlunge({ durationSec, tempF: typeof tempF === 'number' ? tempF : null, note: note ?? null }) });
});

// --- Service / cleaning schedule ---
app.get('/api/service', (_req, res) => res.json({ service: getService() }));
app.post('/api/service/cleaned', (_req, res) => res.json({ ok: true, service: markCleaned() }));
app.post('/api/service/serviced', (_req, res) => res.json({ ok: true, service: markServiced() }));

// --- Spotify (bridge stores the refresh token so it can auto-pause on power-off) ---
app.get('/api/spotify/status', (_req, res) => res.json({ connected: isSpotifyConnected() }));
app.post('/api/spotify/connect', (req, res) => {
  const { refreshToken, clientId } = req.body ?? {};
  if (typeof refreshToken !== 'string' || typeof clientId !== 'string') {
    return res.status(400).json({ error: 'Body must be { refreshToken, clientId }' });
  }
  setSpotify(refreshToken, clientId);
  res.json({ ok: true });
});
app.post('/api/spotify/disconnect', (_req, res) => {
  clearSpotify();
  res.json({ ok: true });
});

// --- Push notifications ---
app.get('/api/push/vapid', (_req, res) => res.json({ publicKey: getVapidPublic() }));
app.post('/api/push/subscribe', (req, res) => {
  const sub = req.body?.subscription ?? req.body;
  if (!sub || typeof (sub as { endpoint?: string }).endpoint !== 'string') {
    return res.status(400).json({ error: 'Missing push subscription' });
  }
  saveSubscription(sub);
  res.json({ ok: true });
});
app.post('/api/push/test', async (_req, res) => {
  const result = await sendToAll('Test notification ✅', 'Your sauna notifications are working.');
  res.json({ ok: true, ...result });
});

// Serve the built PWA (static export) if present — lets the bridge device host the
// whole app itself, so the phone loads it same-origin (no CORS, no separate URL).
const webDir = path.join(__dirname, '..', '..', 'web', 'out');
if (fs.existsSync(webDir)) {
  app.use(express.static(webDir));
  // Fallback: any non-API GET serves the app shell (client handles the view).
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      return res.sendFile(path.join(webDir, 'index.html'));
    }
    next();
  });
  console.log('[web] serving PWA from', webDir);
}

app.listen(PORT, BIND_HOST, () => {
  console.log(`Sauna bridge listening on http://${BIND_HOST}:${PORT}`);
  console.log(`  -> talking to sauna at ${SAUNA_HOST}`);
  console.log(`  -> auth: ${BRIDGE_TOKEN ? 'token required' : 'OPEN (no token set)'}`);
  console.log(
    `  -> reach: ${BIND_HOST === '127.0.0.1' || BIND_HOST === 'localhost'
      ? 'localhost + Tailscale only (other LAN devices blocked)'
      : `bound to ${BIND_HOST} (reachable across the network)`}`,
  );
});
