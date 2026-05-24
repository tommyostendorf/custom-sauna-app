"use client";

/**
 * Standalone /spike route. In-app navigation to this path is unreliable inside the
 * native webview, so the spike is primarily reached inline from the More tab. This
 * route is kept as a fallback and renders the same component.
 */

import { SocketSpike } from "@/components/SocketSpike";

export default function SpikePage() {
  return (
    <main className="min-h-screen bg-neutral-950 p-6 text-neutral-100">
      <h1 className="mb-3 text-lg font-bold">Socket Spike</h1>
      <SocketSpike />
    </main>
  );
}
