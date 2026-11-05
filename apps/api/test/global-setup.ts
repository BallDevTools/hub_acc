import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: resolve(import.meta.dirname, "../../../.env"), quiet: true });

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required");
  const parsed = new URL(url);
  const name = parsed.pathname.slice(1);
  if (!name.endsWith("_test")) throw new Error("TEST_DATABASE_URL must point to a *_test database");

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (!rowCount) await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  execFileSync("pnpm", ["--filter", "@hub/db", "exec", "prisma", "migrate", "deploy"], {
    cwd: resolve(import.meta.dirname, "../../.."),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
