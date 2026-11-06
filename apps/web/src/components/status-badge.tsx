import { AlertTriangle, Check, Clock3, Minus, X, type LucideIcon } from "lucide-react";
import { STATUS, type Tone } from "@/lib/labels";

const TONES: Record<Tone, { icon: LucideIcon; className: string }> = {
  good: { icon: Check, className: "bg-good-soft text-good-ink" },
  warning: { icon: Clock3, className: "bg-warning-soft text-warning-ink" },
  serious: { icon: AlertTriangle, className: "bg-serious-soft text-serious-ink" },
  critical: { icon: X, className: "bg-critical-soft text-critical-ink" },
  neutral: { icon: Minus, className: "bg-surface-2 text-ink-2" },
};

export function ToneBadge({ tone, label }: { tone: Tone; label: string }) {
  const { icon: Icon, className } = TONES[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${className}`}>
      <Icon aria-hidden size={12} strokeWidth={2.6} />
      {label}
    </span>
  );
}

export function StatusBadge({ group, value }: { group: string; value: string }) {
  const status = STATUS[group]?.[value] ?? { label: value, tone: "neutral" as Tone };
  return <ToneBadge tone={status.tone} label={status.label} />;
}
