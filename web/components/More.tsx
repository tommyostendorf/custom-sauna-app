"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ServiceState, Settings } from "@/lib/types";
import { Card, SectionLabel } from "./ui";

interface Props {
  settings: Settings | null;
  reloadSettings: () => void;
  service: ServiceState | null;
  reloadService: () => void;
}

const FEEDBACK_EMAIL = "sauna@tommyostendorf.com";

/** Human-readable "next due" status from a last-done date + interval. */
function dueStatus(lastISO: string | null, intervalDays: number): { text: string; overdue: boolean } {
  if (!lastISO) return { text: "not logged yet", overdue: false };
  const due = new Date(lastISO).getTime() + intervalDays * 86400000;
  const daysLeft = Math.ceil((due - Date.now()) / 86400000);
  if (daysLeft <= 0) return { text: `overdue by ${Math.abs(daysLeft)}d`, overdue: true };
  return { text: `due in ${daysLeft}d`, overdue: false };
}

export function More({ settings, reloadSettings, service, reloadService }: Props) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const markCleaned = async () => { await api.markCleaned(); reloadService(); };
  const markServiced = async () => { await api.markServiced(); reloadService(); };

  useEffect(() => {
    if (settings) setName(settings.saunaName);
  }, [settings]);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === settings?.saunaName) return;
    setSaving(true);
    try {
      await api.saveSettings({ saunaName: trimmed });
      reloadSettings();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Name your sauna */}
      <Card>
        <SectionLabel>Name your sauna</SectionLabel>
        <div className="flex gap-2">
          <input
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            placeholder="e.g. Backyard Sauna"
            className="min-w-0 flex-1 rounded-2xl border border-border bg-surface-2 px-4 py-3 text-text outline-none focus:border-ember"
          />
          <button
            type="button"
            onClick={saveName}
            disabled={saving}
            className="rounded-2xl bg-ember px-4 py-3 font-medium text-black disabled:opacity-50"
          >
            {saved ? "Saved ✓" : "Save"}
          </button>
        </div>
      </Card>

      {/* Service / cleaning schedule */}
      {service && (
        <Card>
          <SectionLabel>Cleaning &amp; service</SectionLabel>
          <div className="flex flex-col gap-3">
            {[
              { label: "Wipe-down / clean", last: service.lastCleanedAt, interval: service.cleanIntervalDays, onDone: markCleaned },
              { label: "Full service / inspection", last: service.lastServicedAt, interval: service.serviceIntervalDays, onDone: markServiced },
            ].map((row) => {
              const status = dueStatus(row.last, row.interval);
              return (
                <div key={row.label} className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-text">{row.label}</span>
                    <span className={`text-xs ${status.overdue ? "text-danger" : "text-muted"}`}>
                      every {row.interval}d · {status.text}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={row.onDone}
                    className="rounded-full border border-border bg-surface-2 px-4 py-2 text-sm"
                  >
                    Mark done
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Remote access guide */}
      <Card>
        <SectionLabel>Use it away from home</SectionLabel>
        <p className="mb-3 text-sm text-muted">
          By default the app controls your sauna only on your home WiFi. To use it from
          anywhere, connect through Tailscale — a free, secure private network.
        </p>
        <details className="rounded-2xl bg-surface-2 p-3">
          <summary className="cursor-pointer font-medium">Set up remote access (Tailscale)</summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>Install <span className="text-text">Tailscale</span> on the always-on computer
              running the bridge, and on your phone — sign in to both with the same account
              (free Personal plan).</li>
            <li>On the bridge computer, run <code className="text-ember-soft">tailscale serve</code> to
              publish the bridge over a secure <code className="text-ember-soft">https://…ts.net</code> address.</li>
            <li>In the app, that becomes your bridge URL — now it works from anywhere your phone
              has internet.</li>
          </ol>
          <p className="mt-3 text-xs text-muted">
            A pre-configured plug-in device (no setup) is coming soon for non-technical users.
          </p>
        </details>
      </Card>

      {/* Clearlight contact */}
      <Card>
        <SectionLabel>Sauna service &amp; support (Clearlight)</SectionLabel>
        <div className="flex flex-col gap-2 text-sm">
          <a href="tel:18007981779" className="flex justify-between">
            <span className="text-muted">Phone</span>
            <span className="text-ember-soft">1-800-798-1779</span>
          </a>
          <a href="https://infraredsauna.com/service-form/" target="_blank" rel="noreferrer" className="flex justify-between">
            <span className="text-muted">Service request</span>
            <span className="text-ember-soft">infraredsauna.com ↗</span>
          </a>
          <p className="mt-1 text-xs text-muted">
            For sauna hardware/warranty issues, contact Clearlight directly (press 3 for service).
          </p>
        </div>
      </Card>

      {/* Feedback */}
      <Card>
        <SectionLabel>Feedback &amp; feature requests</SectionLabel>
        <p className="mb-3 text-sm text-muted">
          Found a bug or have an idea for the app? I&apos;d love to hear it.
        </p>
        <a
          href={`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent("Sauna App feedback")}`}
          className="block rounded-2xl border border-border bg-surface-2 px-4 py-3 text-center font-medium text-text"
        >
          ✉️ Send feedback
        </a>
      </Card>

      <p className="pb-2 text-center text-xs text-muted">
        Independent app · works with Clearlight® saunas · not affiliated with Clearlight
      </p>
    </div>
  );
}
