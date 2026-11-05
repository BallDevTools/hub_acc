import type { PrismaClient } from "@hub/db";

export interface NotificationInput {
  severity: "info" | "warning" | "critical";
  title: string;
  body?: string;
  link?: string;
  dedupeKey: string;
}

/** สร้างการแจ้งเตือนครั้งเดียวต่อ dedupeKey */
export async function notify(db: PrismaClient, input: NotificationInput): Promise<void> {
  await db.notification.createMany({ data: [input], skipDuplicates: true });
}
