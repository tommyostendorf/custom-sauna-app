"use client";

import { useState } from "react";
import { isInstalledApp } from "@/lib/push";

interface Props {
  connected: boolean;
  onClose: () => void;
}

const isIOS = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);

export function Onboarding({ connected, onClose }: Props) {
  const [step, setStep] = useState(0);
  const installed = isInstalledApp();

  const steps = [
    {
      icon: "🔥",
      title: "Welcome to Insaunity",
      body: "Control your infrared sauna right from your phone — power, temperature, timer, lights, scheduling, and more. No clunky cloud app.",
    },
    {
      icon: connected ? "✅" : "📡",
      title: connected ? "Your sauna is connected" : "Finding your sauna…",
      body: connected
        ? "Nice — we found it on your network and you're ready to go."
        : "Make sure the sauna's main power is ON and this device is on the same WiFi. It connects automatically once it's reachable.",
    },
    {
      icon: installed ? "✅" : "📲",
      title: installed ? "Installed as an app" : "Add it to your Home Screen",
      body: installed
        ? "You're running it as an installed app — perfect."
        : isIOS()
          ? "In Safari, tap the Share button, then “Add to Home Screen.” Open it from that icon for the best, full-screen experience."
          : "From your browser menu, choose “Install app” or “Add to Home Screen.”",
    },
    {
      icon: "🧖",
      title: "You're all set",
      body: "Two optional extras live in the More tab: use it from anywhere (remote access) and chromotherapy light control. Add them whenever you like.",
    },
  ];

  const s = steps[step];
  const last = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg/95 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))] backdrop-blur">
      <div className="flex justify-end">
        <button type="button" onClick={onClose} className="text-sm text-muted">
          Skip
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="text-6xl">{s.icon}</div>
        <h2 className="mt-6 text-2xl font-semibold text-text">{s.title}</h2>
        <p className="mt-3 max-w-xs text-muted">{s.body}</p>
      </div>

      {/* progress dots */}
      <div className="mb-5 flex justify-center gap-2">
        {steps.map((_, i) => (
          <span key={i} className={`h-2 w-2 rounded-full ${i === step ? "bg-ember" : "bg-surface-2"}`} />
        ))}
      </div>

      <div className="flex gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep((n) => n - 1)}
            className="rounded-2xl border border-border bg-surface px-6 py-3 font-medium text-text"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={() => (last ? onClose() : setStep((n) => n + 1))}
          className="flex-1 rounded-2xl bg-ember py-3 font-semibold text-black"
        >
          {last ? "Start using Insaunity" : "Next"}
        </button>
      </div>
    </div>
  );
}
