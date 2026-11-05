"use client";

import type { Paginated } from "@hub/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Inbox, Plus, SearchX } from "lucide-react";
import { Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { EntityHistory } from "@/components/history";
import { Modal } from "@/components/modal";
import { Pagination } from "@/components/pagination";
import { useCurrentUser } from "@/components/shell";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui";
import { api, ApiError, fetchAllOptions } from "@/lib/api";

export type Row = Record<string, unknown> & { id: string };
type Option = { value: string; label: string };

export interface Field {
  name: string;
  label: string;
  type: "text" | "email" | "url" | "textarea" | "select" | "relation" | "checkbox";
  required?: boolean;
  help?: string;
  options?: Option[];
  defaultValue?: string;
  /** สำหรับ relation: endpoint และชื่อฟิลด์ที่ใช้แสดง */
  relation?: { endpoint: string; label: (row: Row) => string; scopedToOwner?: boolean };
}

export interface Column {
  label: string;
  render: (row: Row) => ReactNode;
}

export interface ResourceConfig {
  title: string;
  singular: string;
  endpoint: string;
  searchPlaceholder: string;
  columns: Column[];
  fields: Field[];
  filters?: Array<{ param: string; label: string; options: Option[] }>;
}

function RelationSelect({
  field,
  value,
  ownerId,
  onChange,
}: {
  field: Field;
  value: string;
  ownerId: string;
  onChange: (value: string) => void;
}) {
  const relation = field.relation!;
  const scoped = relation.scopedToOwner;
  const separator = relation.endpoint.includes("?") ? "&" : "?";
  const path = scoped ? `${relation.endpoint}${separator}ownerId=${ownerId}` : relation.endpoint;
  const options = useQuery({
    queryKey: ["options", path],
    queryFn: () => fetchAllOptions<Row>(path),
    enabled: !scoped || Boolean(ownerId),
  });
  return (
    <select
      id={field.name}
      className="field"
      required={field.required}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{scoped && !ownerId ? "เลือกเจ้าของบัญชีก่อน" : "— ไม่เลือก —"}</option>
      {options.data?.map((row) => (
        <option key={row.id} value={row.id}>
          {relation.label(row)}
        </option>
      ))}
    </select>
  );
}

function ResourceForm({ config, row, onDone }: { config: ResourceConfig; row: Row | null; onDone: () => void }) {
  const client = useQueryClient();
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      config.fields.map((field) => {
        const current = row?.[field.name];
        if (field.type === "checkbox") return [field.name, current === true];
        return [field.name, typeof current === "string" ? current : (field.defaultValue ?? "")];
      }),
    ),
  );

  const save = useMutation({
    mutationFn: () => {
      const body = Object.fromEntries(
        config.fields.map((field) => {
          const value = values[field.name];
          return [field.name, field.type === "relation" && value === "" ? null : value];
        }),
      );
      return row
        ? api(`${config.endpoint}/${row.id}`, { method: "PATCH", body })
        : api(config.endpoint, { method: "POST", body });
    },
    onSuccess: () => {
      void client.invalidateQueries();
      onDone();
    },
  });

  const update = (field: Field, value: string | boolean) =>
    setValues((previous) => {
      const next = { ...previous, [field.name]: value };
      if (field.name === "ownerId") {
        // เมลหรือบัญชีที่เลือกไว้เป็นของเจ้าของเดิม จึงต้องล้างเมื่อเปลี่ยนเจ้าของ
        for (const other of config.fields) {
          if (other.relation?.scopedToOwner) next[other.name] = "";
        }
      }
      return next;
    });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  const error = save.error;
  const details = error instanceof ApiError ? error.details : [];

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {config.fields.map((field) => {
        const value = values[field.name];
        return (
          <div key={field.name}>
            {field.type === "checkbox" ? (
              <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={value === true}
                  onChange={(event) => update(field, event.target.checked)}
                />
                {field.label}
              </label>
            ) : (
              <>
                <label htmlFor={field.name} className="mb-1 block text-sm font-medium">
                  {field.label}
                  {field.required ? <span className="text-critical-ink"> *</span> : null}
                </label>
                {field.type === "textarea" ? (
                  <textarea
                    id={field.name}
                    className="field"
                    rows={3}
                    value={String(value)}
                    onChange={(event) => update(field, event.target.value)}
                  />
                ) : field.type === "select" ? (
                  <select
                    id={field.name}
                    className="field"
                    required={field.required}
                    value={String(value)}
                    onChange={(event) => update(field, event.target.value)}
                  >
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === "relation" ? (
                  <RelationSelect
                    field={field}
                    value={String(value)}
                    ownerId={String(values.ownerId ?? "")}
                    onChange={(next) => update(field, next)}
                  />
                ) : (
                  <input
                    id={field.name}
                    className="field"
                    type={field.type}
                    required={field.required}
                    value={String(value)}
                    onChange={(event) => update(field, event.target.value)}
                  />
                )}
              </>
            )}
            {field.help ? <p className="mt-1 text-xs text-ink-3">{field.help}</p> : null}
            {details
              .filter((detail) => detail.path === field.name)
              .map((detail) => (
                <p key={detail.message} className="mt-1 text-xs text-critical-ink">
                  ค่านี้ไม่ถูกต้อง
                </p>
              ))}
          </div>
        );
      })}
      {error ? (
        <p role="alert" className="text-sm text-critical-ink">
          {error.message}
        </p>
      ) : null}
      <button className="btn btn-primary" type="submit" disabled={save.isPending}>
        {save.isPending ? "กำลังบันทึก…" : "บันทึก"}
      </button>
    </form>
  );
}

/** คั่นด้วยช่องว่างเมื่อคำไทยตามด้วยคำภาษาอังกฤษ เช่น "เพิ่ม Page" */
const phrase = (prefix: string, word: string) => (/^[A-Za-z]/.test(word) ? `${prefix} ${word}` : `${prefix}${word}`);

type Dialog = { kind: "form"; row: Row | null } | { kind: "history"; row: Row } | { kind: "delete"; row: Row } | null;

function ResourceContent({ config }: { config: ResourceConfig }) {
  const user = useCurrentUser();
  const client = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const page = Math.max(1, Number(params.get("page")) || 1);

  // ลิงก์ ?new=1 จากหน้าอื่นเปิดฟอร์มเพิ่มรายการทันที
  useEffect(() => {
    if (params.get("new") !== "1") return;
    setDialog({ kind: "form", row: null });
    setParam({ new: "" });
  }, []);

  const setParam = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    next.delete("page");
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== (params.get("q") ?? "")) setParam({ q: search });
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const queryString = params.toString();
  const list = useQuery({
    queryKey: ["list", config.endpoint, queryString],
    queryFn: () => api<Paginated<Row>>(`${config.endpoint}?${queryString}`),
    placeholderData: (previous) => previous,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`${config.endpoint}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries();
      setDialog(null);
    },
  });

  const hasFilter = Boolean(queryString.replace(/(^|&)page=\d+/, ""));

  return (
    <div>
      <PageHeader
        title={config.title}
        actions={
          <button className="btn btn-primary" onClick={() => setDialog({ kind: "form", row: null })}>
            <Plus aria-hidden size={15} strokeWidth={2.4} />
            {phrase("เพิ่ม", config.singular)}
          </button>
        }
      />

      <div className="mb-3.5 flex flex-wrap gap-2">
        <input
          type="search"
          aria-label="ค้นหา"
          className="field w-full sm:max-w-xs"
          placeholder={config.searchPlaceholder}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {config.filters?.map((filter) => (
          <select
            key={filter.param}
            aria-label={filter.label}
            className="field w-auto"
            value={params.get(filter.param) ?? ""}
            onChange={(event) => setParam({ [filter.param]: event.target.value })}
          >
            <option value="">{filter.label}: ทั้งหมด</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ))}
      </div>

      <div className="card">
        {list.isError ? (
          <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.isPending ? (
          <Loading />
        ) : list.data.items.length === 0 ? (
          hasFilter ? (
            <EmptyState icon={SearchX} title="ไม่พบรายการที่ตรงกับเงื่อนไข" hint="ลองเปลี่ยนคำค้นหาหรือตัวกรอง" />
          ) : (
            <EmptyState
              icon={Inbox}
              title={phrase("ยังไม่มี", config.singular)}
              action={
                <button className="btn btn-primary" onClick={() => setDialog({ kind: "form", row: null })}>
                  {phrase("เพิ่ม", config.singular)}
                </button>
              }
            />
          )
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table stack-table">
                <thead className="border-b border-line text-xs text-ink-2">
                  <tr>
                    {config.columns.map((column) => (
                      <th key={column.label} scope="col" className="px-5 py-2.5 font-medium whitespace-nowrap">
                        {column.label}
                      </th>
                    ))}
                    <th scope="col" className="px-5 py-2.5 text-right font-medium">
                      จัดการ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((row) => (
                    <tr key={row.id} className="border-b border-line last:border-0">
                      {config.columns.map((column) => (
                        <td key={column.label} data-label={column.label} className="px-5 py-2.5 align-top">
                          {column.render(row)}
                        </td>
                      ))}
                      <td data-actions className="px-5 py-2 text-right whitespace-nowrap">
                        <span className="inline-flex gap-1">
                          <button className="btn btn-sm" onClick={() => setDialog({ kind: "form", row })}>
                            แก้ไข
                          </button>
                          <button className="btn btn-sm" onClick={() => setDialog({ kind: "history", row })}>
                            ประวัติ
                          </button>
                          {user.role === "admin" ? (
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => {
                                remove.reset();
                                setDialog({ kind: "delete", row });
                              }}
                            >
                              ลบ
                            </button>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={list.data.page}
              pageSize={list.data.pageSize}
              total={list.data.total}
              onChange={(next) => {
                const nextParams = new URLSearchParams(params);
                nextParams.set("page", String(next));
                router.replace(`${pathname}?${nextParams}`, { scroll: false });
              }}
            />
          </>
        )}
      </div>
      {page > 1 && list.data?.items.length === 0 ? (
        <button className="btn mt-3" onClick={() => setParam({})}>
          กลับหน้าแรก
        </button>
      ) : null}

      {dialog?.kind === "form" ? (
        <Modal
          title={phrase(dialog.row ? "แก้ไข" : "เพิ่ม", config.singular)}
          onClose={() => setDialog(null)}
        >
          <ResourceForm config={config} row={dialog.row} onDone={() => setDialog(null)} />
        </Modal>
      ) : null}
      {dialog?.kind === "history" ? (
        <Modal title="ประวัติการแก้ไข" onClose={() => setDialog(null)}>
          <EntityHistory entityId={dialog.row.id} />
        </Modal>
      ) : null}
      {dialog?.kind === "delete" ? (
        <Modal title={phrase("ลบ", config.singular)} onClose={() => setDialog(null)}>
          <p className="text-sm">ลบรายการนี้ออกจากระบบ ส่วนประวัติการแก้ไขจะยังอยู่</p>
          {remove.error ? (
            <p role="alert" className="mt-3 text-sm text-critical-ink">
              {remove.error.message}
            </p>
          ) : null}
          <button
            className="btn btn-danger mt-4"
            disabled={remove.isPending}
            onClick={() => remove.mutate(dialog.row.id)}
          >
            ยืนยันการลบ
          </button>
        </Modal>
      ) : null}
    </div>
  );
}

export function ResourcePage({ config }: { config: ResourceConfig }) {
  return (
    <Suspense fallback={<Loading />}>
      <ResourceContent config={config} />
    </Suspense>
  );
}
