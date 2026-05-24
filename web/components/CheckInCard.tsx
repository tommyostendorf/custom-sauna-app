"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Visit } from "@/lib/types";

interface Props {
  openVisit: Visit | null;
  canCheckIn: boolean; // only allow checking in when the sauna is on & reachable
  reload: () => void;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

export function CheckInCard({ openVisit, canCheckIn, reload }: Props) {
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Tick every second while checked in so the timer shows live min:sec.
  useEffect(() => {
    if (!openVisit) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [openVisit]);

  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      reload();
    } finally {
      setBusy(false);
    }
  };

  const secondsInside = openVisit
    ? Math.max(0, Math.floor((now - new Date(openVisit.inAt).getTime()) / 1000))
    : 0;

  // You can always check OUT; you can only check IN when the sauna is on.
  const disabled = busy || (!openVisit && !canCheckIn);

  const label = openVisit
    ? `🔥 You're in · ${mmss(secondsInside)} — tap to check out`
    : canCheckIn
      ? "🔥 Check in (I'm in the sauna)"
      : "🔥 Turn the sauna on to check in";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => action(openVisit ? api.checkOut : api.checkIn)}
      className={`flex w-full items-center justify-center gap-2 rounded-3xl py-4 font-medium transition active:scale-[0.99] disabled:opacity-40 ${
        openVisit ? "border border-ember/40 bg-surface text-ember-soft" : "border border-border bg-surface text-text"
      }`}
    >
      {label}
    </button>
  );
}
