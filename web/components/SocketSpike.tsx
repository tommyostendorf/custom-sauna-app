"use client";

/**
 * Phase 1 socket spike — diagnostic only, not shipped UI.
 *
 * Rendered inline (no page navigation) so it works reliably inside the native
 * webview. Proves the make-or-break risk on a real iPhone: that a Capacitor app can
 * (1) trigger the iOS local-network permission prompt and (2) open a raw TCP socket
 * to the sauna on port 12416. "✅ TCP connected" here = the native approach is viable.
 */

import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { TcpConnection, bytesToHex } from "@/lib/native/tcp";
import { api } from "@/lib/api";
import { nativeDebugLog, clearNativeDebugLog } from "@/lib/native/device";
import { scanForSauna, subnetPrefix, getLocalSubnets } from "@/lib/native/discovery";
import { setSaunaHost } from "@/lib/native/host";

export function SocketSpike() {
  const native = Capacitor.isNativePlatform();
  const [ip, setIp] = useState("192.168.238.1");
  const [port, setPort] = useState(12416);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const line = (s: string) =>
    setLog((l) => [...l, `${new Date().toLocaleTimeString()}  ${s}`]);

  async function test() {
    setBusy(true);
    setLog([]);
    const conn = new TcpConnection();
    try {
      line(`connecting to ${ip}:${port} …`);
      await conn.connect(ip, port);
      line("✅ TCP connected — iOS allowed the socket.");
      line("listening 4s for any unsolicited bytes …");
      const bytes = await conn.readBytes(64, 4);
      line(
        bytes.length
          ? `received ${bytes.length} bytes: ${bytesToHex(bytes)}`
          : "no unsolicited bytes (expected — device speaks after handshake).",
      );
    } catch (e) {
      line(`❌ ${(e as Error).message}`);
    } finally {
      await conn.disconnect();
      line("disconnected.");
      setBusy(false);
    }
  }

  async function scan() {
    setBusy(true);
    setLog([]);
    try {
      // Figure out which network(s) to sweep: the phone's own subnet(s) first,
      // then whatever's typed in the box as a fallback.
      const detected = await getLocalSubnets();
      line(`this phone: ${detected.ips.length ? detected.ips.join(", ") : "IP not auto-detected"}`);
      const boxPrefix = subnetPrefix(ip);
      // iOS often hides the IP from auto-detect, so also sweep common home ranges.
      const fallbacks = ["192.168.238", "192.168.86", "192.168.1", "192.168.0", "10.0.0", "10.0.1"];
      const candidates = [...new Set([...detected.prefixes, ...(boxPrefix ? [boxPrefix] : []), ...fallbacks])];
      if (candidates.length === 0) {
        line("couldn't determine the network — type your phone's IP in the box and try again.");
        return;
      }

      for (const prefix of candidates) {
        line(`scanning ${prefix}.1–254 on port ${port} … (~25s)`);
        const found = await scanForSauna(prefix, port, (done, total) => {
          if (done % 60 === 0 || done === total) line(`  …${done}/${total} checked`);
        });
        if (found.length) {
          line(`✅ found: ${found.join(", ")}`);
          setIp(found[0]);
          setSaunaHost(found[0]);
          line(`set sauna address to ${found[0]} — the app will use it now.`);
          return;
        }
        line(`  nothing on ${prefix}.x`);
      }
      line("❌ no device answered on port 12416 on this phone's network(s).");
      line("→ the sauna is likely on a DIFFERENT Wi-Fi than this phone.");
    } catch (e) {
      line(`❌ scan error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  /** Runs the REAL native backend path: read status, then toggle power, then re-read. */
  async function controlTest() {
    setBusy(true);
    setLog([]);
    clearNativeDebugLog();
    try {
      line("reading status (native backend) …");
      const before = await api.getStatus();
      line(`connected=${before.connected} power=${before.state?.power} temp=${before.state?.currentTemp.f ?? "?"}F`);
      if (before.state) {
        const target = !before.state.power;
        line(`sending power ${target ? "ON" : "OFF"} …`);
        await api.setPower(target);
        line("✅ setPower resolved (ACK + confirmed)");
        const after = await api.getStatus();
        line(`after: power=${after.state?.power}`);
      } else {
        line("no state returned.");
      }
    } catch (e) {
      line(`❌ ${(e as Error).message}`);
    } finally {
      // Dump the device's internal trace so we can see exactly what the socket did.
      line("──── trace ────");
      for (const l of nativeDebugLog()) setLog((cur) => [...cur, l]);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-2 p-4 font-mono text-sm">
      <p className="text-xs text-muted">
        Phase 1 diagnostic. {native ? "Running natively." : "Web build — sockets only work in the native iOS app."}
      </p>
      <div className="flex gap-2">
        <input
          aria-label="sauna IP"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-text outline-none"
        />
        <input
          aria-label="port"
          type="number"
          value={port}
          onChange={(e) => setPort(Number(e.target.value))}
          className="w-24 rounded-xl border border-border bg-surface px-3 py-2 text-text outline-none"
        />
      </div>
      <button
        type="button"
        onClick={scan}
        disabled={busy || !native}
        className="rounded-xl bg-ember px-4 py-2 font-semibold text-black disabled:opacity-40"
      >
        {busy ? "Working…" : "Scan for sauna"}
      </button>
      <button
        type="button"
        onClick={test}
        disabled={busy || !native}
        className="rounded-xl border border-ember px-4 py-2 font-semibold text-ember disabled:opacity-40"
      >
        {busy ? "Working…" : "Test TCP connection"}
      </button>
      <button
        type="button"
        onClick={controlTest}
        disabled={busy || !native}
        className="rounded-xl border border-ember px-4 py-2 font-semibold text-ember disabled:opacity-40"
      >
        {busy ? "Testing…" : "Test control (toggle power)"}
      </button>
      <pre className="min-h-[6rem] whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-xs">
        {log.length ? log.join("\n") : "(log)"}
      </pre>
    </div>
  );
}
