"use client";

import { useState } from "react";
import { Plunge, Session, Visit } from "@/lib/types";
import { Card, SectionLabel } from "./ui";

interface Props {
  sessions: Session[];
  visits: Visit[];
  plunges: Plunge[];
  hasColdPlunge: boolean;
}

type Period = "day" | "week" | "month" | "all";
const PERIODS: { key: Period; label: string; days: number; heading: string }[] = [
  { key: "day", label: "Day", days: 1, heading: "Today" },
  { key: "week", label: "Week", days: 7, heading: "This week" },
  { key: "month", label: "Month", days: 30, heading: "This month" },
  { key: "all", label: "All", days: Infinity, heading: "All time" },
];

const DAY = 86400000;

function fmtDur(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
function mmss(totalSec: number): string {
  return `${Math.floor(totalSec / 60)}:${(totalSec % 60).toString().padStart(2, "0")}`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Stat({ icon, value, label, sub }: { icon: string; value: string | number; label: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <div className="text-lg">{icon}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums leading-none">{value}</div>
      {sub && <div className="text-xs text-ember-soft">{sub}</div>}
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}

interface Item {
  t: string;
  icon: string;
  title: string;
  detail: string;
}

export function History({ sessions, visits, plunges, hasColdPlunge }: Props) {
  const [period, setPeriod] = useState<Period>("week");
  const cfg = PERIODS.find((p) => p.key === period)!;
  const within = (iso: string) =>
    cfg.days === Infinity || Date.now() - new Date(iso).getTime() <= cfg.days * DAY;

  // --- Rollups for the selected period ---
  const fVisits = visits.filter((v) => within(v.inAt) && v.minutes != null);
  const fSessions = sessions.filter((s) => within(s.startedAt) && s.endedAt);
  const fPlunges = plunges.filter((p) => within(p.at));
  const insideMin = fVisits.reduce((a, v) => a + (v.minutes ?? 0), 0);
  const heaterMin = fSessions.reduce((a, s) => a + (s.durationMinutes ?? 0), 0);
  const plungeSec = fPlunges.reduce((a, p) => a + p.durationSec, 0);

  // --- Recent merged activity for the period ---
  const items: Item[] = [
    ...fVisits.map((v) => ({ t: v.inAt, icon: "🔥", title: "Sauna session", detail: `${v.minutes} min inside` })),
    ...(hasColdPlunge
      ? fPlunges.map((p) => ({
          t: p.at,
          icon: "🧊",
          title: "Cold plunge",
          detail: `${mmss(p.durationSec)}${p.tempF != null ? ` · ${p.tempF}°F` : ""}`,
        }))
      : []),
  ].sort((a, b) => +new Date(b.t) - +new Date(a.t));
  const recent = items.slice(0, 30);

  return (
    <div className="flex flex-col gap-4">
      {/* Period filter */}
      <div className="flex rounded-full border border-border bg-surface p-1 text-sm">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            className={`flex-1 rounded-full py-1.5 transition ${
              period === p.key ? "bg-ember font-medium text-black" : "text-muted"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary / progress */}
      <Card>
        <SectionLabel>{cfg.heading}</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <Stat icon="🔥" value={fmtDur(insideMin)} label="Time inside" />
          <Stat icon="🔢" value={fVisits.length} label="Sauna sessions" />
          <Stat icon="♨️" value={fmtDur(heaterMin)} label="Heater runtime" />
          {hasColdPlunge && (
            <Stat icon="🧊" value={fPlunges.length} sub={`${fmtDur(Math.round(plungeSec / 60))} total`} label="Cold plunges" />
          )}
        </div>
        <p className="mt-3 text-xs text-muted">
          “Time inside” counts your check-ins; “heater runtime” is for energy/billing.
        </p>
      </Card>

      {/* Recent activity for the period */}
      <Card>
        <SectionLabel>Recent</SectionLabel>
        {recent.length === 0 ? (
          <div className="py-3 text-center text-sm text-muted">
            Nothing logged in this range. Check in when you’re in the sauna{hasColdPlunge ? " and log plunges" : ""} to see them here.
          </div>
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
