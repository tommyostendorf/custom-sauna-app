interface Props {
  power: boolean;
  disabled: boolean;
  onToggle: () => void;
}

export function PowerButton({ power, disabled, onToggle }: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={`flex w-full items-center justify-center gap-3 rounded-3xl py-5 text-lg font-semibold transition active:scale-[0.99] disabled:opacity-50 ${
        power
          ? "bg-gradient-to-b from-[#ff7a1a] to-[#ff5e3a] text-black shadow-[0_0_40px_-8px_rgba(255,122,26,0.7)]"
          : "border border-border bg-surface text-text"
      }`}
    >
      <span className="text-2xl">⏻</span>
      {power ? "Sauna On — Tap to turn off" : "Turn Sauna On"}
    </button>
  );
}
