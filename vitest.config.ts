import { fileURLToPath } from "node:url"

import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    // tmp/ 是 gitignored 暂存区（异构迁移草稿等）：绝不纳入 Web
    // vitest 运行，否则污染门禁与覆盖率。保留 vitest 默认排除（node_modules/dist/…）再加 tmp。
    exclude: [...configDefaults.exclude, "tmp/**", ".gitwarp/**"],
  },
})
