import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// `import.meta.dirname` rather than `__dirname`: this file is ESM, and
// __dirname trips Vite's native config loader forward-compat warning.
const rootDir = import.meta.dirname;

const alias = {
  // Mirrors the `@/*` -> `./src/*` path alias in tsconfig.json.
  "@": path.resolve(rootDir, "./src"),
};

export default defineConfig({
  test: {
    // Two projects, because server code and components need different
    // environments: `node` would have no DOM, and `jsdom` would slow every
    // database test down for nothing.
    projects: [
      {
        resolve: { alias },
        test: {
          name: "server",
          environment: "node",
          include: ["src/**/*.test.ts"],
          // Integration tests share one MongoDB, so run files serially to keep
          // their collections from racing each other.
          fileParallelism: false,
          setupFiles: ["./src/test/setup.ts"],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "components",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./src/test/setup.ts", "./src/test/setup-dom.ts"],
        },
      },
    ],
  },
});
