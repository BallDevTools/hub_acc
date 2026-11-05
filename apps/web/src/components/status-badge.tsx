import { STATUS, type Tone } from "@/lib/labels";

const ICONS: Record<Tone, { glyph: string; className: string }> = {
  good: { glyph: "✓", className: "text-good" },
  warning: { glyph: "◷", className: "text-warning" },
  serious: { glyph: "!", className: "text-serious" },
  critical: { glyph: "✕", className: "text-critical" },
  neutral: { glyph: "•", className: "text-ink-3" },
};

export function StatusBadge({ group, value }: { group: string; value: string }) {
  const status = STATUS[group]?.[value] ?? { label: value, tone: "neutral" as Tone };
  const icon = ICONS[status.tone];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
      <span aria-hidden className={`font-bold ${icon.className}`}>
        {icon.glyph}
      </span>
      {status.label}
    </span>
  );
}
