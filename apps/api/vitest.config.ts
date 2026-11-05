import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    include: ["test/**/*.test.ts"],
    // ทุกไฟล์ใช้ฐานข้อมูลทดสอบร่วมกัน จึงต้องรันทีละไฟล์
    fileParallelism: false,
    testTimeout: 15000,
  },
});
