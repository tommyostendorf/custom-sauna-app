"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Plunge, Session, Visit } from "@/lib/types";
import { Card, SectionLabel } from "./ui";

interface Props {
  sessions: Session[];
  visits: Visit[];
  plunges: Plunge[];
  reloadPlunges: () => void;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function mmss(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Inline cold-plunge timer + logger. */
function PlungeLogger({ reload }: { reload: () => void }) {
  const [phase, setPhase] = useState<"idle" | "running" | "stopped">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [temp, setTemp] = useState("");
  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => stopTimer, []);

  const start = () => {
    startRef.current = Date.now();
    setElapsed(0);
    setPhase("running");
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 250);
  };
  const stop = () => {
    stopTimer();
    setPhase("stopped");
  };
  const reset = () => {
    stopTimer();
    setPhase("idle");
    setElapsed(0);
    setTemp("");
  };
  const save = async () => {
    await api.addPlunge(elapsed, temp ? Number(temp) : undefined);
    reload();
    reset();
  };

  return (
    <Card>
      <SectionLabel>Cold plunge</SectionLabel>
      <div className="flex flex-col items-center gap-3">
        <div className="text-4xl font-semibold tabular-nums">{mmss(elapsed)}</div>
        {phase === "idle" && (
          <button type="button" onClick={start} className="w-full rounded-2xl bg-cool/20 py-3 font-medium text-cool">
            🧊 Start plunge timer
          </button>
        )}
        {phase === "running" && (
          <button type="button" onClick={stop} className="w-full rounded-2xl bg-cool py-3 font-medium text-black">
            Stop
          </button>
        )}
        {phase === "stopped" && (
          <div className="flex w-full flex-col gap-2">
            <input
              type="number"
              inputMode="numeric"
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
              placeholder="Water temp °F (optional)"
              className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-text outline-none focus:border-cool"
            />
            <div className="flex gap-2">
              <button type="button" onClick={save} className="flex-1 rounded-2xl bg-cool py-3 font-medium text-black">
                Save plunge
              </button>
              <button type="button" onClick={reset} className="rounded-2xl border border-border bg-surface-2 px-4 py-3">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

interface Item {
  t: string;
  icon: string;
  title: string;
  detail: string;
}

export function History({ sessions, visits, plunges, reloadPlunges }: Props) {
  const items: Item[] = [
    ...visits.map((v) => ({
      t: v.inAt,
      icon: "🧖",
      title: "Sauna visit",
      detail: v.minutes != null ? `${v.minutes} min inside` : "in progress",
    })),
    ...sessions.map((s) => ({
      t: s.startedAt,
      icon: "🔥",
      title: "Heater on",
      detail: s.endedAt ? `${s.durationMinutes ?? 0} min · ${Math.round(s.maxTempF)}°F max` : "running",
    })),
    ...plunges.map((p) => ({
      t: p.at,
      icon: "🧊",
      title: "Cold plunge",
      detail: `${mmss(p.durationSec)}${p.tempF != null ? ` · ${p.tempF}°F` : ""}`,
    })),
  ].sort((a, b) => +new Date(b.t) - +new Date(a.t));

  const recent = items.slice(0, 15);

  return (
    <div className="flex flex-col gap-4">
      <PlungeLogger reload={reloadPlunges} />

      <Card>
        <SectionLabel>Recent activity</SectionLabel>
        {recent.length === 0 ? (
          <div className="py-3 text-center text-sm text-muted">Nothing logged yet.</div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {recent.map((it, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <span>{it.icon}</span>
                  <span className="text-text">{it.title}</span>
                </span>
                <span className="flex flex-col items-end text-right">
                  <span className="text-muted">{it.detail}</span>
                  <span className="text-xs text-muted/70">{fmtDate(it.t)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
