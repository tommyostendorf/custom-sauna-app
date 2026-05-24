"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Visit } from "@/lib/types";

interface Props {
  openVisit: Visit | null;
  reload: () => void;
}

export function CheckInCard({ openVisit, reload }: Props) {
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  // re-render every 30s so the "inside for X min" stays current
  useEffect(() => {
    if (!openVisit) return;
    const id = setInterval(() => setTick((t) => t + 1), 30000);
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

  const minutesInside = openVisit
    ? Math.max(0, Math.floor((Date.now() - new Date(openVisit.inAt).getTime()) / 60000))
    : 0;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => action(openVisit ? api.checkOut : api.checkIn)}
      className={`flex w-full items-center justify-center gap-2 rounded-3xl py-4 font-medium transition active:scale-[0.99] disabled:opacity-50 ${
        openVisit
          ? "border border-ember/40 bg-surface text-ember-soft"
          : "border border-border bg-surface text-text"
      }`}
    >
      {openVisit ? `🧖 You're in · ${minutesInside} min — tap to check out` : "🧖 Check in (I'm in the sauna)"}
    </button>
  );
}
