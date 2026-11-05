import cookie from "@fastify/cookie";
import type { PrismaClient } from "@hub/db";
import type { CurrentUser } from "@hub/shared";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { loadCurrentUser } from "./auth";
import type { AppConfig } from "./config";
import { errorHandler, HttpError } from "./errors";
import { registerAuditRoutes } from "./routes/audit";
import { registerAuthRoutes } from "./routes/auth";
import { registerDashboardRoutes } from "./routes/dashboard";
import { registerResourceRoutes } from "./routes/resources";
import { registerUserRoutes } from "./routes/users";

declare module "fastify" {
  interface FastifyRequest {
    user: CurrentUser | null;
  }
}

const PUBLIC_ROUTES = new Set([
  "/api/health",
  "/api/auth/options",
  "/api/auth/logout",
  "/api/auth/dev-login",
  "/api/auth/google",
  "/api/auth/google/callback",
]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function buildApp(db: PrismaClient, config: AppConfig, logger: boolean = true): Promise<FastifyInstance> {
  const options: FastifyServerOptions = {
    trustProxy: true,
    logger: logger
      ? {
          serializers: {
            // ตัด query string ออกจาก log เพราะ OAuth callback มี code และ state
            req: (request) => ({ method: request.method, url: request.url?.split("?")[0] }),
          },
        }
      : false,
  };
  const app = Fastify(options);
  app.decorateRequest("user", null);
  app.setErrorHandler(errorHandler);
  await app.register(cookie);

  app.addHook("onRequest", async (request) => {
    const origin = request.headers.origin;
    if (!SAFE_METHODS.has(request.method) && origin && origin !== config.webOrigin) {
      throw new HttpError(403, "bad_origin", "ไม่อนุญาตคำขอจากเว็บไซต์อื่น");
    }
    if (PUBLIC_ROUTES.has(request.routeOptions.url ?? "")) return;
    request.user = await loadCurrentUser(db, request);
    if (!request.user && request.routeOptions.url) {
      throw new HttpError(401, "unauthorized", "กรุณาเข้าสู่ระบบ");
    }
  });

  app.get("/api/health", async (_request, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return { status: "ok" };
    } catch {
      return reply.status(503).send({ status: "unavailable" });
    }
  });

  await registerAuthRoutes(app, db, config);
  registerResourceRoutes(app, db);
  registerUserRoutes(app, db);
  registerDashboardRoutes(app, db);
  registerAuditRoutes(app, db);
  return app;
}
