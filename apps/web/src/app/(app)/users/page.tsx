"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Modal } from "@/components/modal";
import { useCurrentUser } from "@/components/shell";
import { ToneBadge } from "@/components/status-badge";
import { ErrorState, Loading, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, ROLE_LABELS } from "@/lib/labels";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
}

function AddUserForm({ onDone }: { onDone: () => void }) {
  const client = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const add = useMutation({
    mutationFn: () => api("/api/users", { method: "POST", body: { email, role } }),
    onSuccess: () => {
      void client.invalidateQueries();
      onDone();
    },
  });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    add.mutate();
  };
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="new-email" className="mb-1 block text-sm font-medium">
          อีเมล Google
        </label>
        <input id="new-email" type="email" required className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label htmlFor="new-role" className="mb-1 block text-sm font-medium">
          สิทธิ์
        </label>
        <select id="new-role" className="field" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="member">สมาชิก</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      {add.error ? (
        <p role="alert" className="text-sm text-critical-ink">
          {add.error.message}
        </p>
      ) : null}
      <button className="btn btn-primary" type="submit" disabled={add.isPending}>
        เพิ่มผู้ใช้
      </button>
    </form>
  );
}

export default function UsersPage() {
  const me = useCurrentUser();
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const isAdmin = me.role === "admin";
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<UserRow[]>("/api/users") });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api(`/api/users/${id}`, { method: "PATCH", body }),
    onSettled: () => client.invalidateQueries(),
  });

  return (
    <div>
      <PageHeader
        title="ผู้ใช้ระบบ"
        actions={
          isAdmin ? (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <Plus aria-hidden size={15} strokeWidth={2.4} />
              เพิ่มผู้ใช้
            </button>
          ) : null
        }
      />
      {update.error ? (
        <p role="alert" className="mb-3 text-sm text-critical-ink">
          {update.error.message}
        </p>
      ) : null}
      <div className="overflow-x-auto card">
        {users.isError ? (
          <ErrorState message={users.error.message} />
        ) : users.isPending ? (
          <Loading />
        ) : (
          <table className="data-table stack-table">
            <thead className="border-b border-line text-xs text-ink-2">
              <tr>
                {["อีเมล", "ชื่อ", "สิทธิ์", "สถานะ", "เข้าใช้ล่าสุด"].map((label) => (
                  <th key={label} scope="col" className="px-5 py-2.5 font-medium whitespace-nowrap">
                    {label}
                  </th>
                ))}
                {isAdmin ? <th scope="col" className="px-5 py-2.5 text-right font-medium">จัดการ</th> : null}
              </tr>
            </thead>
            <tbody>
              {users.data.map((user) => {
                const self = user.id === me.id;
                return (
                  <tr key={user.id} className="border-b border-line last:border-0">
                    <td data-label="อีเมล" className="px-5 py-2.5 font-medium">{user.email}{self ? " (คุณ)" : ""}</td>
                    <td data-label="ชื่อ" className="px-5 py-2.5">{user.name ?? "—"}</td>
                    <td data-label="สิทธิ์" className="px-5 py-2.5">{ROLE_LABELS[user.role]}</td>
                    <td data-label="สถานะ" className="px-5 py-2.5 whitespace-nowrap"><ToneBadge tone={user.active ? "good" : "neutral"} label={user.active ? "ใช้งาน" : "ปิดใช้งาน"} /></td>
                    <td data-label="เข้าใช้ล่าสุด" className="px-5 py-2.5 whitespace-nowrap">{formatDate(user.lastLoginAt)}</td>
                    {isAdmin ? (
                      <td data-actions className="px-5 py-2 text-right whitespace-nowrap">
                        {self ? null : (
                          <span className="inline-flex gap-1">
                            <button
                              className="btn btn-sm"
                              disabled={update.isPending}
                              onClick={() =>
                                update.mutate({
                                  id: user.id,
                                  body: { role: user.role === "admin" ? "member" : "admin" },
                                })
                              }
                            >
                              {user.role === "admin" ? "ปรับเป็นสมาชิก" : "ปรับเป็น Admin"}
                            </button>
                            <button
                              className="btn btn-sm"
                              disabled={update.isPending}
                              onClick={() => update.mutate({ id: user.id, body: { active: !user.active } })}
                            >
                              {user.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                            </button>
                          </span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {adding ? (
        <Modal title="เพิ่มผู้ใช้" onClose={() => setAdding(false)}>
          <AddUserForm onDone={() => setAdding(false)} />
        </Modal>
      ) : null}
    </div>
  );
}
