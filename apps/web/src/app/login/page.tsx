"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { api } from "@/lib/api";

const ERRORS: Record<string, string> = {
  not_allowed: "อีเมลนี้ไม่ได้รับอนุญาตให้เข้าใช้ระบบ",
  google_failed: "เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองอีกครั้ง",
  google_not_configured: "ระบบยังไม่ได้ตั้งค่า Google login",
};

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const options = useQuery({
    queryKey: ["auth-options"],
    queryFn: () => api<{ google: boolean; devLogin: boolean }>("/api/auth/options"),
  });
  const devLogin = useMutation({
    mutationFn: () => api("/api/auth/dev-login", { method: "POST", body: { email } }),
    onSuccess: () => window.location.assign("/"),
  });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    devLogin.mutate();
  };
  const errorCode = params.get("error");
  const error = devLogin.error?.message ?? (errorCode ? (ERRORS[errorCode] ?? "เข้าสู่ระบบไม่สำเร็จ") : null);

  return (
    <div className="card w-full max-w-sm p-7">
      <h1 className="text-2xl font-semibold">เข้าสู่ระบบ</h1>
      <p className="mt-1 text-sm text-ink-3">ใช้บัญชีที่ได้รับอนุญาตเท่านั้น</p>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-critical-ink">
          {error}
        </p>
      ) : null}
      {options.isError ? <p className="mt-4 text-sm text-critical-ink">{options.error.message}</p> : null}
      {options.data?.google ? (
        // ต้องเป็นการนำทางเต็มหน้า เพราะปลายทางจะ redirect ไปที่ Google
        <a className="btn btn-primary mt-5 w-full" href="/api/auth/google">
          เข้าสู่ระบบด้วย Google
        </a>
      ) : null}
      {options.data && !options.data.google && !options.data.devLogin ? (
        <p className="mt-5 text-sm text-ink-2">ระบบยังไม่ได้ตั้งค่าการเข้าสู่ระบบ</p>
      ) : null}
      {options.data?.devLogin ? (
        <form onSubmit={onSubmit} className="mt-5 space-y-3 border-t border-line pt-4">
          <p className="text-xs text-ink-3">โหมดพัฒนา: เข้าด้วยอีเมลใน allowlist โดยไม่ผ่าน Google</p>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              อีเมล
            </label>
            <input
              id="email"
              type="email"
              required
              className="field"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <button className="btn btn-primary w-full" type="submit" disabled={devLogin.isPending}>
            เข้าสู่ระบบ
          </button>
        </form>
      ) : null}
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen gap-3.5 p-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="card flex flex-col justify-between gap-10 bg-hero p-8 text-hero-ink lg:p-12">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="flex size-[30px] items-center justify-center rounded-[10px] bg-lime text-[15px] font-bold text-lime-ink">
            H
          </span>
          <span className="text-base font-semibold">Hub ACC</span>
        </div>
        <div>
          <p className="max-w-xl text-[clamp(30px,4vw,52px)] leading-[1.15] font-semibold tracking-tight">
            ดูแลบัญชี เมล Page และค่าคอมมิชชันในที่เดียว
          </p>
          <p className="mt-4 max-w-md text-sm text-hero-ink-2">
            ติดตามสถานะการสมัคร จัดคิวโพสต์ และดู report ส่วนการสมัครและการยืนยันตัวตนให้เจ้าของบัญชีทำเอง
          </p>
        </div>
      </section>
      <div className="flex items-center justify-center py-6">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
