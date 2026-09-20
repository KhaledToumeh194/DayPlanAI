/// <reference types="vitest/config" />

import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: {
    port: 8080,
  },

  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },

  resolve: {
    tsconfigPaths: true,
  },

  plugins: [...(process.env["VITEST"] ? [] : [tanstackStart()]), viteReact(), tailwindcss()],
});
