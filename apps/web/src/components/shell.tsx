"use client";

import type { CurrentUser } from "@hub/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SearchDialog, SearchProvider } from "@/components/search";
import { Loading } from "@/components/ui";
import { api } from "@/lib/api";
import { dashboardQuery } from "@/lib/dashboard";
import { NAV_GROUPS } from "@/lib/nav";

const UserContext = createContext<CurrentUser | null>(null);

export function useCurrentUser(): CurrentUser {
  const user = useContext(UserContext);
  if (!user) throw new Error("useCurrentUser must be used inside Shell");
  return user;
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<CurrentUser>("/api/auth/me") });
  const summary = useQuery({ ...dashboardQuery, enabled: Boolean(me.data) });
  const [searching, setSearching] = useState(false);
  const logout = useMutation({
    mutationFn: () => api("/api/auth/logout", { method: "POST" }),
    onSuccess: () => window.location.assign("/login"),
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
  if (!me.data) return <Loading />;

  return (
    <UserContext.Provider value={me.data}>
      <SearchProvider value={() => setSearching(true)}>
        <div className="min-h-screen md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="flex flex-col gap-3 px-3.5 pt-4 md:sticky md:top-0 md:h-screen md:gap-5 md:pt-5 md:pb-4">
            <Link href="/" className="flex items-center gap-2.5 px-2">
              <span aria-hidden className="flex size-[30px] items-center justify-center rounded-[10px] bg-lime text-[15px] font-bold text-lime-ink">
                H
              </span>
              <span className="text-base font-semibold">Hub ACC</span>
            </Link>
            <nav aria-label="เมนูหลัก" className="flex gap-1 overflow-x-auto pb-1 md:min-h-0 md:flex-1 md:flex-col md:gap-4 md:overflow-y-auto md:pb-0">
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="flex gap-1 md:flex-col md:gap-0.5">
                  <p className="mb-1 hidden px-3 text-xs text-ink-3 md:block">{group.label}</p>
                  {group.items.map((item) => {
                    const current = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                    const count = summary.data && item.count ? item.count(summary.data) : 0;
                    return (
                      <Link key={item.href} href={item.href} aria-current={current ? "page" : undefined} className="nav-link">
                        <item.icon aria-hidden size={17} className="flex-none" />
                        <span className="flex-1">{item.label}</span>
                        {count > 0 ? (
                          <span
                            aria-label={`${count} รายการ`}
                            className="min-w-5 rounded-full bg-critical-soft px-1.5 text-center text-xs leading-5 font-semibold text-critical-ink tabular-nums"
                          >
                            {count > 99 ? "99+" : count}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="card hidden items-center gap-2.5 rounded-2xl p-2.5 md:flex">
              <span aria-hidden className="flex size-8 flex-none items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-ink uppercase">
                {me.data.email[0]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium" title={me.data.email}>
                  {me.data.email}
                </span>
                <span className="block text-xs text-ink-3">{me.data.role === "admin" ? "ผู้ดูแลระบบ" : "สมาชิก"}</span>
              </span>
              <button
                className="btn btn-sm btn-icon flex-none"
                aria-label="ออกจากระบบ"
                title="ออกจากระบบ"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
              >
                <LogOut aria-hidden size={15} />
              </button>
            </div>
          </aside>
          <main className="min-w-0 px-3.5 pt-4 pb-8 md:pt-5 md:pr-7 md:pl-3.5">
            <div className="mx-auto max-w-[1260px]">{children}</div>
            <div className="mt-6 flex items-center justify-between gap-2 md:hidden">
              <p className="min-w-0 truncate text-xs text-ink-3">{me.data.email}</p>
              <button className="btn btn-surface flex-none" onClick={() => logout.mutate()} disabled={logout.isPending}>
                ออกจากระบบ
              </button>
            </div>
          </main>
        </div>
        {searching ? <SearchDialog onClose={() => setSearching(false)} /> : null}
      </SearchProvider>
    </UserContext.Provider>
  );
}
