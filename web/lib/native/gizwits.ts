/**
 * Gizwits GAgent LAN protocol — browser/native-safe port of the bridge's
 * bridge/src/gizwits/protocol.ts. Identical wire format; the only change is
 * Node Buffer → Uint8Array/DataView so it runs inside the iOS webview.
 *
 * Frame: [0x00 0x00 0x00 0x03] [varint length] [0x00] [cmd hi] [cmd lo] [payload...]
 */

export const TCP_PORT = 12416;

export enum Command {
  PASSCODE_REQUEST = 0x0006,
  PASSCODE_RESPONSE = 0x0007,
  LOGIN_REQUEST = 0x0008,
  LOGIN_RESPONSE = 0x0009,
  HEARTBEAT_PING = 0x0015,
  HEARTBEAT_PONG = 0x0016,
  STATE_REQUEST = 0x0090,
  STATE_RESPONSE = 0x0091,
  CONTROL_REQUEST = 0x0093,
  CONTROL_RESPONSE = 0x0094,
}

export const FLAG_EXTERNAL_LIGHT = 0x01;
export const FLAG_INTERNAL_LIGHT = 0x02;
export const FLAG_PRE_TIME = 0x04;
export const FLAG_POWER = 0x08;
export const FLAG_CF = 0x10; // 0 = Fahrenheit, 1 = Celsius

/** Raw sauna state as decoded from the wire (Fahrenheit, minutes). */
export interface RawSaunaState {
  power: boolean;
  internalLight: boolean;
  externalLight: boolean;
  preTimeEnabled: boolean;
  celsius: boolean;
  led: number;
  right: number;
  left: number;
  setTemp: number;
  setHour: number;
  setMinute: number;
  preTimeHour: number;
  preTimeMinute: number;
  serialNumber: number;
  currentTemp: number;
  heartPulse: number;
}

const FRAME_HEADER = Uint8Array.of(0x00, 0x00, 0x00, 0x03);

export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value & 0x7f);
  return Uint8Array.from(bytes);
}

function decodeVarint(buf: Uint8Array, offset: number): { value: number; bytesRead: number } | null {
  let value = 0;
  let shift = 0;
  let bytesRead = 0;
  while (offset + bytesRead < buf.length) {
    const byte = buf[offset + bytesRead];
    value |= (byte & 0x7f) << shift;
    bytesRead++;
    if ((byte & 0x80) === 0) return { value, bytesRead };
    shift += 7;
    if (shift > 28) return null;
  }
  return null;
}

export function buildFrame(cmd: Command, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  const innerLength = 1 + 2 + payload.length;
  const lengthVarint = encodeVarint(innerLength);
  const frame = new Uint8Array(FRAME_HEADER.length + lengthVarint.length + 1 + 2 + payload.length);
  const view = new DataView(frame.buffer);
  let offset = 0;
  frame.set(FRAME_HEADER, offset); offset += FRAME_HEADER.length;
  frame.set(lengthVarint, offset); offset += lengthVarint.length;
  frame[offset++] = 0x00; // flag byte
  view.setUint16(offset, cmd, false); offset += 2;
  if (payload.length > 0) frame.set(payload, offset);
  return frame;
}

export function buildControlFrame(seqNum: number, payload: Uint8Array): Uint8Array {
  const innerLength = 1 + 2 + 4 + payload.length;
  const lengthVarint = encodeVarint(innerLength);
  const frame = new Uint8Array(FRAME_HEADER.length + lengthVarint.length + 1 + 2 + 4 + payload.length);
  const view = new DataView(frame.buffer);
  let offset = 0;
  frame.set(FRAME_HEADER, offset); offset += FRAME_HEADER.length;
  frame.set(lengthVarint, offset); offset += lengthVarint.length;
  frame[offset++] = 0x00; // flag byte
  view.setUint16(offset, Command.CONTROL_REQUEST, false); offset += 2;
  view.setUint32(offset, seqNum, false); offset += 4;
  frame.set(payload, offset);
  return frame;
}

export interface ParsedFrame {
  command: Command;
  payload: Uint8Array;
}

export function parseFrame(data: Uint8Array): { frame: ParsedFrame; bytesConsumed: number } | null {
  if (data.length < FRAME_HEADER.length + 1) return null;
  if (data[0] !== 0x00 || data[1] !== 0x00 || data[2] !== 0x00 || data[3] !== 0x03) return null;

  let offset = FRAME_HEADER.length;
  const varintResult = decodeVarint(data, offset);
  if (!varintResult) return null;
  const { value: innerLength, bytesRead } = varintResult;
  offset += bytesRead;
  if (data.length < offset + innerLength) return null;

  offset += 1; // flag byte
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const command = view.getUint16(offset, false) as Command; offset += 2;
  const payloadLength = innerLength - 3;
  const payload = data.slice(offset, offset + payloadLength);
  return { frame: { command, payload }, bytesConsumed: offset + payloadLength };
}

export function parseState(payload: Uint8Array): RawSaunaState | null {
  if (payload.length < 7) return null;
  let i = 0;
  i++; // skip action byte
  const flags = payload[i++];
  return {
    power: !!(flags & FLAG_POWER),
    internalLight: !!(flags & FLAG_INTERNAL_LIGHT),
    externalLight: !!(flags & FLAG_EXTERNAL_LIGHT),
    preTimeEnabled: !!(flags & FLAG_PRE_TIME),
    celsius: !!(flags & FLAG_CF),
    led: i < payload.length ? payload[i++] : 0,
    right: i < payload.length ? payload[i++] : 0,
    left: i < payload.length ? payload[i++] : 0,
    setTemp: i < payload.length ? payload[i++] : 0,
    setHour: i < payload.length ? payload[i++] : 0,
    setMinute: i < payload.length ? payload[i++] : 0,
    preTimeHour: i < payload.length ? payload[i++] : 0,
    preTimeMinute: i < payload.length ? payload[i++] : 0,
    serialNumber: i < payload.length ? payload[i++] : 0,
    currentTemp: i < payload.length ? payload[i++] : 0,
    heartPulse: i < payload.length ? payload[i++] : 0,
  };
}

// --- Control payload builders (13-byte payloads) ---

const CTRL_TYPE_FLAG = 0x00;
const CTRL_TYPE_SPECTRUM = 0x03;
const CTRL_TYPE_TEMP = 0x04;
const CTRL_TYPE_MINUTE = 0x10;
const CTRL_TYPE_PRE_HOUR = 0x20;
const CTRL_TYPE_PRE_MINUTE = 0x40;

function makeControlPayload(type: number): Uint8Array {
  const buf = new Uint8Array(13);
  buf[0] = 0x01; // action: write
  buf[1] = type;
  return buf;
}

export function buildFlagControl(flagId: number, value: boolean): Uint8Array {
  const buf = makeControlPayload(CTRL_TYPE_FLAG);
  buf[2] = flagId;
  buf[3] = value ? flagId : 0x00;
  return buf;
}

export function buildTempControl(tempF: number): Uint8Array {
  const buf = makeControlPayload(CTRL_TYPE_TEMP);
  buf[7] = Math.max(60, Math.min(180, Math.round(tempF)));
  return buf;
}

export function buildSpectrumControl(right: number, left: number): Uint8Array {
  const buf = makeControlPayload(CTRL_TYPE_SPECTRUM);
  buf[5] = Math.max(0, Math.min(255, Math.round(right)));
  buf[6] = Math.max(0, Math.min(255, Math.round(left)));
  return buf;
}

export function buildMinuteControl(minute: number): Uint8Array {
  const buf = makeControlPayload(CTRL_TYPE_MINUTE);
  buf[9] = Math.max(0, Math.min(60, Math.round(minute)));
  return buf;
}

export function buildPreHourControl(hour: number): Uint8Array {
  const buf = makeControlPayload(CTRL_TYPE_PRE_HOUR);
  buf[10] = Math.max(0, Math.min(23, Math.round(hour)));
  return buf;
}

export function buildPreMinuteControl(minute: number): Uint8Array {
  const buf = makeControlPayload(CTRL_TYPE_PRE_MINUTE);
  buf[11] = Math.max(0, Math.min(59, Math.round(minute)));
  return buf;
}
