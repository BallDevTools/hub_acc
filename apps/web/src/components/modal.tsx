"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      className="m-auto max-h-[90vh] w-[min(36rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface-1 p-0 text-ink-1"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface-1 px-5 py-3">
        <h2 className="font-semibold">{title}</h2>
        <button className="btn" onClick={() => ref.current?.close()}>
          ปิด
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}
