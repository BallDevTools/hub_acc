export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm text-ink-2">
      <span>ทั้งหมด {total.toLocaleString("th-TH")} รายการ</span>
      <span className="flex items-center gap-2">
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          ก่อนหน้า
        </button>
        <span className="tabular-nums">
          {page} / {last}
        </span>
        <button className="btn btn-sm" disabled={page >= last} onClick={() => onChange(page + 1)}>
          ถัดไป
        </button>
      </span>
    </div>
  );
}
