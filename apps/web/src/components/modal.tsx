"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    // เบราว์เซอร์จะโฟกัสปุ่มปิดก่อน แต่ถ้ามีฟอร์มควรพิมพ์ช่องแรกได้ทันที
    ref.current?.querySelector<HTMLElement>("[data-modal-body] :is(input, select, textarea)")?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      className="m-auto max-h-[90vh] w-[min(36rem,calc(100vw-2rem))] rounded-[22px] bg-surface-1 p-0 text-ink-1"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-surface-1 px-6 pt-5 pb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button className="btn btn-icon" aria-label="ปิด" onClick={() => ref.current?.close()}>
          <X aria-hidden size={17} />
        </button>
      </div>
      <div data-modal-body className="px-6 pb-6">{children}</div>
    </dialog>
  );
}
