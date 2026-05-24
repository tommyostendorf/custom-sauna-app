"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { SaunaState } from "@/lib/types";
import { Card, Chip, RoundButton, SectionLabel, Toggle } from "./ui";

interface Props {
  state: SaunaState | null;
  busy: boolean;
  connected: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}

const TIMER_OPTIONS = [15, 30, 45, 60];
const DELAY_OPTIONS = [15, 30, 45, 60];
const TEMP_MIN = 100;
const TEMP_MAX = 180;

/** Round to the nearest multiple of 5 (fixes the odd-number stepping). */
const snap5 = (n: number) => Math.round(n / 5) * 5;
const clampTemp = (n: number) => Math.max(TEMP_MIN, Math.min(TEMP_MAX, n));

export function Controls({ state, busy, connected, run }: Props) {
  const disabled = busy || !connected;
  const power = state?.power ?? false;
  const target = state ? snap5(state.targetTemp.f) : 0;

  // Local draft so the slider feels smooth; we only send to the sauna on release.
  const [tempDraft, setTempDraft] = useState<number | null>(null);
  const shownTemp = tempDraft ?? target;

  // "Ready by" scheduling — live preview that updates as you change the time.
  const [readyBy, setReadyBy] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const computeTarget = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    const now = new Date();
    const t = new Date(now);
    t.setHours(h, m, 0, 0);
    if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
    return { target: t, minutesUntil: Math.round((t.getTime() - now.getTime()) / 60000) };
  };

  // Recompute the "starts at…" preview whenever the time or temperatures change.
  useEffect(() => {
    let cancelled = false;
    if (!readyBy || !state || power) {
      setPreview(null);
      return;
    }
    const { target, minutesUntil } = computeTarget(readyBy);
    api
      .getEstimate(state.currentTemp.f, state.targetTemp.f)
      .then((est) => {
        if (cancelled) return;
        const delay = minutesUntil - est.minutes;
        if (delay <= 0) {
          setPreview(`Needs ~${est.minutes} min to heat — that's past ${fmtTime(target)}, so it'll start now.`);
        } else {
          const startAt = new Date(Date.now() + delay * 60000);
          setPreview(`Starts ${fmtTime(startAt)} so it's ready by ${fmtTime(target)} (~${est.minutes} min to heat).`);
        }
      })
      .catch(() => !cancelled && setPreview(null));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyBy, state?.currentTemp.f, state?.targetTemp.f, power]);

  const scheduleReadyBy = () => {
    if (!readyBy || !state) return;
    const { minutesUntil } = computeTarget(readyBy);
    run(async () => {
      const est = await api.getEstimate(state.currentTemp.f, state.targetTemp.f);
      const delay = minutesUntil - est.minutes;
      if (delay <= 0) await api.setPower(true);
      else await api.setDelayedStart(delay);
    });
  };

  const setTemp = (value: number) => run(() => api.setTemperature(clampTemp(snap5(value))));
  const stepTemp = (delta: number) => {
    setTempDraft(null);
    setTemp(target + delta);
  };
  const commitTempDraft = () => {
    if (tempDraft !== null && tempDraft !== target) setTemp(tempDraft);
    setTempDraft(null);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Temperature */}
      <Card>
        <SectionLabel>Target temperature</SectionLabel>
        <div className="mb-4 flex items-center justify-between">
          <RoundButton ariaLabel="Lower temperature" disabled={disabled} onClick={() => stepTemp(-5)}>
            −
          </RoundButton>
          <div className="flex items-start">
            <span className="text-5xl font-semibold tabular-nums">{state ? shownTemp : "--"}</span>
            <span className="mt-1 text-xl text-muted">°F</span>
          </div>
          <RoundButton ariaLabel="Raise temperature" disabled={disabled} onClick={() => stepTemp(5)}>
            +
          </RoundButton>
        </div>
        <input
          type="range"
          min={TEMP_MIN}
          max={TEMP_MAX}
          step={5}
          value={state ? shownTemp : TEMP_MIN}
          disabled={disabled}
          onChange={(e) => setTempDraft(Number(e.target.value))}
          onPointerUp={commitTempDraft}
          onMouseUp={commitTempDraft}
          onTouchEnd={commitTempDraft}
          aria-label="Target temperature slider"
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-2 disabled:opacity-40"
          style={{ accentColor: "#ff7a1a" }}
        />
        <div className="mt-1 flex justify-between text-xs text-muted">
          <span>{TEMP_MIN}°F</span>
          <span>{TEMP_MAX}°F</span>
        </div>
      </Card>

      {/* Timer */}
      <Card>
        <SectionLabel>Session length</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {TIMER_OPTIONS.map((m) => (
            <Chip
              key={m}
              disabled={disabled}
              active={state?.timerMinutes === m}
              onClick={() => run(() => api.setTimer(m))}
            >
              {m} min
            </Chip>
          ))}
        </div>
      </Card>

      {/* Schedule — only when the sauna is off, to avoid conflicting with a running session */}
      <Card>
        <SectionLabel>Schedule</SectionLabel>
        {power ? (
          <p className="text-sm text-muted">Turn the sauna off to schedule a delayed start.</p>
        ) : state?.delayedStart.enabled ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-ember-soft">
              Scheduled to start in {state.delayedStart.minutes} min
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => run(() => api.setDelayedStart(0))}
              className="rounded-full border border-border bg-surface-2 px-4 py-2 text-sm disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <div className="mb-2 text-sm text-muted">Have it ready by:</div>
              <div className="flex gap-2">
                <input
                  type="time"
                  value={readyBy}
                  disabled={disabled}
                  onChange={(e) => setReadyBy(e.target.value)}
                  className="flex-1 rounded-2xl border border-border bg-surface-2 px-4 py-3 text-text outline-none [color-scheme:dark] focus:border-ember"
                />
                <button
                  type="button"
                  disabled={disabled || !readyBy}
                  onClick={scheduleReadyBy}
                  className="rounded-2xl bg-ember px-5 py-3 font-medium text-black disabled:opacity-40"
                >
                  Schedule
                </button>
              </div>
              {preview && <p className="mt-2 text-sm text-ember-soft">{preview}</p>}
            </div>
            <div>
              <div className="mb-2 text-xs uppercase tracking-wider text-muted">or start in</div>
              <div className="flex flex-wrap gap-2">
                {DELAY_OPTIONS.map((m) => (
                  <Chip key={m} disabled={disabled} onClick={() => run(() => api.setDelayedStart(m))}>
                    In {m}m
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Lights */}
      <Card>
        <SectionLabel>Lights</SectionLabel>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span>Internal cabin light</span>
            <Toggle
              label="Internal light"
              disabled={disabled}
              on={state?.lights.internal ?? false}
              onChange={(v) => run(() => api.setLight("internal", v))}
            />
          </div>
          <div className="flex items-center justify-between">
            <span>External light</span>
            <Toggle
              label="External light"
              disabled={disabled}
              on={state?.lights.external ?? false}
              onChange={(v) => run(() => api.setLight("external", v))}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
