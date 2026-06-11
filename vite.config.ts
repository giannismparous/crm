import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    exclude: ["tests/rules/**", "tests/integration/**", "tests/e2e/**", "functions/**"],
  },
});
