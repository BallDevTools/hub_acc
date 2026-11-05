import { randomBytes, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@hub/db";
import {
  buildGmailAuthUrl,
  buildMetaAuthUrl,
  decryptToken,
  encryptToken,
  exchangeGmailCode,
  GMAIL_SCOPE,
  httpGmailClient,
  httpMetaClient,
  META_SCOPES,
  type GmailClient,
  type MetaClient,
} from "@hub/integrations";
import { connectMetaPageSchema } from "@hub/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { writeAudit } from "../audit";
import { currentUser, requireAdmin } from "../auth";
import type { AppConfig } from "../config";
import { HttpError, notFound } from "../errors";

const STATE_COOKIE = "hub_connect_state";

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export interface ConnectionClients {
  exchangeGmailCode: typeof exchangeGmailCode;
  gmail: GmailClient;
  meta: MetaClient;
}

export function registerConnectionRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  config: AppConfig,
  overrides: Partial<ConnectionClients> = {},
): void {
  const clients: ConnectionClients = { exchangeGmailCode, gmail: httpGmailClient, meta: httpMetaClient, ...overrides };
  const secure = config.production;
  const page = (query: string) => `${config.webOrigin}/connections?${query}`;
  const redirectUri = `${config.webOrigin}/api/connections/google/callback`;

  const requireGoogleSetup = () => {
    if (!config.google || !config.tokenKey) {
      throw new HttpError(503, "not_configured", "ระบบยังไม่ได้ตั้งค่า Google OAuth หรือ TOKEN_ENCRYPTION_KEY");
    }
    return { google: config.google, tokenKey: config.tokenKey };
  };

  const readState = (request: FastifyRequest, state: string | undefined) => {
    const cookie = request.cookies[STATE_COOKIE];
    return Boolean(cookie && state && safeEqual(cookie, state));
  };

  app.get("/api/connections", async () =>
    db.oAuthConnection.findMany({
      // ห้ามส่ง token ออกไป จึงเลือกเฉพาะข้อมูลที่แสดงผล
      select: {
        id: true,
        provider: true,
        accountLabel: true,
        mailboxId: true,
        status: true,
        lastSyncAt: true,
        lastError: true,
        pageId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  );

  app.get("/api/connections/google/start", async (request, reply) => {
    const { google } = requireGoogleSetup();
    const { mailboxId } = z.object({ mailboxId: z.uuid() }).parse(request.query);
    const mailbox = await db.mailbox.findUnique({ where: { id: mailboxId } });
    if (!mailbox) throw notFound();
    const state = `${randomBytes(24).toString("base64url")}.${mailboxId}`;
    reply.setCookie(STATE_COOKIE, state, { path: "/", httpOnly: true, sameSite: "lax", secure, maxAge: 600 });
    return reply.redirect(
      buildGmailAuthUrl({ clientId: google.clientId, redirectUri, state, loginHint: mailbox.address }),
    );
  });

  app.get("/api/connections/google/callback", async (request, reply) => {
    const { google, tokenKey } = requireGoogleSetup();
    const { code, state } = z.object({ code: z.string().optional(), state: z.string().optional() }).parse(request.query);
    const actor = currentUser(request);
    reply.clearCookie(STATE_COOKIE, { path: "/", httpOnly: true, sameSite: "lax", secure });
    if (!code || !readState(request, state)) return reply.redirect(page("error=google_denied"));

    const mailboxId = state!.split(".")[1]!;
    const mailbox = await db.mailbox.findUnique({ where: { id: mailboxId } });
    if (!mailbox) return reply.redirect(page("error=mailbox_missing"));

    try {
      const tokens = await clients.exchangeGmailCode(google, code, redirectUri);
      // กันการเชื่อมผิดบัญชี Gmail ซึ่งจะทำให้ระบบอ่านเมลของคนอื่นเข้ามาผูกกับเมลนี้
      const email = await clients.gmail.profileEmail(tokens.accessToken);
      if (email !== mailbox.address) return reply.redirect(page("error=wrong_account"));
      if (!tokens.refreshToken) return reply.redirect(page("error=no_refresh_token"));

      const secrets = {
        accessTokenEnc: encryptToken(tokens.accessToken, tokenKey),
        refreshTokenEnc: encryptToken(tokens.refreshToken, tokenKey),
        expiresAt: tokens.expiresAt,
        status: "active" as const,
        lastError: null,
      };
      await db.$transaction(async (tx) => {
        const connection = await tx.oAuthConnection.upsert({
          where: { mailboxId },
          create: {
            provider: "google_gmail",
            accountLabel: email,
            mailboxId,
            createdById: actor.id,
            scopes: GMAIL_SCOPE,
            ...secrets,
          },
          update: secrets,
          select: { id: true },
        });
        await writeAudit(tx, {
          actorId: actor.id,
          action: "update",
          entityType: "connection",
          entityId: connection.id,
          after: { provider: "google_gmail", accountLabel: email },
        });
      });
      return reply.redirect(page("connected=gmail"));
    } catch (error) {
      request.log.warn({ err: error }, "gmail connection failed");
      return reply.redirect(page("error=google_failed"));
    }
  });

  const metaRedirectUri = `${config.webOrigin}/api/connections/meta/callback`;
  const requireMetaSetup = () => {
    if (!config.meta || !config.tokenKey) {
      throw new HttpError(503, "not_configured", "ระบบยังไม่ได้ตั้งค่า Meta App หรือ TOKEN_ENCRYPTION_KEY");
    }
    return { meta: config.meta, tokenKey: config.tokenKey };
  };

  app.get("/api/connections/meta/start", async (request, reply) => {
    requireAdmin(request);
    const { meta } = requireMetaSetup();
    const state = randomBytes(24).toString("base64url");
    reply.setCookie(STATE_COOKIE, state, { path: "/", httpOnly: true, sameSite: "lax", secure, maxAge: 600 });
    return reply.redirect(buildMetaAuthUrl({ appId: meta.appId, redirectUri: metaRedirectUri, state }));
  });

  app.get("/api/connections/meta/callback", async (request, reply) => {
    requireAdmin(request);
    const { meta, tokenKey } = requireMetaSetup();
    const { code, state } = z.object({ code: z.string().optional(), state: z.string().optional() }).parse(request.query);
    const actor = currentUser(request);
    reply.clearCookie(STATE_COOKIE, { path: "/", httpOnly: true, sameSite: "lax", secure });
    if (!code || !readState(request, state)) return reply.redirect(page("error=meta_denied"));
    try {
      const token = await clients.meta.exchangeCode(meta, code, metaRedirectUri);
      const secrets = {
        accessTokenEnc: encryptToken(token.accessToken, tokenKey),
        expiresAt: token.expiresAt,
        status: "active" as const,
        lastError: null,
      };
      await db.$transaction(async (tx) => {
        const existing = await tx.oAuthConnection.findFirst({
          where: { provider: "meta_user", createdById: actor.id },
          select: { id: true },
        });
        const connection = existing
          ? await tx.oAuthConnection.update({ where: { id: existing.id }, data: secrets, select: { id: true } })
          : await tx.oAuthConnection.create({
              data: {
                provider: "meta_user",
                accountLabel: `Meta: ${actor.email}`,
                createdById: actor.id,
                scopes: META_SCOPES.join(","),
                ...secrets,
              },
              select: { id: true },
            });
        await writeAudit(tx, {
          actorId: actor.id,
          action: "update",
          entityType: "connection",
          entityId: connection.id,
          after: { provider: "meta_user" },
        });
      });
      return reply.redirect(page("connected=meta"));
    } catch (error) {
      request.log.warn({ err: error }, "meta connection failed");
      return reply.redirect(page("error=meta_failed"));
    }
  });

  const metaUserToken = async (userId: string, tokenKey: string) => {
    const connection = await db.oAuthConnection.findFirst({
      where: { provider: "meta_user", createdById: userId, status: "active" },
    });
    if (!connection) throw new HttpError(409, "meta_not_connected", "กรุณาเชื่อมบัญชี Meta ก่อน");
    return decryptToken(connection.accessTokenEnc, tokenKey);
  };

  app.get("/api/connections/meta/pages", async (request) => {
    requireAdmin(request);
    const { tokenKey } = requireMetaSetup();
    const pages = await clients.meta.listPages(await metaUserToken(currentUser(request).id, tokenKey));
    // ส่งเฉพาะรหัสและชื่อ ไม่ส่ง Page token ออกไปที่เบราว์เซอร์
    return pages.map(({ id, name }) => ({ id, name }));
  });

  app.post("/api/pages/:id/connect-meta", async (request) => {
    requireAdmin(request);
    const { tokenKey } = requireMetaSetup();
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const { metaPageId } = connectMetaPageSchema.parse(request.body);
    const actor = currentUser(request);
    if (!(await db.page.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
    const pages = await clients.meta.listPages(await metaUserToken(actor.id, tokenKey));
    const match = pages.find((item) => item.id === metaPageId);
    if (!match) throw new HttpError(403, "page_not_managed", "บัญชี Meta นี้ไม่มีสิทธิ์จัดการ Page นี้");
    const secrets = { accessTokenEnc: encryptToken(match.accessToken, tokenKey), status: "active" as const, lastError: null };
    return db.$transaction(async (tx) => {
      const before = await tx.page.findUniqueOrThrow({ where: { id } });
      const updated = await tx.page.update({ where: { id }, data: { metaPageId } });
      const connection = await tx.oAuthConnection.upsert({
        where: { pageId: id },
        create: {
          provider: "meta_page",
          accountLabel: match.name,
          pageId: id,
          createdById: actor.id,
          scopes: META_SCOPES.join(","),
          ...secrets,
        },
        update: { accountLabel: match.name, ...secrets },
        select: { id: true },
      });
      await writeAudit(tx, { actorId: actor.id, action: "update", entityType: "page", entityId: id, before, after: updated });
      return { pageId: id, connectionId: connection.id, metaPageId };
    });
  });

  app.delete("/api/connections/:id", async (request, reply) => {
    requireAdmin(request);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const actor = currentUser(request);
    await db.$transaction(async (tx) => {
      const before = await tx.oAuthConnection.findUnique({
        where: { id },
        select: { provider: true, accountLabel: true },
      });
      if (!before) throw notFound();
      const removed = await tx.oAuthConnection.delete({ where: { id } });
      if (removed.pageId) await tx.page.update({ where: { id: removed.pageId }, data: { metaPageId: null } });
      await writeAudit(tx, { actorId: actor.id, action: "delete", entityType: "connection", entityId: id, before });
    });
    return reply.status(204).send();
  });
}
