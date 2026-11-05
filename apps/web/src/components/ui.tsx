"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { HeaderTools } from "@/components/header-tools";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-center gap-2.5">
      <div className="min-w-0 flex-[1_1_260px]">
        <h1 className="text-[28px] leading-tight font-semibold">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p> : null}
      </div>
      <HeaderTools />
      {actions}
    </header>
  );
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="กำลังโหลด" className="space-y-3 p-5">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton h-9" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span aria-hidden className="mb-3 flex size-12 items-center justify-center rounded-full bg-surface-2 text-ink-2">
        <Icon size={20} />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="mt-1 max-w-sm text-sm text-ink-3">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="p-5 text-sm">
      <p role="alert" className="text-critical-ink">
        {message}
      </p>
      {onRetry ? (
        <button className="btn mt-3" onClick={onRetry}>
          ลองอีกครั้ง
        </button>
      ) : null}
    </div>
  );
}
