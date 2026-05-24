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

export function SocketSpike() {
  const native = Capacitor.isNativePlatform();
  const [ip, setIp] = useState("192.168.86.216");
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
        onClick={test}
        disabled={busy || !native}
        className="rounded-xl bg-ember px-4 py-2 font-semibold text-black disabled:opacity-40"
      >
        {busy ? "Testing…" : "Test TCP connection"}
      </button>
      <pre className="min-h-[6rem] whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-xs">
        {log.length ? log.join("\n") : "(log)"}
      </pre>
    </div>
  );
}
