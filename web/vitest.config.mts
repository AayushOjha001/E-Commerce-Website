import path from "node:path";

import { defineConfig } from "vitest/config";

// `import.meta.dirname` rather than `__dirname`: this file is ESM, and
// __dirname trips Vite's native config loader forward-compat warning.
const rootDir = import.meta.dirname;

export default defineConfig({
  test: {
    // Server-side code only for now; a jsdom project is added when components
    // arrive in Batch 3.
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration tests share one MongoDB instance, so run files serially to
    // keep their collections from racing each other.
    fileParallelism: false,
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    alias: {
      // Mirrors the `@/*` -> `./src/*` path alias in tsconfig.json.
      "@": path.resolve(rootDir, "./src"),
    },
  },
});
