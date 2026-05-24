import { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-border bg-surface p-4 ${className}`}>{children}</div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">{children}</div>;
}

export function Toggle({
  on,
  onChange,
  disabled,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`inline-flex h-8 w-14 shrink-0 items-center rounded-full px-1 transition-colors disabled:opacity-40 ${
        on ? "bg-ember" : "bg-surface-2"
      }`}
    >
      <span
        className={`h-6 w-6 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-6" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function RoundButton({
  children,
  onClick,
  disabled,
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-2 text-2xl text-text transition active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function Chip({
  active,
  onClick,
  disabled,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition active:scale-95 disabled:opacity-40 ${
        active
          ? "bg-ember text-black"
          : "border border-border bg-surface-2 text-text"
      }`}
    >
      {children}
    </button>
  );
}
