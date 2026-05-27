/**
 * "Find my sauna" — scans the local subnet for a device answering on the Gizwits
 * TCP control port (12416). UDP broadcast discovery is unreliable on mesh routers
 * (Google/Nest WiFi drop it), so we do a bounded parallel TCP probe instead.
 *
 * This is what the shipped app needs anyway: users have different IPs, and the
 * sauna's address drifts on reboot, so we can't hardcode it.
 */

import { TcpConnection } from "./tcp";
import { TCP_PORT } from "./gizwits";

/** Probe one ip:port. Resolves true if the TCP connection opens within timeoutMs. */
async function probe(ip: string, port: number, timeoutMs: number): Promise<boolean> {
  const conn = new TcpConnection();
  try {
    await Promise.race([
      conn.connect(ip, port),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    await conn.disconnect().catch(() => {});
  }
}

/**
 * Scan `${prefix}.1` .. `${prefix}.254` on the given port. Returns every IP that
 * accepts a connection. Runs in small concurrent batches to stay quick (~20-30s)
 * without overwhelming the socket plugin.
 */
export async function scanForSauna(
  prefix: string,
  port: number = TCP_PORT,
  onProgress?: (done: number, total: number, found: string[]) => void,
): Promise<string[]> {
  const ips = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`);
  const found: string[] = [];
  const BATCH = 12;
  const PROBE_TIMEOUT = 1400;
  let done = 0;

  for (let i = 0; i < ips.length; i += BATCH) {
    const batch = ips.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (ip) => {
        if (await probe(ip, port, PROBE_TIMEOUT)) found.push(ip);
        done++;
      }),
    );
    onProgress?.(done, ips.length, found.slice());
  }
  return found;
}

/** Derive the /24 prefix (first three octets) from a full IP, or null if malformed. */
export function subnetPrefix(ip: string): string | null {
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

const isPrivate = (ip: string) =>
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);

/**
 * Detect this device's own private LAN IP(s) via WebRTC ICE candidates, so the
 * scanner can sweep the correct subnet without the user typing it. May return
 * nothing if the OS obfuscates candidates (then fall back to a typed IP).
 */
export async function getLocalSubnets(): Promise<{ ips: string[]; prefixes: string[] }> {
  const ips = new Set<string>();
  await new Promise<void>((resolve) => {
    let pc: RTCPeerConnection;
    try {
      pc = new RTCPeerConnection({ iceServers: [] });
    } catch {
      resolve();
      return;
    }
    const finish = () => {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      resolve();
    };
    pc.createDataChannel("d");
    pc.onicecandidate = (e) => {
      if (!e.candidate) {
        finish();
        return;
      }
      const matches = e.candidate.candidate.match(/(\d{1,3}(?:\.\d{1,3}){3})/g);
      if (matches) for (const ip of matches) if (isPrivate(ip)) ips.add(ip);
    };
    pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => {});
    setTimeout(finish, 2500);
  });
  const prefixes = [...new Set([...ips].map((ip) => ip.split(".").slice(0, 3).join(".")))];
  return { ips: [...ips], prefixes };
}
