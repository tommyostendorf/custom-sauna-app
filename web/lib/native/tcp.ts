/**
 * Thin typed wrapper over capacitor-tcp-socket.
 *
 * The plugin is request/response: there's no "data received" event like Node's
 * socket.on('data'). You connect, then explicitly read(expectLen, timeout). We use
 * HEX encoding throughout so the binary Gizwits frames map cleanly to/from
 * Uint8Array without a base64 hop.
 *
 * This is the native transport primitive the Phase 2 protocol port builds on.
 */

import { TcpSocket, DataEncoding } from "capacitor-tcp-socket";

export function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

export class TcpConnection {
  private client: number | null = null;

  async connect(ipAddress: string, port: number): Promise<void> {
    const { client } = await TcpSocket.connect({ ipAddress, port });
    this.client = client;
  }

  async sendBytes(bytes: Uint8Array): Promise<void> {
    if (this.client === null) throw new Error("not connected");
    await TcpSocket.send({
      client: this.client,
      data: bytesToHex(bytes),
      encoding: DataEncoding.HEX,
    });
  }

  /** Read up to expectLen bytes, waiting at most timeoutSec. Returns [] on timeout. */
  async readBytes(expectLen: number, timeoutSec = 5): Promise<Uint8Array> {
    if (this.client === null) throw new Error("not connected");
    const { result } = await TcpSocket.read({
      client: this.client,
      expectLen,
      timeout: timeoutSec,
      encoding: DataEncoding.HEX,
    });
    return result ? hexToBytes(result) : new Uint8Array(0);
  }

  async disconnect(): Promise<void> {
    if (this.client === null) return;
    try {
      await TcpSocket.disconnect({ client: this.client });
    } finally {
      this.client = null;
    }
  }

  get connected(): boolean {
    return this.client !== null;
  }
}
