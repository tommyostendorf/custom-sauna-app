import { api, applyPreset } from "@/lib/api";
import { Preset, SaunaState } from "@/lib/types";
import { launchMusic } from "@/lib/music";
import { Card, SectionLabel } from "./ui";

interface Props {
  presets: Preset[];
  state: SaunaState | null;
  busy: boolean;
  connected: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
  reloadPresets: () => void;
}

export function Presets({ presets, state, busy, connected, run, reloadPresets }: Props) {
  const disabled = busy || !connected;

  const apply = (p: Preset) =>
    run(async () => {
      await applyPreset(p);
      if (p.startMusic) launchMusic();
    });

  const headingIn = () => {
    const routine = presets.find((p) => p.delayedStartMinutes === 0) ?? presets[0];
    if (!routine) return;
    run(async () => {
      await applyPreset({ ...routine, delayedStartMinutes: 0 });
      launchMusic();
    });
  };

  const saveCurrent = () => {
    if (!state) return;
    const name = window.prompt("Name this preset:");
    if (!name) return;
    run(async () => {
      await api.savePreset({
        name,
        emoji: "⭐",
        temperatureF: Math.round(state.targetTemp.f),
        timerMinutes: state.timerMinutes || 30,
        delayedStartMinutes: 0,
        internalLight: state.lights.internal,
        externalLight: state.lights.external,
      });
      reloadPresets();
    });
  };

  const remove = (p: Preset) => {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    run(async () => {
      await api.deletePreset(p.id);
      reloadPresets();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* One-tap "Heading in" routine */}
      <button
        type="button"
        disabled={disabled || presets.length === 0}
        onClick={headingIn}
        className="flex w-full items-center justify-center gap-2 rounded-3xl border border-ember/40 bg-gradient-to-b from-[#2a1a0e] to-[#1e1711] py-4 text-lg font-semibold text-ember-soft transition active:scale-[0.99] disabled:opacity-50"
      >
        🔥 Heading In — start everything
      </button>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <SectionLabel>Presets</SectionLabel>
          <button
            type="button"
            disabled={disabled}
            onClick={saveCurrent}
            className="text-xs text-ember-soft disabled:opacity-40"
          >
            ＋ Save current
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {presets.map((p) => (
            <div
              key={p.id}
              className="relative rounded-2xl border border-border bg-surface-2 p-3"
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => apply(p)}
                className="flex w-full flex-col items-start text-left disabled:opacity-50"
              >
                <span className="text-2xl">{p.emoji ?? "🔥"}</span>
                <span className="mt-1 font-medium leading-tight">{p.name}</span>
                <span className="mt-1 text-xs text-muted">
                  {p.temperatureF}°F · {p.timerMinutes}m
                  {p.delayedStartMinutes > 0 ? ` · in ${p.delayedStartMinutes}m` : ""}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Delete ${p.name}`}
                onClick={() => remove(p)}
                className="absolute right-2 top-2 text-muted/60 hover:text-danger"
              >
                ✕
              </button>
            </div>
          ))}
          {presets.length === 0 && (
            <div className="col-span-2 py-4 text-center text-sm text-muted">
              No presets yet. Set things how you like, then “Save current”.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
