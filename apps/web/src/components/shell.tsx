"use client";

import type { CurrentUser } from "@hub/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";
import { api } from "@/lib/api";

const NAV = [
  { href: "/", label: "ภาพรวม" },
  { href: "/owners", label: "เจ้าของบัญชี" },
  { href: "/mailboxes", label: "เมล" },
  { href: "/accounts", label: "บัญชีแพลตฟอร์ม" },
  { href: "/pages", label: "Page" },
  { href: "/onboarding", label: "Checklist สมัคร" },
  { href: "/page-kits", label: "Page Kit" },
  { href: "/inbox", label: "อีเมลรอตรวจ" },
  { href: "/content", label: "คอนเทนต์" },
  { href: "/schedule", label: "คิวโพสต์" },
  { href: "/connections", label: "การเชื่อมต่อ" },
  { href: "/activity", label: "ประวัติการแก้ไข" },
  { href: "/users", label: "ผู้ใช้ระบบ" },
];

const UserContext = createContext<CurrentUser | null>(null);

export function useCurrentUser(): CurrentUser {
  const user = useContext(UserContext);
  if (!user) throw new Error("useCurrentUser must be used inside Shell");
  return user;
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<CurrentUser>("/api/auth/me") });
  const logout = useMutation({
    mutationFn: () => api("/api/auth/logout", { method: "POST" }),
    onSuccess: () => window.location.assign("/login"),
  });

  if (me.isError && !me.isFetching) {
    return (
      <div className="p-8 text-sm text-ink-2">
        <p>โหลดข้อมูลผู้ใช้ไม่สำเร็จ</p>
        <button className="btn mt-3" onClick={() => me.refetch()}>
          ลองอีกครั้ง
        </button>
      </div>
    );
  }
  if (!me.data) return <div className="p-8 text-sm text-ink-2">กำลังโหลด…</div>;

  return (
    <UserContext.Provider value={me.data}>
      <div className="min-h-screen md:grid md:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="border-b border-line bg-surface-1 md:sticky md:top-0 md:flex md:h-screen md:flex-col md:border-r md:border-b-0">
          <div className="px-4 pt-4 pb-2 font-semibold md:pb-4">Hub ACC</div>
          <nav aria-label="เมนูหลัก" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-1 md:flex-col md:pb-0">
            {NAV.map((item) => {
              const current = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={`rounded-md px-3 py-2 text-sm whitespace-nowrap ${
                    current ? "bg-surface-2 font-medium" : "text-ink-2 hover:bg-surface-2"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center justify-between gap-2 border-t border-line p-3 md:block">
            <p className="truncate text-xs text-ink-2" title={me.data.email}>
              {me.data.email}
            </p>
            <button className="btn md:mt-2 md:w-full" onClick={() => logout.mutate()} disabled={logout.isPending}>
              ออกจากระบบ
            </button>
          </div>
        </aside>
        <main className="min-w-0 p-4 md:p-8">{children}</main>
      </div>
    </UserContext.Provider>
  );
}
