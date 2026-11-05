import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: "../../.env", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // `prisma generate` ไม่ต่อฐานข้อมูล จึงใช้ค่าสำรองได้เมื่อไม่มี .env เช่นตอนติดตั้งใน CI
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/unset",
  },
});
