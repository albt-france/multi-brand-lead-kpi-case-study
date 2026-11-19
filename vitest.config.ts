import { defineConfig } from "vitest/config";

// One worker: the SQL tests share the PGlite data directory.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts", "integrations/**/*.test.ts"], fileParallelism: false, testTimeout: 60_000, hookTimeout: 60_000 },
});
