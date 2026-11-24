import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Config นี้จำเป็นเพราะ Vitest ต้องรู้จัก JSX/React 19 (ผ่าน @vitejs/plugin-react)
// และ path alias "@/*" ให้ตรงกับ tsconfig.json เพื่อให้ test import โค้ดจริงของโปรเจกต์ได้
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["testing/unit/**/*.test.{ts,tsx}"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
