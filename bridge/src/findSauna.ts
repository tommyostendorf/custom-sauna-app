/**
 * Locate the sauna on the local network by scanning for its open Gizwits control
 * port (TCP 12416). This makes the bridge resilient to the sauna's IP changing —
 * common here because the sauna rides behind a WiFi range extender that doesn't
 * hold a DHCP reservation cleanly.
 */

import * as net from 'net';
import * as os from 'os';
import { TCP_PORT } from './gizwits/protocol';

/** The /24 prefixes (e.g. "192.168.86") of every non-internal IPv4 interface. */
function localSubnets(): string[] {
  const bases = new Set<string>();
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) {
        const p = a.address.split('.');
        bases.add(`${p[0]}.${p[1]}.${p[2]}`);
      }
    }
  }
  return [...bases];
}

function portOpen(ip: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    sock.connect(port, ip);
  });
}

/** Scan local subnet(s) for a device with the Gizwits control port open. Returns first IP found. */
export async function findSaunaIp(timeoutMs = 1200): Promise<string | null> {
  for (const base of localSubnets()) {
    const checks: Promise<string | null>[] = [];
    for (let i = 1; i <= 254; i++) {
      const ip = `${base}.${i}`;
      checks.push(portOpen(ip, TCP_PORT, timeoutMs).then((ok) => (ok ? ip : null)));
    }
    const found = (await Promise.all(checks)).find((r) => r !== null);
    if (found) return found;
  }
  return null;
}
