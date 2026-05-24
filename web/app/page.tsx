"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSauna } from "@/lib/useSauna";
import { Plunge, Session, ServiceState, Settings, Visit } from "@/lib/types";
import { StatusGauge } from "@/components/StatusGauge";
import { PowerButton } from "@/components/PowerButton";
import { Controls } from "@/components/Controls";
import { CheckInCard } from "@/components/CheckInCard";
import { PlungeLogger } from "@/components/PlungeLogger";
import { Music } from "@/components/Music";
import { History } from "@/components/History";
import { More } from "@/components/More";
import { Onboarding } from "@/components/Onboarding";

type Tab = "control" | "activity" | "more";

export default function Home() {
  const sauna = useSauna();
  const [tab, setTab] = useState<Tab>("control");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [openVisit, setOpenVisit] = useState<Visit | null>(null);
  const [plunges, setPlunges] = useState<Plunge[]>([]);
  const [service, setService] = useState<ServiceState | null>(null);
  // Cold-plunge features are opt-in (not everyone has one). Saved on this device.
  const [hasColdPlunge, setHasColdPlunge] = useState(false);
  useEffect(() => setHasColdPlunge(localStorage.getItem("hasColdPlunge") === "1"), []);
  const toggleColdPlunge = (v: boolean) => {
    localStorage.setItem("hasColdPlunge", v ? "1" : "0");
    setHasColdPlunge(v);
  };

  // First-run onboarding (replayable from More).
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("onboarded") !== "1") setShowOnboarding(true);
  }, []);
  const closeOnboarding = () => {
    localStorage.setItem("onboarded", "1");
    setShowOnboarding(false);
  };

  const reloadSessions = useCallback(() => {
    api.getSessions().then(setSessions).catch(() => {});
  }, []);
  const reloadSettings = useCallback(() => {
    api.getSettings().then(setSettings).catch(() => {});
  }, []);
  const reloadVisits = useCallback(() => {
    api.getVisits().then((r) => { setVisits(r.visits); setOpenVisit(r.open); }).catch(() => {});
  }, []);
  const reloadPlunges = useCallback(() => {
    api.getPlunges().then(setPlunges).catch(() => {});
  }, []);
  const reloadService = useCallback(() => {
    api.getService().then(setService).catch(() => {});
  }, []);

  useEffect(() => {
    reloadSessions();
    reloadSettings();
    reloadVisits();
    reloadPlunges();
    reloadService();
    const id = setInterval(() => {
      reloadSessions();
      reloadVisits();
    }, 15000);
    return () => clearInterval(id);
  }, [reloadSessions, reloadSettings, reloadVisits, reloadPlunges, reloadService]);

  const state = sauna.status?.state ?? null;
  const connected = sauna.status?.connected ?? false;
  const power = state?.power ?? false;

  const togglePower = () =>
    sauna.run(async () => {
      const next = !power;
      // Turning off with an active "you're in" session? Offer to end it too.
      if (!next && openVisit && window.confirm("End your sauna session too?")) {
        await api.checkOut();
        reloadVisits();
      }
      await api.setPower(next);
    });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
      {showOnboarding && <Onboarding connected={connected} onClose={closeOnboarding} />}
      {/* Header */}
      <header className="flex items-center justify-between py-3">
        <h1 className="text-xl font-semibold tracking-tight">{settings?.saunaName || "Sauna"}</h1>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              !sauna.bridgeReachable ? "bg-danger" : connected ? "bg-ember" : "bg-amber-400"
            }`}
          />
          {!sauna.bridgeReachable ? "No bridge" : connected ? "Connected" : "Sauna asleep"}
        </div>
      </header>

      {/* Gauge */}
      <StatusGauge
        state={state}
        connected={connected}
        bridgeReachable={sauna.bridgeReachable}
        etaMinutes={sauna.readyEtaMinutes}
        remainingMinutes={sauna.remainingMinutes}
      />

      {/* Persistent power button — always visible, above the tabs */}
      <div className="mt-4">
        <PowerButton power={power} disabled={sauna.busy || !connected} onToggle={togglePower} />
      </div>

      {/* Tabs */}
      <nav className="my-4 flex rounded-full border border-border bg-surface p-1 text-sm">
        {(["control", "activity", "more"] as Tab[]).map((t) => (
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
        <div className="flex flex-col gap-4">
          <CheckInCard openVisit={openVisit} canCheckIn={connected && power} reload={reloadVisits} />
          <Controls state={state} busy={sauna.busy} connected={connected} run={sauna.run} />
          {hasColdPlunge && <PlungeLogger reload={reloadPlunges} />}
          <Music />
        </div>
      )}
      {tab === "activity" && (
        <History sessions={sessions} visits={visits} plunges={plunges} hasColdPlunge={hasColdPlunge} />
      )}
      {tab === "more" && (
        <More
          settings={settings}
          reloadSettings={reloadSettings}
          service={service}
          reloadService={reloadService}
          hasColdPlunge={hasColdPlunge}
          onToggleColdPlunge={toggleColdPlunge}
          onReplaySetup={() => setShowOnboarding(true)}
        />
      )}

      {/* Error toast */}
      {sauna.error && (
        <div className="fixed inset-x-4 bottom-4 mx-auto max-w-md rounded-2xl border border-danger/40 bg-surface px-4 py-3 text-sm text-danger shadow-lg">
          {sauna.error}
        </div>
      )}
    </main>
  );
}
