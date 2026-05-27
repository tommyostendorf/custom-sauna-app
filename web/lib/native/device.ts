/**
 * Native Clearlight device client — on-device equivalent of the bridge's
 * bridge/src/gizwits/device.ts, built for Capacitor's request/response TCP plugin.
 *
 * Architecture (mirrors the bridge, which is proven to work):
 *   - ONE persistent authenticated connection.
 *   - A single background loop owns all socket I/O. Each tick it: flushes queued
 *     outgoing frames, sends a heartbeat every 4s (required — the sauna ignores
 *     control on a connection that isn't heartbeating), then does a short blocking
 *     read and parses any frames. Because only the loop touches the socket, send and
 *     read never overlap, sidestepping the plugin's single-call concurrency limits.
 *   - Operations (getStatus / setX) enqueue a frame and await a waiter that the loop
 *     resolves when the matching reply (0x91 state / 0x94 control ACK) arrives.
 *
 * Control mirrors the bridge: wait for the 0x94 ACK, wait ~2.5s for the sauna to
 * action it, then re-read state to confirm (one retry), so callers get a rejected
 * promise if the sauna doesn't confirm.
 */

import { TcpConnection } from "./tcp";
import {
  Command,
  RawSaunaState,
  TCP_PORT,
  buildControlFrame,
  buildFlagControl,
  buildFrame,
  buildMinuteControl,
  buildPreHourControl,
  buildPreMinuteControl,
  buildTempControl,
  concatBytes,
  parseFrame,
  parseState,
  FLAG_CF,
  FLAG_EXTERNAL_LIGHT,
  FLAG_INTERNAL_LIGHT,
  FLAG_POWER,
  FLAG_PRE_TIME,
} from "./gizwits";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// --- Lightweight debug trace, surfaced in the dev socket-test panel ---
const DBG: string[] = [];
function dbg(msg: string): void {
  const now = new Date();
  const ts = `${now.toLocaleTimeString()}.${String(now.getMilliseconds()).padStart(3, "0")}`;
  DBG.push(`${ts} ${msg}`);
  while (DBG.length > 300) DBG.shift();
}
export function nativeDebugLog(): string[] {
  return DBG.slice();
}
export function clearNativeDebugLog(): void {
  DBG.length = 0;
}
const cmdHex = (c: number) => "0x" + c.toString(16).padStart(2, "0");

export class NativeClearlightDevice {
  private conn = new TcpConnection();
  private getHost: () => string;
  private port: number;

  private connected = false;
  private authenticated = false;
  private passcode: Uint8Array | null = null;
  private recvBuf: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  private seq = 0;
  private _state: RawSaunaState | null = null;

  private outQueue: Uint8Array[] = [];
  private ackWaiters: Array<() => void> = [];
  private stateWaiters: Array<() => void> = [];
  private loopRunning = false;
  private lastHeartbeat = 0;

  private chain: Promise<unknown> = Promise.resolve();

  constructor(getHost: () => string, port: number = TCP_PORT) {
    this.getHost = getHost;
    this.port = port;
  }

  get state(): RawSaunaState | null {
    return this._state;
  }
  get isConnected(): boolean {
    return this.connected && this.authenticated;
  }

  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn) as Promise<T>;
    this.chain = next.catch(() => {});
    return next;
  }

  // --- Public API ---

  getStatus(): Promise<{ connected: boolean; state: RawSaunaState | null }> {
    return this.run(async () => {
      try {
        await this.ensureConnected();
        this.enqueue(buildFrame(Command.STATE_REQUEST, Uint8Array.of(0x02)));
        await this.waitFor(this.stateWaiters, 4000);
      } catch {
        this.connected = false;
      }
      return { connected: this.isConnected, state: this._state };
    });
  }

  setPower(on: boolean): Promise<void> {
    return this.run(() =>
      this.controlAndVerify(buildFlagControl(FLAG_POWER, on), (s) => s.power === on, "power"),
    );
  }

  setTargetTemperature(tempF: number): Promise<void> {
    const t = Math.round(tempF);
    return this.run(() =>
      this.controlAndVerify(buildTempControl(t), (s) => Math.abs(s.setTemp - t) <= 1, "temperature"),
    );
  }

  setInternalLight(on: boolean): Promise<void> {
    return this.run(() =>
      this.controlAndVerify(buildFlagControl(FLAG_INTERNAL_LIGHT, on), (s) => s.internalLight === on, "internal light"),
    );
  }

  setExternalLight(on: boolean): Promise<void> {
    return this.run(() =>
      this.controlAndVerify(buildFlagControl(FLAG_EXTERNAL_LIGHT, on), (s) => s.externalLight === on, "wall light"),
    );
  }

  setCelsius(celsius: boolean): Promise<void> {
    return this.run(() =>
      this.controlAndVerify(buildFlagControl(FLAG_CF, celsius), (s) => s.celsius === celsius, "unit"),
    );
  }

  setTimer(minutes: number): Promise<void> {
    return this.run(async () => {
      await this.ensureConnected();
      this.enqueue(buildControlFrame(++this.seq, buildMinuteControl(minutes)));
      if (!(await this.waitFor(this.ackWaiters, 6000))) throw new Error("Sauna did not acknowledge the command");
      await delay(2500);
      this.enqueue(buildFrame(Command.STATE_REQUEST, Uint8Array.of(0x02)));
      await this.waitFor(this.stateWaiters, 5000);
    });
  }

  setDelayedStart(totalMinutes: number): Promise<void> {
    const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
    const hours = Math.floor(clamped / 60);
    const mins = clamped % 60;
    return this.run(async () => {
      await this.ensureConnected();
      await this.sendControlAwaitAck(buildPreHourControl(hours));
      await this.sendControlAwaitAck(buildPreMinuteControl(mins));
      await this.verify(buildFlagControl(FLAG_PRE_TIME, true), (s) => s.preTimeEnabled, "delayed start");
    });
  }

  cancelDelayedStart(): Promise<void> {
    return this.run(() =>
      this.controlAndVerify(buildFlagControl(FLAG_PRE_TIME, false), (s) => !s.preTimeEnabled, "cancel delayed start"),
    );
  }

  disconnect(): Promise<void> {
    return this.run(async () => {
      this.connected = false;
      this.authenticated = false;
      await this.conn.disconnect().catch(() => {});
      this.recvBuf = new Uint8Array(0);
    });
  }

  // --- Connection + loop ---

  private async ensureConnected(): Promise<void> {
    if (this.connected && this.authenticated && this.loopRunning) {
      dbg("ensureConnected: reusing live connection");
      return;
    }
    dbg(`ensureConnected: (re)connecting connected=${this.connected} auth=${this.authenticated} loop=${this.loopRunning}`);
    await this.openAndHandshake();
    this.startLoop();
  }

  private async openAndHandshake(): Promise<void> {
    await this.conn.disconnect().catch(() => {});
    this.connected = false;
    this.authenticated = false;
    this.passcode = null;
    this.recvBuf = new Uint8Array(0);
    this.outQueue = [];

    dbg(`connecting tcp ${this.getHost()}:${this.port}`);
    const t0 = Date.now();
    await this.conn.connect(this.getHost(), this.port);
    this.connected = true;
    dbg(`tcp connected in ${Date.now() - t0}ms`);

    // Handshake reads happen inline here, before the loop owns the socket.
    await this.conn.sendBytes(buildFrame(Command.PASSCODE_REQUEST));
    dbg("sent passcode request");
    const pc = await this.readDirectUntil(Command.PASSCODE_RESPONSE, 8000);
    if (!pc) {
      dbg("NO passcode response");
      throw new Error("Sauna did not return a passcode");
    }
    this.passcode = pc;
    dbg(`got passcode (${pc.length}b)`);
    await this.conn.sendBytes(buildFrame(Command.LOGIN_REQUEST, pc));
    dbg("sent login");
    await this.readDirectUntil(Command.LOGIN_RESPONSE, 8000);
    dbg(`login result: authenticated=${this.authenticated}`);
    if (!this.authenticated) throw new Error("Sauna login failed");
  }

  /** Direct read loop used only during the pre-loop handshake. Returns the matched payload. */
  private async readDirectUntil(want: Command, timeoutMs: number): Promise<Uint8Array | null> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      let p = parseFrame(this.recvBuf);
      while (p) {
        this.recvBuf = this.recvBuf.slice(p.bytesConsumed);
        this.dispatch(p.frame.command, p.frame.payload);
        if (p.frame.command === want) return p.frame.payload;
        p = parseFrame(this.recvBuf);
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) return null;
      const rt = Date.now();
      const chunk = await this.conn.readBytes(512, Math.min(3, Math.max(1, Math.ceil(remaining / 1000))));
      dbg(`handshake read ${chunk.length}b in ${Date.now() - rt}ms`);
      if (chunk.length) this.recvBuf = concatBytes(this.recvBuf, chunk);
    }
  }

  private startLoop(): void {
    if (this.loopRunning) return;
    this.loopRunning = true;
    this.lastHeartbeat = Date.now();
    void this.loop();
  }

  private async loop(): Promise<void> {
    dbg("loop started");
    try {
      while (this.connected && this.conn.connected) {
        while (this.outQueue.length) {
          const frame = this.outQueue.shift()!;
          const p = parseFrame(frame);
          await this.conn.sendBytes(frame);
          dbg(`loop sent ${p ? cmdHex(p.frame.command) : "?"} (${frame.length}b)`);
        }
        if (Date.now() - this.lastHeartbeat >= 4000) {
          await this.conn.sendBytes(buildFrame(Command.HEARTBEAT_PING));
          this.lastHeartbeat = Date.now();
          dbg("loop sent heartbeat");
        }
        const chunk = await this.conn.readBytes(512, 1);
        if (chunk.length) {
          dbg(`loop read ${chunk.length}b`);
          this.recvBuf = concatBytes(this.recvBuf, chunk);
          this.drain();
        }
      }
      dbg(`loop exit (connected=${this.connected} conn=${this.conn.connected})`);
    } catch (e) {
      dbg(`loop ERROR: ${(e as Error).message}`);
    } finally {
      this.loopRunning = false;
      this.connected = false;
      this.authenticated = false;
      // Wake any waiters so pending operations don't hang.
      this.flushWaiters(this.ackWaiters);
      this.flushWaiters(this.stateWaiters);
    }
  }

  private drain(): void {
    let p = parseFrame(this.recvBuf);
    while (p) {
      this.recvBuf = this.recvBuf.slice(p.bytesConsumed);
      this.dispatch(p.frame.command, p.frame.payload);
      p = parseFrame(this.recvBuf);
    }
  }

  private dispatch(command: Command, payload: Uint8Array): void {
    dbg(`recv ${cmdHex(command)} (${payload.length}b)`);
    switch (command) {
      case Command.PASSCODE_RESPONSE:
        this.passcode = payload;
        break;
      case Command.LOGIN_RESPONSE:
        this.authenticated = payload.length > 0 && payload[0] === 0x00;
        break;
      case Command.STATE_RESPONSE: {
        const s = parseState(payload);
        if (s) {
          this._state = s;
          this.flushWaiters(this.stateWaiters);
        }
        break;
      }
      case Command.CONTROL_RESPONSE:
        dbg("CONTROL ACK -> resolving waiters");
        this.flushWaiters(this.ackWaiters);
        break;
      default:
        break;
    }
  }

  // --- Control helpers ---

  private async sendControlAwaitAck(payload: Uint8Array): Promise<void> {
    this.enqueue(buildControlFrame(++this.seq, payload));
    if (!(await this.waitFor(this.ackWaiters, 6000))) {
      throw new Error("Sauna did not acknowledge the command");
    }
  }

  private async verify(
    payload: Uint8Array,
    predicate: (s: RawSaunaState) => boolean,
    description: string,
    retries = 1,
  ): Promise<void> {
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      await this.sendControlAwaitAck(payload);
      // Give the sauna time to action the command before re-reading state.
      await delay(2500);
      this.enqueue(buildFrame(Command.STATE_REQUEST, Uint8Array.of(0x02)));
      await this.waitFor(this.stateWaiters, 5000);
      if (this._state && predicate(this._state)) return;
    }
    throw new Error(`Sauna did not confirm: ${description}`);
  }

  private async controlAndVerify(
    payload: Uint8Array,
    predicate: (s: RawSaunaState) => boolean,
    description: string,
  ): Promise<void> {
    await this.ensureConnected();
    await this.verify(payload, predicate, description);
  }

  // --- Queue + waiters ---

  private enqueue(frame: Uint8Array): void {
    this.outQueue.push(frame);
  }

  private waitFor(list: Array<() => void>, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      const cb = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        const i = list.indexOf(cb);
        if (i >= 0) list.splice(i, 1);
        resolve(false);
      }, timeoutMs);
      list.push(cb);
    });
  }

  private flushWaiters(list: Array<() => void>): void {
    const waiters = list.splice(0, list.length);
    for (const cb of waiters) cb();
  }
}
