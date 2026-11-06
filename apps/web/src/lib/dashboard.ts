import type { DashboardSummary } from "@hub/shared";
import { api } from "@/lib/api";

/** ใช้ร่วมกันระหว่างหน้าภาพรวมและตัวเลขบนเมนู เพื่อไม่ให้ยิงคำขอซ้ำ */
export const dashboardQuery = {
  queryKey: ["dashboard"],
  queryFn: () => api<DashboardSummary>("/api/dashboard/summary"),
  refetchInterval: 60_000,
};
