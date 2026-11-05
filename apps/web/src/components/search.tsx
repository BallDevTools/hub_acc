"use client";

import type { Paginated } from "@hub/shared";
import { useQueries } from "@tanstack/react-query";
import { CornerDownLeft, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { api } from "@/lib/api";
import { NAV_GROUPS } from "@/lib/nav";

const SOURCES = [
  { endpoint: "/api/owners", href: "/owners", label: "เจ้าของบัญชี", field: "name" },
  { endpoint: "/api/mailboxes", href: "/mailboxes", label: "เมล", field: "address" },
  { endpoint: "/api/platform-accounts", href: "/accounts", label: "บัญชีแพลตฟอร์ม", field: "displayName" },
  { endpoint: "/api/pages", href: "/pages", label: "Page", field: "name" },
];
const RESULTS_PER_SOURCE = 5;
const DEBOUNCE_MS = 250;

const SearchContext = createContext<() => void>(() => {});
export const useOpenSearch = () => useContext(SearchContext);
export const SearchProvider = SearchContext.Provider;

type Row = { id: string } & Record<string, unknown>;

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");

  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const queries = useQueries({
    queries: SOURCES.map((source) => ({
      queryKey: ["search", source.endpoint, term],
      queryFn: () =>
        api<Paginated<Row>>(`${source.endpoint}?q=${encodeURIComponent(term)}&pageSize=${RESULTS_PER_SOURCE}`),
      enabled: term.length > 0,
    })),
  });

  const pages = useMemo(() => {
    const value = text.trim().toLowerCase();
    return NAV_GROUPS.flatMap((group) => group.items).filter((item) => !value || item.label.toLowerCase().includes(value));
  }, [text]);

  const groups = SOURCES.map((source, index) => ({
    ...source,
    items: (queries[index]?.data?.items ?? []).map((row) => {
      const value = String(row[source.field]);
      return { id: row.id, value, href: `${source.href}?q=${encodeURIComponent(value)}` };
    }),
  })).filter((group) => group.items.length > 0);

  const loading = term.length > 0 && queries.some((query) => query.isPending);
  const failed = queries.some((query) => query.isError);
  const empty = text.trim().length > 0 && !loading && !failed && term === text.trim() && groups.length === 0 && pages.length === 0;

  const close = () => ref.current?.close();
  const links = () => [...(ref.current?.querySelectorAll<HTMLAnchorElement>("a[data-result]") ?? [])];

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const all = links();
    if (all.length === 0) return;
    const index = all.indexOf(document.activeElement as HTMLAnchorElement);
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    all[(next + all.length) % all.length]?.focus();
  };

  const resultClass =
    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm hover:bg-surface-2 focus-visible:bg-surface-2";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (event.target === ref.current) close();
      }}
      aria-label="ค้นหา"
      className="mx-auto mt-[12vh] max-h-[70vh] w-[min(38rem,calc(100vw-2rem))] overflow-y-auto rounded-[22px] bg-surface-1 p-0 text-ink-1"
    >
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface-1 px-5">
        <Search aria-hidden size={18} className="flex-none text-ink-3" />
        <input
          autoFocus
          type="text"
          aria-label="คำค้นหา"
          placeholder="ค้นหาเจ้าของบัญชี เมล บัญชี หรือ Page"
          className="min-h-14 w-full bg-transparent text-base outline-none"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            const first = links()[0];
            if (!first) return;
            router.push(first.getAttribute("href")!);
            close();
          }}
        />
      </div>
      <div className="p-2">
        {failed ? (
          <p role="alert" className="px-3 py-2 text-sm text-critical-ink">
            ค้นหาบางส่วนไม่สำเร็จ กรุณาลองอีกครั้ง
          </p>
        ) : null}
        {groups.map((group) => (
          <section key={group.endpoint} className="mb-1">
            <h2 className="px-3 pt-2 pb-1 text-xs text-ink-3">{group.label}</h2>
            {group.items.map((item) => (
              <Link key={item.id} data-result href={item.href} onClick={close} className={resultClass}>
                <span className="min-w-0 flex-1 truncate">{item.value}</span>
                <CornerDownLeft aria-hidden size={14} className="flex-none text-ink-3" />
              </Link>
            ))}
          </section>
        ))}
        {pages.length > 0 ? (
          <section>
            <h2 className="px-3 pt-2 pb-1 text-xs text-ink-3">ไปที่หน้า</h2>
            {pages.map((item) => (
              <Link key={item.href} data-result href={item.href} onClick={close} className={resultClass}>
                <item.icon aria-hidden size={16} className="flex-none text-ink-2" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </Link>
            ))}
          </section>
        ) : null}
        {loading ? <p className="px-3 py-2 text-sm text-ink-3">กำลังค้นหา…</p> : null}
        {empty ? <p className="px-3 py-6 text-center text-sm text-ink-3">ไม่พบ “{text.trim()}”</p> : null}
      </div>
    </dialog>
  );
}
