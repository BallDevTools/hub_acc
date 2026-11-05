"use client";

import { ONBOARDING_TEMPLATES } from "@hub/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { OwnerSelect } from "@/components/owner-select";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/labels";

interface Task {
  id: string;
  template: string;
  stepKey: string;
  title: string;
  description: string | null;
  url: string | null;
  status: "todo" | "done" | "skipped";
  dueAt: string | null;
}
interface Onboarding {
  copyValues: { name: string; contactEmail: string | null; mailbox: string | null };
  tasks: Task[];
}

const COPY_LABELS = { name: "ชื่อ", contactEmail: "อีเมลติดต่อ", mailbox: "เมล" } as const;

export default function OnboardingPage() {
  const [ownerId, setOwnerId] = useState("");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["onboarding", ownerId],
    queryFn: () => api<Onboarding>(`/api/onboarding/${ownerId}`),
    enabled: Boolean(ownerId),
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Task["status"] }) =>
      api(`/api/onboarding/tasks/${id}`, { method: "PATCH", body: { status } }),
    onSettled: () => client.invalidateQueries({ queryKey: ["onboarding", ownerId] }),
  });
  const generate = useMutation({
    mutationFn: () => api(`/api/onboarding/${ownerId}/generate`, { method: "POST" }),
    onSettled: () => client.invalidateQueries({ queryKey: ["onboarding", ownerId] }),
  });
  const now = Date.now();

  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">Checklist สมัคร</h1>
      <p className="mb-4 text-sm text-ink-2">
        ระบบช่วยเตรียมข้อมูลและติดตามงาน ส่วนการสมัคร ยืนยันตัวตน และยอมรับเงื่อนไข ให้เจ้าของบัญชีทำเอง
      </p>
      <div className="mb-6 max-w-sm">
        <label htmlFor="owner" className="mb-1 block text-sm font-medium">
          เจ้าของบัญชี
        </label>
        <OwnerSelect value={ownerId} onChange={setOwnerId} />
      </div>
      {query.isError ? <p className="text-sm text-critical-ink">{query.error.message}</p> : null}
      {update.error ? <p role="alert" className="mb-3 text-sm text-critical-ink">{update.error.message}</p> : null}
      {query.data && query.data.tasks.length === 0 ? (
        <button className="btn btn-primary" onClick={() => generate.mutate()} disabled={generate.isPending}>
          สร้าง Checklist
        </button>
      ) : null}
      {query.data
        ? Object.entries(ONBOARDING_TEMPLATES).map(([key, template]) => {
            const tasks = query.data.tasks.filter((task) => task.template === key);
            if (tasks.length === 0) return null;
            const finished = tasks.filter((task) => task.status !== "todo").length;
            return (
              <section key={key} className="mb-6 rounded-lg border border-line bg-surface-1">
                <h2 className="flex items-center justify-between border-b border-line px-4 py-3 text-sm font-semibold">
                  {template.title}
                  <span className="font-normal text-ink-2 tabular-nums">
                    {finished} / {tasks.length}
                  </span>
                </h2>
                <ol>
                  {tasks.map((task) => {
                    const step = template.steps.find((item) => item.key === task.stepKey);
                    const overdue = task.status === "todo" && task.dueAt && new Date(task.dueAt).getTime() < now;
                    return (
                      <li key={task.id} className="border-b border-line px-4 py-3 last:border-0">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 basis-64">
                            <p className={`text-sm font-medium ${task.status === "todo" ? "" : "text-ink-3 line-through"}`}>
                              {task.title}
                            </p>
                            {task.description ? <p className="mt-0.5 text-xs text-ink-2">{task.description}</p> : null}
                            {task.dueAt ? (
                              <p className={`mt-0.5 text-xs ${overdue ? "font-medium text-critical-ink" : "text-ink-3"}`}>
                                {overdue ? "เกินกำหนด " : "กำหนด "}
                                {formatDate(task.dueAt)}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {task.url ? (
                              <a className="btn" href={task.url} target="_blank" rel="noopener noreferrer">
                                เปิดหน้า
                              </a>
                            ) : null}
                            {task.status === "todo" ? (
                              <>
                                <button className="btn btn-primary" disabled={update.isPending} onClick={() => update.mutate({ id: task.id, status: "done" })}>
                                  เสร็จแล้ว
                                </button>
                                <button className="btn" disabled={update.isPending} onClick={() => update.mutate({ id: task.id, status: "skipped" })}>
                                  ข้าม
                                </button>
                              </>
                            ) : (
                              <button className="btn" disabled={update.isPending} onClick={() => update.mutate({ id: task.id, status: "todo" })}>
                                ยกเลิก
                              </button>
                            )}
                          </div>
                        </div>
                        {step?.copy && task.status === "todo" ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {step.copy.map((field) => {
                              const value = query.data.copyValues[field];
                              return value ? <CopyButton key={field} value={value} label={`คัดลอก${COPY_LABELS[field]}`} /> : null;
                            })}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })
        : null}
    </div>
  );
}
