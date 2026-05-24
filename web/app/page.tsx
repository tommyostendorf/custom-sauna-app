"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSauna } from "@/lib/useSauna";
import { Preset, Session } from "@/lib/types";
import { StatusGauge } from "@/components/StatusGauge";
import { Controls } from "@/components/Controls";
import { Presets } from "@/components/Presets";
import { History } from "@/components/History";

type Tab = "control" | "presets" | "history";

export default function Home() {
  const sauna = useSauna();
  const [tab, setTab] = useState<Tab>("control");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);

  const reloadPresets = useCallback(() => {
    api.getPresets().then(setPresets).catch(() => {});
  }, []);
  const reloadSessions = useCallback(() => {
    api.getSessions().then(setSessions).catch(() => {});
  }, []);

  useEffect(() => {
    reloadPresets();
    reloadSessions();
    const id = setInterval(reloadSessions, 15000);
    return () => clearInterval(id);
  }, [reloadPresets, reloadSessions]);

  const state = sauna.status?.state ?? null;
  const connected = sauna.status?.connected ?? false;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
      {/* Header */}
      <header className="flex items-center justify-between py-3">
        <h1 className="text-xl font-semibold tracking-tight">Sauna</h1>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-ember" : "bg-danger"}`} />
          {connected ? "Connected" : "Offline"}
        </div>
      </header>

      {/* Gauge */}
      <StatusGauge
        state={state}
        connected={connected}
        etaMinutes={sauna.readyEtaMinutes}
        remainingMinutes={sauna.remainingMinutes}
      />

      {/* Tabs */}
      <nav className="my-4 flex rounded-full border border-border bg-surface p-1 text-sm">
        {(["control", "presets", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-full py-2 capitalize transition ${
              tab === t ? "bg-ember font-medium text-black" : "text-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      {tab === "control" && (
        <Controls state={state} busy={sauna.busy} connected={connected} run={sauna.run} />
      )}
      {tab === "presets" && (
        <Presets
          presets={presets}
          state={state}
          busy={sauna.busy}
          connected={connected}
          run={sauna.run}
          reloadPresets={reloadPresets}
        />
      )}
      {tab === "history" && <History sessions={sessions} />}

      {/* Error toast */}
      {sauna.error && (
        <div className="fixed inset-x-4 bottom-4 mx-auto max-w-md rounded-2xl border border-danger/40 bg-surface px-4 py-3 text-sm text-danger shadow-lg">
          {sauna.error}
        </div>
      )}
    </main>
  );
}
