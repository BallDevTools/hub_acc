"use client";

import type { PageKitDrafts, Paginated } from "@hub/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { CopyButton } from "@/components/copy-button";
import { OwnerSelect } from "@/components/owner-select";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/labels";

interface Kit {
  id: string;
  category: string;
  status: "pending" | "ready" | "failed";
  drafts: PageKitDrafts | null;
  error: string | null;
  createdAt: string;
  owner: { name: string };
}

function Draft({ text }: { text: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-line py-2">
      <p className="min-w-0 text-sm break-words whitespace-pre-wrap">{text}</p>
      <CopyButton value={text} />
    </div>
  );
}

export default function PageKitsPage() {
  const client = useQueryClient();
  const [ownerId, setOwnerId] = useState("");
  const [category, setCategory] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const kits = useQuery({
    queryKey: ["page-kits"],
    queryFn: () => api<Paginated<Kit>>("/api/page-kits"),
    refetchInterval: (query) => (query.state.data?.items.some((kit) => kit.status === "pending") ? 3000 : false),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["page-kits"] });
  const create = useMutation({
    mutationFn: () => api("/api/page-kits", { method: "POST", body: { ownerId, category, audience, tone } }),
    onSuccess: () => {
      setCategory("");
      void refresh();
    },
  });
  const retry = useMutation({
    mutationFn: (id: string) => api(`/api/page-kits/${id}/retry`, { method: "POST" }),
    onSettled: refresh,
  });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">Page Kit</h1>
      <form onSubmit={onSubmit} className="mb-6 grid gap-3 rounded-lg border border-line bg-surface-1 p-4 sm:grid-cols-2">
        <div>
          <label htmlFor="owner" className="mb-1 block text-sm font-medium">เจ้าของบัญชี *</label>
          <OwnerSelect value={ownerId} onChange={setOwnerId} />
        </div>
        <div>
          <label htmlFor="category" className="mb-1 block text-sm font-medium">หมวดสินค้า *</label>
          <input id="category" required className="field" value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <div>
          <label htmlFor="audience" className="mb-1 block text-sm font-medium">กลุ่มเป้าหมาย</label>
          <input id="audience" className="field" value={audience} onChange={(e) => setAudience(e.target.value)} />
        </div>
        <div>
          <label htmlFor="tone" className="mb-1 block text-sm font-medium">น้ำเสียง</label>
          <input id="tone" className="field" value={tone} onChange={(e) => setTone(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          {create.error ? <p role="alert" className="mb-2 text-sm text-critical-ink">{create.error.message}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={create.isPending}>ร่างด้วย Claude</button>
          <p className="mt-2 text-xs text-ink-3">ข้อความเป็นฉบับร่าง ควรตรวจก่อนนำไปใช้ และการร่างแต่ละครั้งมีค่าใช้จ่าย Claude API</p>
        </div>
      </form>

      {kits.isError ? <p className="text-sm text-critical-ink">{kits.error.message}</p> : null}
      {kits.data?.items.length === 0 ? <p className="text-sm text-ink-2">ยังไม่มี Page Kit</p> : null}
      <div className="space-y-4">
        {kits.data?.items.map((kit) => (
          <article key={kit.id} className="rounded-lg border border-line bg-surface-1 p-4">
            <p className="text-sm font-medium">{kit.category} · {kit.owner.name}</p>
            <p className="text-xs text-ink-3">{formatDate(kit.createdAt)}</p>
            {kit.status === "pending" ? <p className="mt-3 text-sm text-ink-2">กำลังร่าง…</p> : null}
            {kit.status === "failed" ? (
              <div className="mt-3">
                <p className="text-sm text-critical-ink">{kit.error}</p>
                <button className="btn mt-2" disabled={retry.isPending} onClick={() => retry.mutate(kit.id)}>ลองใหม่</button>
              </div>
            ) : null}
            {kit.drafts ? (
              <div className="mt-3 space-y-3">
                <section>
                  <h3 className="mb-1 text-xs font-semibold text-ink-2">ชื่อ Page</h3>
                  {kit.drafts.names.map((name) => <Draft key={name} text={name} />)}
                </section>
                <section>
                  <h3 className="mb-1 text-xs font-semibold text-ink-2">คำอธิบาย</h3>
                  <Draft text={kit.drafts.description} />
                </section>
                <section>
                  <h3 className="mb-1 text-xs font-semibold text-ink-2">โพสต์แรก</h3>
                  {kit.drafts.firstPosts.map((post) => <Draft key={post} text={post} />)}
                </section>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
