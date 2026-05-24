import { Session } from "@/lib/types";
import { Card, SectionLabel } from "./ui";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function History({ sessions }: { sessions: Session[] }) {
  const recent = sessions.slice(0, 8);
  return (
    <Card>
      <SectionLabel>Recent sessions</SectionLabel>
      {recent.length === 0 ? (
        <div className="py-3 text-center text-sm text-muted">No sessions logged yet.</div>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {recent.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-text">{fmtDate(s.startedAt)}</span>
              <span className="text-muted">
                {s.endedAt
                  ? `${s.durationMinutes ?? 0} min`
                  : "in progress"}
                {" · "}
                {Math.round(s.maxTempF)}°F max
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
