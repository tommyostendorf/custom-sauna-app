"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { SaunaStatus } from "./types";

interface TempSample {
  t: number;
  f: number;
}

export interface SaunaView {
  status: SaunaStatus | null;
  loading: boolean;
  error: string | null;
  busy: boolean;
  /** True if the last status fetch reached the bridge (distinguishes "no bridge" from "sauna asleep"). */
  bridgeReachable: boolean;
  /** Estimated minutes until target temp is reached, or null if not heating/unknown. */
  readyEtaMinutes: number | null;
  /** Minutes elapsed since power turned on (local estimate). */
  elapsedMinutes: number | null;
  /** Minutes remaining on the session timer (local estimate). */
  remainingMinutes: number | null;
  refresh: () => Promise<void>;
  /** Run a control action, show a busy state, then refresh. */
  run: (action: () => Promise<unknown>) => Promise<void>;
}

const POLL_MS = 3000;
const MAX_SAMPLES = 12;

export function useSauna(): SaunaView {
  const [status, setStatus] = useState<SaunaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bridgeReachable, setBridgeReachable] = useState(false);

  const samples = useRef<TempSample[]>([]);
  const session = useRef<{ startMs: number; timerMin: number } | null>(null);
  const prevPower = useRef<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api.getStatus();
      setStatus(s);
      setError(null);
      setBridgeReachable(true);

      const st = s.state;
      if (st) {
        // Track temperature samples for ETA
        const now = Date.now();
        samples.current.push({ t: now, f: st.currentTemp.f });
        if (samples.current.length > MAX_SAMPLES) samples.current.shift();

        // Track session start locally for the countdown
        if (prevPower.current === false && st.power) {
          session.current = { startMs: now, timerMin: st.timerMinutes };
        }
        if (!st.power) session.current = null;
        if (prevPower.current === null && st.power) {
          // App opened mid-session: approximate start as now
          session.current = { startMs: now, timerMin: st.timerMinutes };
        }
        prevPower.current = st.power;
      } else {
        prevPower.current = null;
      }
    } catch (e) {
      setError((e as Error).message);
      setBridgeReachable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await action();
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  // --- Derived values ---
  const st = status?.state ?? null;

  let readyEtaMinutes: number | null = null;
  if (st?.power && st.currentTemp.f < st.targetTemp.f - 1 && samples.current.length >= 3) {
    const first = samples.current[0];
    const last = samples.current[samples.current.length - 1];
    const minutes = (last.t - first.t) / 60000;
    const ratePerMin = minutes > 0 ? (last.f - first.f) / minutes : 0;
    if (ratePerMin > 0.15) {
      readyEtaMinutes = Math.max(1, Math.round((st.targetTemp.f - st.currentTemp.f) / ratePerMin));
    }
  }

  let elapsedMinutes: number | null = null;
  let remainingMinutes: number | null = null;
  if (st?.power && session.current) {
    elapsedMinutes = Math.floor((Date.now() - session.current.startMs) / 60000);
    remainingMinutes = Math.max(0, session.current.timerMin - elapsedMinutes);
  }

  return {
    status,
    loading,
    error,
    busy,
    bridgeReachable,
    readyEtaMinutes,
    elapsedMinutes,
    remainingMinutes,
    refresh,
    run,
  };
}
