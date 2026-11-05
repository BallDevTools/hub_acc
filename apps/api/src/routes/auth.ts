import oauth2, { type OAuth2Namespace } from "@fastify/oauth2";
import type { PrismaClient } from "@hub/db";
import { devLoginSchema } from "@hub/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentUser, endSession, resolveLoginUser, startSession } from "../auth";
import type { AppConfig } from "../config";
import { HttpError } from "../errors";

declare module "fastify" {
  interface FastifyInstance {
    googleOAuth2?: OAuth2Namespace;
  }
}

const googleProfile = z.object({
  email: z.email(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
});

export async function registerAuthRoutes(app: FastifyInstance, db: PrismaClient, config: AppConfig): Promise<void> {
  const secure = config.production;
  const loginUrl = (error: string) => `${config.webOrigin}/login?error=${error}`;

  app.get("/api/auth/options", async () => ({ google: Boolean(config.google), devLogin: config.devLogin }));
  app.get("/api/auth/me", async (request) => currentUser(request));
  app.post("/api/auth/logout", async (request, reply) => {
    await endSession(db, request, reply, secure);
    return reply.status(204).send();
  });

  if (config.devLogin) {
    app.post("/api/auth/dev-login", async (request, reply) => {
      const { email } = devLoginSchema.parse(request.body);
      const user = await resolveLoginUser(db, { email, emailVerified: true }, config.adminEmails);
      if (!user) throw new HttpError(403, "not_allowed", "อีเมลนี้ไม่ได้รับอนุญาตให้เข้าใช้ระบบ");
      await startSession(db, reply, user.id, secure);
      return reply.status(204).send();
    });
  }

  if (!config.google) {
    app.get("/api/auth/google", async (_request, reply) => reply.redirect(loginUrl("google_not_configured")));
    return;
  }

  await app.register(oauth2, {
    name: "googleOAuth2",
    scope: ["openid", "email", "profile"],
    credentials: {
      client: { id: config.google.clientId, secret: config.google.clientSecret },
      auth: oauth2.GOOGLE_CONFIGURATION,
    },
    startRedirectPath: "/api/auth/google",
    callbackUri: `${config.webOrigin}/api/auth/google/callback`,
    pkce: "S256",
    cookie: { path: "/", httpOnly: true, sameSite: "lax", secure },
  });

  app.get("/api/auth/google/callback", async (request, reply) => {
    try {
      const { token } = await app.googleOAuth2!.getAccessTokenFromAuthorizationCodeFlow(request);
      const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { authorization: `Bearer ${token.access_token}` },
      });
      if (!response.ok) throw new Error(`Google userinfo responded ${response.status}`);
      const profile = googleProfile.parse(await response.json());
      const user = await resolveLoginUser(
        db,
        { email: profile.email, name: profile.name, emailVerified: profile.email_verified === true },
        config.adminEmails,
      );
      if (!user) return reply.redirect(loginUrl("not_allowed"));
      await startSession(db, reply, user.id, secure);
      return reply.redirect(`${config.webOrigin}/`);
    } catch (error) {
      request.log.warn({ err: error }, "google login failed");
      return reply.redirect(loginUrl("google_failed"));
    }
  });
}
