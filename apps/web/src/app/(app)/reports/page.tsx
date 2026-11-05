"use client";

import { CSV_FIELDS, REQUIRED_CSV_FIELDS, type CsvField, type Paginated } from "@hub/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, Download, Upload } from "lucide-react";
import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { useCurrentUser } from "@/components/shell";
import { EmptyState, ErrorState, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/labels";

const FIELD_NAMES: Record<CsvField, string> = {
  orderId: "เลขคำสั่งซื้อ",
  itemKey: "รหัสสินค้า",
  orderedAt: "เวลาสั่งซื้อ",
  status: "สถานะ",
  amount: "ยอดสั่งซื้อ",
  commission: "ค่าคอมมิชชัน",
  subId: "Sub ID",
};
const money = (value: string | number) => Number(value).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayString = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

interface Row {
  period: string;
  pageId: string | null;
  pageName: string | null;
  subId: string | null;
  orders: number;
  cancelledOrders: number;
  amount: string;
  commission: string;
}
interface Performance {
  rows: Row[];
  totals: { orders: number; amount: string; commission: string; unmatchedCommission: string };
}
interface Preview {
  headers: string[];
  rowCount: number;
  mapping: Partial<Record<CsvField, string>>;
  sample: Array<Record<string, string>>;
}
interface ImportResult {
  rowCount: number;
  inserted: number;
  updated: number;
  unchanged: number;
  invalid: number;
  duplicates: number;
  errors: Array<{ row: number; message: string }>;
}

function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ImportPanel() {
  const client = useQueryClient();
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Partial<Record<CsvField, string>>>({});
  const preview = useMutation({
    mutationFn: (text: string) => api<Preview>("/api/reports/shopee/preview", { method: "POST", body: { csv: text } }),
    onSuccess: (data) => setMapping(data.mapping),
  });
  const run = useMutation({
    mutationFn: () => api<ImportResult>("/api/reports/shopee/import", { method: "POST", body: { csv, fileName, mapping } }),
    onSuccess: () => {
      setCsv("");
      void client.invalidateQueries({ queryKey: ["report"] });
      void client.invalidateQueries({ queryKey: ["imports"] });
    },
  });
  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    run.reset();
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    preview.mutate(text);
  };
  const missing = REQUIRED_CSV_FIELDS.filter((field) => !mapping[field]);
  return (
    <Panel title="นำเข้ายอดจาก Shopee">
      <div className="space-y-3 p-5">
        <p className="text-xs text-ink-2">อัปโหลดไฟล์ CSV จาก Shopee Affiliate นำเข้าไฟล์เดิมซ้ำได้ ยอดจะไม่เพิ่ม และคำสั่งซื้อที่สถานะเปลี่ยนจะถูกอัปเดต</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="btn cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
            <Upload aria-hidden size={15} />
            เลือกไฟล์ CSV
            <input type="file" accept=".csv,text/csv" aria-label="ไฟล์ CSV" className="sr-only" onChange={onFile} />
          </label>
          <span className="min-w-0 text-sm break-words text-ink-3">{fileName || "ยังไม่ได้เลือกไฟล์"}</span>
        </div>
        {preview.error ? <p role="alert" className="text-sm text-critical-ink">{preview.error.message}</p> : null}
        {csv && preview.data ? (
          <>
            <p className="text-sm">พบ {preview.data.rowCount.toLocaleString("th-TH")} แถว ตรวจว่าแต่ละช่องตรงกับคอลัมน์ในไฟล์</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {CSV_FIELDS.map((field) => (
                <div key={field}>
                  <label htmlFor={`map-${field}`} className="mb-1 block text-xs font-medium">
                    {FIELD_NAMES[field]}
                    {REQUIRED_CSV_FIELDS.includes(field) ? <span className="text-critical-ink"> *</span> : null}
                  </label>
                  <select
                    id={`map-${field}`}
                    className="field"
                    value={mapping[field] ?? ""}
                    onChange={(e) => setMapping((current) => ({ ...current, [field]: e.target.value }))}
                  >
                    <option value="">— ไม่มี —</option>
                    {preview.data.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {!mapping.itemKey ? <p className="text-xs text-ink-2">ถ้าไม่เลือกรหัสสินค้า คำสั่งซื้อที่มีหลายสินค้าจะถูกนับเป็นรายการเดียว</p> : null}
            <button className="btn btn-primary" disabled={missing.length > 0 || run.isPending} onClick={() => run.mutate()}>
              {run.isPending ? "กำลังนำเข้า…" : "นำเข้า"}
            </button>
          </>
        ) : null}
        {run.error ? <p role="alert" className="text-sm text-critical-ink">{run.error.message}</p> : null}
        {run.data ? (
          <div role="status" className="text-sm">
            <p>นำเข้าแล้ว: เพิ่ม {run.data.inserted} · อัปเดต {run.data.updated} · ไม่เปลี่ยน {run.data.unchanged} · ไม่ผ่าน {run.data.invalid}</p>
            {run.data.duplicates > 0 ? <p className="mt-1 text-xs text-critical-ink">มี {run.data.duplicates} แถวซ้ำในไฟล์ ระบบใช้แถวสุดท้าย ถ้าเป็นคนละสินค้า ให้เลือกคอลัมน์รหัสสินค้าแล้วนำเข้าใหม่</p> : null}
            {run.data.errors.length > 0 ? (
              <ul className="mt-1 list-inside list-disc text-xs text-critical-ink">
                {run.data.errors.map((error) => <li key={error.row}>แถว {error.row}: {error.message}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

export default function ReportsPage() {
  const user = useCurrentUser();
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() => dayString(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(() => dayString(today));
  const [granularity, setGranularity] = useState("day");
  const query = `from=${from}&to=${to}&granularity=${granularity}`;
  const report = useQuery({
    queryKey: ["report", query],
    queryFn: () => api<Performance>(`/api/reports/performance?${query}`),
    enabled: Boolean(from && to),
    placeholderData: (previous) => previous,
  });
  const metrics = useQuery({
    queryKey: ["report-metrics", from, to],
    queryFn: () =>
      api<Array<{ pageId: string; pageName: string; metric: string; total: number; latest: number; latestDate: string }>>(`/api/reports/metrics?from=${from}&to=${to}`),
    enabled: Boolean(from && to),
  });
  const overdue = useQuery({
    queryKey: ["overdue"],
    queryFn: () =>
      api<{
        tasks: Array<{ id: string; title: string; dueAt: string; owner: { name: string } }>;
        accounts: Array<{ id: string; displayName: string; statusChangedAt: string; owner: { name: string } }>;
      }>("/api/reports/overdue"),
  });
  const imports = useQuery({
    queryKey: ["imports"],
    queryFn: () => api<Paginated<{ id: string; fileName: string; insertedCount: number; updatedCount: number; invalidCount: number; createdAt: string }>>("/api/reports/shopee/imports?pageSize=5"),
  });

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="Report"
        actions={
          <a className="btn btn-primary" href={`/api/reports/performance.csv?${query}`}>
            <Download aria-hidden size={15} />
            ส่งออก CSV
          </a>
        }
      />

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label htmlFor="from" className="mb-1 block text-xs font-medium">ตั้งแต่</label>
          <input id="from" type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="to" className="mb-1 block text-xs font-medium">ถึง</label>
          <input id="to" type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label htmlFor="granularity" className="mb-1 block text-xs font-medium">แบ่งตาม</label>
          <select id="granularity" className="field" value={granularity} onChange={(e) => setGranularity(e.target.value)}>
            <option value="day">รายวัน</option>
            <option value="week">รายสัปดาห์</option>
            <option value="month">รายเดือน</option>
          </select>
        </div>
      </div>

      {report.isError ? <div className="card"><ErrorState message={report.error.message} /></div> : null}
      {report.data ? (
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {[
            { label: "คำสั่งซื้อ", value: report.data.totals.orders.toLocaleString("th-TH") },
            { label: "ยอดสั่งซื้อ (บาท)", value: money(report.data.totals.amount) },
            { label: "ค่าคอมมิชชัน ไม่รวมยกเลิก (บาท)", value: money(report.data.totals.commission), hero: true },
            { label: "คอมมิชชันที่จับคู่ Page ไม่ได้", value: money(report.data.totals.unmatchedCommission) },
          ].map((tile) => (
            <div key={tile.label} className={`card px-5 py-[18px] ${tile.hero ? "bg-hero text-hero-ink" : ""}`}>
              <p className={`text-[13px] ${tile.hero ? "text-hero-ink-2" : "text-ink-2"}`}>{tile.label}</p>
              <p className={`mt-1 text-[clamp(22px,2.6vw,32px)] leading-tight font-semibold tracking-tight break-words tabular-nums ${tile.hero ? "text-lime" : ""}`}>{tile.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <Panel title="ยอดแยกตาม Page">
        {report.data?.rows.length === 0 ? <EmptyState icon={BarChart3} title="ไม่มียอดในช่วงเวลานี้" hint="ลองเปลี่ยนช่วงวันที่ หรือนำเข้าไฟล์ CSV จาก Shopee Affiliate" /> : null}
        {report.data && report.data.rows.length > 0 ? (
          <div tabIndex={0} role="region" aria-label="ตารางยอดแยกตาม Page" className="max-h-[32rem] overflow-auto">
            <table className="data-table">
              <thead className="sticky top-0 z-10 border-b border-line bg-surface-1 text-xs text-ink-2">
                <tr>
                  <th scope="col" className="px-5 py-2 font-medium">ช่วงเวลา</th>
                  <th scope="col" className="px-5 py-2 font-medium">Page</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">คำสั่งซื้อ</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">ยกเลิก</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">ยอดสั่งซื้อ</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">คอมมิชชัน</th>
                </tr>
              </thead>
              <tbody>
                {report.data.rows.map((row) => (
                  <tr key={`${row.period}-${row.pageId}-${row.subId}`} className="border-b border-line last:border-0">
                    <td className="px-5 py-2 whitespace-nowrap">{row.period}</td>
                    <td className="px-5 py-2">
                      {row.pageName ?? <span><AlertTriangle aria-hidden size={13} className="mr-1 inline text-serious-ink" />จับคู่ไม่ได้{row.subId ? ` (${row.subId})` : " (ไม่มี Sub ID)"}</span>}
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums">{row.orders}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{row.cancelledOrders}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{money(row.amount)}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{money(row.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>

      <Panel title="สถิติ Page จาก Meta">
        {metrics.isError ? <ErrorState message={metrics.error.message} /> : null}
        {metrics.data?.length === 0 ? <EmptyState icon={BarChart3} title="ยังไม่มีสถิติในช่วงเวลานี้" /> : null}
        {metrics.data && metrics.data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead className="border-b border-line text-xs text-ink-2">
                <tr>
                  <th scope="col" className="px-5 py-2 font-medium">Page</th>
                  <th scope="col" className="px-5 py-2 font-medium">เมตริก</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">รวม</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">ล่าสุด</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">วันที่ล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {metrics.data.map((row) => (
                  <tr key={`${row.pageId}-${row.metric}`} className="border-b border-line last:border-0">
                    <td className="px-5 py-2">{row.pageName}</td>
                    <td className="px-5 py-2 font-mono text-xs">{row.metric}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{row.total.toLocaleString("th-TH")}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{row.latest.toLocaleString("th-TH")}</td>
                    <td className="px-5 py-2 text-right whitespace-nowrap">{row.latestDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>

      {user.role === "admin" ? <ImportPanel /> : null}

      <div className="grid gap-3.5 md:grid-cols-2">
        <Panel title="งานเกินกำหนด">
          {overdue.data?.tasks.length === 0 ? <p className="p-4 text-sm text-ink-2">ไม่มีงานเกินกำหนด</p> : null}
          <ul>
            {overdue.data?.tasks.map((task) => (
              <li key={task.id} className="border-b border-line px-5 py-2 text-sm last:border-0">
                {task.title}
                <p className="text-xs text-ink-2">{task.owner.name} · กำหนด {formatDate(task.dueAt)}</p>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="บัญชีที่ค้างเกิน 14 วัน">
          {overdue.data?.accounts.length === 0 ? <p className="p-4 text-sm text-ink-2">ไม่มีบัญชีค้าง</p> : null}
          <ul>
            {overdue.data?.accounts.map((account) => (
              <li key={account.id} className="border-b border-line px-5 py-2 text-sm last:border-0">
                {account.displayName}
                <p className="text-xs text-ink-2">{account.owner.name} · เปลี่ยนสถานะล่าสุด {formatDate(account.statusChangedAt)}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="ประวัติการนำเข้า">
        {imports.data?.items.length === 0 ? <p className="p-4 text-sm text-ink-2">ยังไม่เคยนำเข้า</p> : null}
        <ul>
          {imports.data?.items.map((item) => (
            <li key={item.id} className="border-b border-line px-5 py-2 text-sm last:border-0">
              <span className="break-words">{item.fileName}</span>
              <p className="text-xs text-ink-2">{formatDate(item.createdAt)} · เพิ่ม {item.insertedCount} · อัปเดต {item.updatedCount} · ไม่ผ่าน {item.invalidCount}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
