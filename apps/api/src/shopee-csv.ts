import { REQUIRED_CSV_FIELDS, type CsvField } from "@hub/shared";
import { parse } from "csv-parse/sync";

const ALIASES: Record<CsvField, string[]> = {
  orderId: ["order id", "order_id", "order sn", "เลขที่คำสั่งซื้อ", "รหัสคำสั่งซื้อ", "หมายเลขคำสั่งซื้อ"],
  itemKey: ["item id", "item_id", "product id", "รหัสสินค้า", "รหัสรายการสินค้า"],
  orderedAt: ["order time", "purchase time", "order date", "เวลาสั่งซื้อ", "เวลาที่สั่งซื้อ", "วันที่สั่งซื้อ"],
  status: ["order status", "conversion status", "status", "สถานะการสั่งซื้อ", "สถานะคำสั่งซื้อ", "สถานะ"],
  amount: ["purchase value", "order amount", "order value", "gmv", "มูลค่าการซื้อ", "ยอดสั่งซื้อ", "มูลค่าคำสั่งซื้อ"],
  commission: ["net commission", "affiliate commission", "commission", "ค่าคอมมิชชันสุทธิ", "ค่าคอมมิชชัน", "ค่าคอมมิชชั่น"],
  subId: ["sub_id", "sub id", "subid", "sub_id1", "sub id1"],
};

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export function parseCsv(csv: string): { headers: string[]; rows: Array<Record<string, string>> } {
  const records = parse(csv.replace(/^\uFEFF/, ""), { skip_empty_lines: true, relax_column_count: true, trim: true }) as string[][];
  const [header, ...body] = records;
  if (!header) return { headers: [], rows: [] };
  return {
    headers: header,
    rows: body.map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""]))),
  };
}

export function detectMapping(headers: string[]): Partial<Record<CsvField, string>> {
  const used = new Set<string>();
  const mapping: Partial<Record<CsvField, string>> = {};
  for (const [field, aliases] of Object.entries(ALIASES) as Array<[CsvField, string[]]>) {
    for (const alias of aliases) {
      const header = headers.find((name) => normalize(name) === alias && !used.has(name));
      if (header) {
        mapping[field] = header;
        used.add(header);
        break;
      }
    }
  }
  return mapping;
}

export function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[฿,\s]|THB|บาท/gi, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

const BANGKOK_OFFSET = "+07:00";

/** ไม่มีเขตเวลาในไฟล์จะถือเป็นเวลาไทย และแปลงปี พ.ศ. เป็น ค.ศ. */
export function parseOrderDate(raw: string): Date | null {
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  const dmy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  const parts = iso
    ? { year: iso[1]!, month: iso[2]!, day: iso[3]!, hour: iso[4], minute: iso[5], second: iso[6] }
    : dmy
      ? { year: dmy[3]!, month: dmy[2]!, day: dmy[1]!, hour: dmy[4], minute: dmy[5], second: dmy[6] }
      : null;
  if (!parts) return null;

  const year = Number(parts.year) > 2400 ? Number(parts.year) - 543 : Number(parts.year);
  const pad = (part: string | undefined) => (part ?? "0").padStart(2, "0");
  const month = pad(parts.month);
  const day = pad(parts.day);
  const date = new Date(`${year}-${month}-${day}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}${BANGKOK_OFFSET}`);
  if (Number.isNaN(date.getTime())) return null;
  // ปฏิเสธวันที่ที่ JavaScript ปัดข้ามเดือน เช่น 31 กุมภาพันธ์
  const check = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", month: "2-digit", day: "2-digit" }).format(date);
  return check === `${month}-${day}` ? date : null;
}

export interface ConversionRow {
  orderId: string;
  itemKey: string;
  subId: string | null;
  orderedAt: Date;
  status: string;
  amount: number;
  commission: number;
}

export interface RowError {
  row: number;
  message: string;
}

export function missingRequired(mapping: Partial<Record<CsvField, string>>, headers: string[]): CsvField[] {
  return REQUIRED_CSV_FIELDS.filter((field) => !mapping[field] || !headers.includes(mapping[field]!));
}

export function toConversions(rows: Array<Record<string, string>>, mapping: Partial<Record<CsvField, string>>) {
  const valid = new Map<string, ConversionRow>();
  const errors: RowError[] = [];
  let duplicates = 0;
  rows.forEach((raw, index) => {
    const row = index + 2; // แถวที่ 1 คือหัวตาราง
    const read = (field: CsvField) => (mapping[field] ? (raw[mapping[field]!] ?? "").trim() : "");
    const orderId = read("orderId");
    const status = read("status");
    const orderedAt = parseOrderDate(read("orderedAt"));
    const amount = parseMoney(read("amount"));
    const commission = parseMoney(read("commission"));
    const problems = [
      !orderId && "ไม่มีเลขคำสั่งซื้อ",
      !status && "ไม่มีสถานะ",
      !orderedAt && `วันที่อ่านไม่ได้ (${read("orderedAt")})`,
      amount === null && `ยอดสั่งซื้ออ่านไม่ได้ (${read("amount")})`,
      commission === null && `ค่าคอมมิชชันอ่านไม่ได้ (${read("commission")})`,
    ].filter(Boolean);
    if (problems.length > 0) {
      errors.push({ row, message: problems.join(", ") });
      return;
    }
    const itemKey = read("itemKey");
    const key = `${orderId}\u0000${itemKey}`;
    if (valid.has(key)) duplicates += 1;
    valid.set(key, {
      orderId,
      itemKey,
      subId: read("subId") || null,
      orderedAt: orderedAt!,
      status,
      amount: amount!,
      commission: commission!,
    });
  });
  return { conversions: [...valid.values()], errors, duplicates };
}

/** กันสูตรทำงานเองเมื่อเปิดไฟล์ใน Excel หรือ Google Sheets */
export function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  const safe = typeof value === "string" && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
