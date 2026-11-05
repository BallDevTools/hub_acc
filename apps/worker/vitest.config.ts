import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["../api/test/global-setup.ts"],
    include: ["test/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 15000,
  },
});
