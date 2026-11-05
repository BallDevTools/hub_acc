import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient, User } from "@hub/db";
import type { CurrentUser } from "@hub/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { writeAudit } from "./audit";
import { HttpError } from "./errors";

export const SESSION_COOKIE = "hub_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export interface LoginProfile {
  email: string;
  name?: string | null;
  emailVerified: boolean;
}

/** คืนผู้ใช้เมื่ออยู่ใน allowlist เท่านั้น อีเมลใน ADMIN_EMAILS จะถูกสร้างเป็น admin ตอน login ครั้งแรก */
export async function resolveLoginUser(
  db: PrismaClient,
  profile: LoginProfile,
  adminEmails: Set<string>,
): Promise<User | null> {
  if (!profile.emailVerified) return null;
  const email = profile.email.trim().toLowerCase();
  const name = profile.name?.trim() || null;
  const existing = await db.user.findUnique({ where: { email } });

  if (existing) {
    if (!existing.active) return null;
    return db.user.update({
      where: { id: existing.id },
      data: { lastLoginAt: new Date(), name: existing.name ?? name },
    });
  }
  if (!adminEmails.has(email)) return null;

  return db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email, name, role: "admin", lastLoginAt: new Date() },
    });
    await writeAudit(tx, {
      actorId: created.id,
      action: "create",
      entityType: "user",
      entityId: created.id,
      after: { email, role: created.role, source: "ADMIN_EMAILS" },
    });
    return created;
  });
}

export async function startSession(
  db: PrismaClient,
  reply: FastifyReply,
  userId: string,
  secure: boolean,
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    expires: expiresAt,
  });
}

export async function endSession(db: PrismaClient, request: FastifyRequest, reply: FastifyReply, secure: boolean) {
  const token = request.cookies[SESSION_COOKIE];
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  reply.clearCookie(SESSION_COOKIE, { path: "/", httpOnly: true, sameSite: "lax", secure });
}

export async function loadCurrentUser(db: PrismaClient, request: FastifyRequest): Promise<CurrentUser | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.active) return null;
  const { id, email, name, role } = session.user;
  return { id, email, name, role };
}

export function requireAdmin(request: FastifyRequest): void {
  if (request.user?.role !== "admin") {
    throw new HttpError(403, "forbidden", "ต้องใช้สิทธิ์ admin");
  }
}

export function currentUser(request: FastifyRequest): CurrentUser {
  if (!request.user) throw new HttpError(401, "unauthorized", "กรุณาเข้าสู่ระบบ");
  return request.user;
}
