import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Phase 13 review — Vitest 초기 설정.
 *
 * 목표:
 *   - 순수 함수 회귀 테스트 (pickPersisted cap, pickWeighted edge,
 *     enhanceSuccessRate, i18n fallback 등)
 *   - 차후 컴포넌트 테스트 가능하도록 jsdom + @testing-library 설치해둠
 *   - TypeScript path alias (`@/...`) 그대로 사용
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Next.js / IndexedDB / Firebase 경로 제외
    exclude: ["node_modules", ".next", "dist", "build"],
  },
});
