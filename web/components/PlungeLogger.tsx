"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Card, SectionLabel } from "./ui";

const mmss = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
const DURATIONS = [1, 2, 3, 5]; // minutes

type Mode = "up" | "down";
type Phase = "idle" | "running" | "done";

/** Cold-plunge timer (count up, or countdown with a beep). Lives on the Control page. */
export function PlungeLogger({ reload }: { reload: () => void }) {
  const [mode, setMode] = useState<Mode>("up");
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [targetSec, setTargetSec] = useState(0); // 0 = count up
  const [resultSec, setResultSec] = useState(0); // captured at stop, what we save
  const [custom, setCustom] = useState("");
  const [temp, setTemp] = useState("");

  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => clearTimer, []);

  // A short triple beep at the end of a countdown (works in an installed PWA).
  const beep = () => {
    try {
      const ctx = audioRef.current!;
      [0, 0.3, 0.6].forEach((t) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.type = "sine";
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.25, ctx.currentTime + t);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.18);
      });
    } catch {
      /* ignore */
    }
  };

  const begin = (target: number) => {
    // Create/resume the audio context inside the tap so iOS allows the later beep.
    try {
      audioRef.current = audioRef.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      audioRef.current.resume();
    } catch {
      /* ignore */
    }
    setTargetSec(target);
    setElapsed(0);
    setPhase("running");
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const e = Math.floor((Date.now() - startRef.current) / 1000);
      setElapsed(e);
      if (target > 0 && e >= target) {
        clearTimer();
        setResultSec(target);
        setPhase("done");
        beep();
      }
    }, 250);
  };

  const stopNow = () => {
    clearTimer();
    setResultSec(elapsed);
    setPhase("done");
  };

  const reset = () => {
    clearTimer();
    setPhase("idle");
    setElapsed(0);
    setTargetSec(0);
    setResultSec(0);
    setTemp("");
    setCustom("");
  };

  const save = async () => {
    await api.addPlunge(resultSec, temp ? Number(temp) : undefined);
    reload();
    reset();
  };

  const remaining = Math.max(0, targetSec - elapsed);

  return (
    <Card>
      <SectionLabel>Cold plunge</SectionLabel>

      {phase === "idle" && (
        <>
          <div className="mb-3 flex rounded-full border border-border bg-surface-2 p-1 text-sm">
            {(["up", "down"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-full py-1.5 transition ${
                  mode === m ? "bg-cool font-medium text-black" : "text-muted"
                }`}
              >
                {m === "up" ? "Count up" : "Countdown"}
              </button>
            ))}
          </div>

          {mode === "up" ? (
            <button type="button" onClick={() => begin(0)} className="w-full rounded-2xl bg-cool/20 py-3 font-medium text-cool">
              🧊 Start plunge timer
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-4 gap-2">
                {DURATIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => begin(m * 60)}
                    className="rounded-full border border-border bg-surface-2 py-2 text-sm font-medium text-text"
                  >
                    {m}m
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="Custom minutes"
                  className="min-w-0 flex-1 rounded-2xl border border-border bg-surface-2 px-4 py-3 text-text outline-none focus:border-cool"
                />
                <button
                  type="button"
                  disabled={!custom || Number(custom) <= 0}
                  onClick={() => begin(Math.round(Number(custom) * 60))}
                  className="rounded-2xl bg-cool px-5 py-3 font-medium text-black disabled:opacity-40"
                >
                  Start
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {phase === "running" && (
        <div className="flex flex-col items-center gap-3">
          <div className="text-5xl font-semibold tabular-nums text-cool">
            {targetSec > 0 ? mmss(remaining) : mmss(elapsed)}
          </div>
          <div className="text-xs text-muted">{targetSec > 0 ? "remaining" : "elapsed"}</div>
          <button type="button" onClick={stopNow} className="w-full rounded-2xl bg-cool py-3 font-medium text-black">
            {targetSec > 0 ? "End early" : "Stop"}
          </button>
        </div>
      )}

      {phase === "done" && (
        <div className="flex w-full flex-col gap-2">
          <div className="text-center text-sm text-cool">Plunge: {mmss(resultSec)} 🧊</div>
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
    </Card>
  );
}
