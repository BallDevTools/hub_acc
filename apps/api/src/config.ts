import { assertValidKey } from "@hub/integrations";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.url(),
  ADMIN_EMAILS: z.string().default(""),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  AUTH_DEV_LOGIN: z.enum(["true", "false"]).default("false"),
  TOKEN_ENCRYPTION_KEY: z.string().default(""),
  META_APP_ID: z.string().default(""),
  META_APP_SECRET: z.string().default(""),
});

export interface AppConfig {
  production: boolean;
  databaseUrl: string;
  port: number;
  webOrigin: string;
  adminEmails: Set<string>;
  google: { clientId: string; clientSecret: string } | null;
  devLogin: boolean;
  /** กุญแจเข้ารหัส OAuth token ถ้าไม่ตั้ง ระบบจะปิดการเชื่อมบัญชีภายนอก */
  tokenKey: string | null;
  meta: { appId: string; appSecret: string } | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const production = parsed.NODE_ENV === "production";
  const devLogin = parsed.AUTH_DEV_LOGIN === "true";

  if (production && devLogin) {
    throw new Error("AUTH_DEV_LOGIN must not be enabled in production");
  }
  if (Boolean(parsed.GOOGLE_CLIENT_ID) !== Boolean(parsed.GOOGLE_CLIENT_SECRET)) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together");
  }

  if (Boolean(parsed.META_APP_ID) !== Boolean(parsed.META_APP_SECRET)) {
    throw new Error("META_APP_ID and META_APP_SECRET must be set together");
  }
  if (parsed.TOKEN_ENCRYPTION_KEY) assertValidKey(parsed.TOKEN_ENCRYPTION_KEY);

  return {
    production,
    databaseUrl: parsed.DATABASE_URL,
    port: parsed.API_PORT,
    webOrigin: new URL(parsed.WEB_ORIGIN).origin,
    adminEmails: new Set(
      parsed.ADMIN_EMAILS.split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
    google: parsed.GOOGLE_CLIENT_ID
      ? { clientId: parsed.GOOGLE_CLIENT_ID, clientSecret: parsed.GOOGLE_CLIENT_SECRET }
      : null,
    devLogin,
    tokenKey: parsed.TOKEN_ENCRYPTION_KEY || null,
    meta: parsed.META_APP_ID ? { appId: parsed.META_APP_ID, appSecret: parsed.META_APP_SECRET } : null,
  };
}
