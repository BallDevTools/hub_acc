import type { Row } from "@/components/resource-page";

export const relationName = (row: Row, key: string, field: string) => {
  const related = row[key] as Record<string, unknown> | null | undefined;
  return related ? String(related[field]) : "—";
};

export function ExternalLink({ href, children }: { href: unknown; children: string }) {
  if (typeof href !== "string" || !href) return <span className="text-ink-3">—</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
      {children}
    </a>
  );
}
