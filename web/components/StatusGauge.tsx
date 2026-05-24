import { SaunaState } from "@/lib/types";

interface Props {
  state: SaunaState | null;
  connected: boolean;
  etaMinutes: number | null;
  remainingMinutes: number | null;
}

const BASELINE_F = 70; // assume ~room temp as the start of the heat-up range

export function StatusGauge({ state, connected, etaMinutes, remainingMinutes }: Props) {
  const cur = state?.currentTemp.f ?? 0;
  const target = state?.targetTemp.f ?? 0;
  const power = state?.power ?? false;

  const frac =
    target > BASELINE_F
      ? Math.max(0, Math.min(1, (cur - BASELINE_F) / (target - BASELINE_F)))
      : 0;

  const R = 130;
  const C = 2 * Math.PI * R;
  const dash = C * frac;

  const atTarget = power && cur >= target - 1;

  let caption = "Off";
  if (!connected) caption = "Sauna offline";
  else if (!power) caption = "Ready to start";
  else if (atTarget) caption = "At temperature";
  else if (etaMinutes) caption = `Ready in ~${etaMinutes} min`;
  else caption = "Heating…";

  return (
    <div className="relative mx-auto flex h-[300px] w-[300px] items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 300 300">
        <circle cx="150" cy="150" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth="16" />
        <circle
          cx="150"
          cy="150"
          r={R}
          fill="none"
          stroke="url(#ember)"
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${C}`}
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
        <defs>
          <linearGradient id="ember" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff5e3a" />
            <stop offset="100%" stopColor="#ffb066" />
          </linearGradient>
        </defs>
      </svg>

      <div className="flex flex-col items-center text-center">
        <div className="flex items-start">
          <span className="text-7xl font-semibold tabular-nums leading-none text-text">
            {connected && state ? Math.round(cur) : "--"}
          </span>
          <span className="mt-1 text-2xl text-muted">°F</span>
        </div>
        <div className="mt-1 text-sm text-muted">
          {connected && state ? `Target ${Math.round(target)}°F` : ""}
        </div>
        <div
          className={`mt-3 text-sm font-medium ${
            atTarget ? "text-ember-soft" : connected ? "text-muted" : "text-danger"
          }`}
        >
          {caption}
        </div>
        {power && remainingMinutes !== null && (
          <div className="mt-1 text-xs text-muted">{remainingMinutes} min left in session</div>
        )}
      </div>
    </div>
  );
}
