"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Card, SectionLabel } from "./ui";

const mmss = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

/** Cold-plunge timer + logger. Lives on the Control page (it's an action). */
export function PlungeLogger({ reload }: { reload: () => void }) {
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
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 250);
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
          <button type="button" onClick={() => { stopTimer(); setPhase("stopped"); }} className="w-full rounded-2xl bg-cool py-3 font-medium text-black">
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
              <button type="button" onClick={save} className="flex-1 rounded-2xl bg-cool py-3 font-medium text-black">Save plunge</button>
              <button type="button" onClick={reset} className="rounded-2xl border border-border bg-surface-2 px-4 py-3">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
