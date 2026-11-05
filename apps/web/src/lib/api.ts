export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = options.body !== undefined;
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: hasBody ? { "content-type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error ?? "error",
      data?.message ?? "ติดต่อเซิร์ฟเวอร์ไม่สำเร็จ",
      data?.details ?? [],
    );
  }
  return data as T;
}

/** ดึงตัวเลือกทั้งหมดสำหรับ dropdown โดยไล่อ่านทีละหน้าจนครบ */
export async function fetchAllOptions<T>(path: string): Promise<T[]> {
  const separator = path.includes("?") ? "&" : "?";
  const items: T[] = [];
  for (let page = 1; ; page += 1) {
    const result = await api<T[] | { items: T[]; total: number }>(`${path}${separator}page=${page}&pageSize=100`);
    if (Array.isArray(result)) return result;
    items.push(...result.items);
    if (items.length >= result.total || result.items.length === 0) return items;
  }
}
