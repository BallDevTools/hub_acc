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
    <div className="w-full max-w-sm rounded-lg border border-line bg-surface-1 p-6">
      <h1 className="text-xl font-semibold">Hub ACC</h1>
      <p className="mt-1 text-sm text-ink-2">เข้าสู่ระบบเพื่อดูแลบัญชีและสถานะ</p>
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
          <button className="btn w-full" type="submit" disabled={devLogin.isPending}>
            เข้าสู่ระบบ
          </button>
        </form>
      ) : null}
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
