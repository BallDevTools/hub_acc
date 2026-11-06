import type { Prisma, PrismaClient } from "@hub/db";
import { PageKitRefusedError, type PageKitGenerator } from "@hub/integrations";

const failureMessage = (error: unknown) =>
  error instanceof PageKitRefusedError ? "Claude ไม่สามารถร่างเนื้อหานี้ได้ ลองปรับหมวดสินค้าหรือน้ำเสียง" : "สร้าง Page Kit ไม่สำเร็จ กรุณาลองใหม่";

export async function runGeneratePageKit(
  db: PrismaClient,
  generator: PageKitGenerator | null,
  pageKitId: string,
): Promise<void> {
  const kit = await db.pageKit.findUnique({ where: { id: pageKitId } });
  if (!kit || kit.status !== "pending") return;
  if (!generator) {
    await db.pageKit.update({ where: { id: kit.id }, data: { status: "failed", error: "ระบบยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY" } });
    return;
  }
  try {
    const drafts = await generator({ category: kit.category, audience: kit.audience, tone: kit.tone });
    await db.pageKit.update({
      where: { id: kit.id },
      data: { status: "ready", drafts: drafts as unknown as Prisma.InputJsonValue, error: null },
    });
  } catch (error) {
    console.error("[worker] page kit failed", error instanceof Error ? error.message : error);
    await db.pageKit.update({ where: { id: kit.id }, data: { status: "failed", error: failureMessage(error) } });
  }
}
