import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrismaClient } from "@hub/db";

export const HEARTBEAT_FILE = join(tmpdir(), "hub-worker-heartbeat");

export interface HeartbeatDeps {
  file: string;
  pingUrl: string | null;
  send?: (url: string) => Promise<void>;
}

async function ping(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Ping responded ${response.status}`);
}

/**
 * บอกว่า worker และฐานข้อมูลยังทำงาน
 * ถ้าไม่ได้ ping ถึงเวลา บริการภายนอกจะแจ้งเตือน เพราะระบบที่ล่มแจ้งเตือนตัวเองไม่ได้
 */
export async function runHeartbeat(db: PrismaClient, deps: HeartbeatDeps): Promise<void> {
  await db.$queryRaw`SELECT 1`;
  await writeFile(deps.file, new Date().toISOString());
  if (!deps.pingUrl) return;
  try {
    await (deps.send ?? ping)(deps.pingUrl);
  } catch (error) {
    // ping ล้มเหลวไม่ได้แปลว่า worker เสีย จึงไม่ทำให้งานนี้ fail
    console.error("[worker] heartbeat ping failed", error instanceof Error ? error.message : error);
  }
}
