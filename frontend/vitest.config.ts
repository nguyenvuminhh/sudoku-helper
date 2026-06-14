import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Provides a working Web Storage implementation: this Vitest + jsdom
    // combination otherwise exposes localStorage as an inert empty object.
    setupFiles: ["./src/test/setup.ts"]
  }
});
