import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@hey-api/openapi-ts";
const root = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  input:
    process.env.BFF_PUBLIC_SKILL_LIST_INPUT ??
    resolve(root, "src/generated/bff-public-openapi.yaml"),
  output: {
    path:
      process.env.BFF_PUBLIC_SKILL_LIST_OUTPUT ??
      resolve(root, "src/generated/bff-public-skill-list"),
    clean: true,
    entryFile: false,
    module: { extension: "" },
    tsConfigPath: resolve(root, "tsconfig.json"),
  },
  parser: {
    filters: {
      operations: { include: ["GET /v1/skill.list"] },
      orphans: false,
    },
  },
  plugins: [
    "@hey-api/typescript",
    {
      name: "zod",
      compatibilityVersion: 3,
      requests: true,
      responses: true,
      // This HTTP adapter validates JSON; it must not coerce numeric timestamps to BigInt/string.
      $resolvers: {
        number: (ctx) =>
          ctx.schema.type === "integer" && ctx.schema.format === "int64"
            ? ctx
                .$(ctx.plugin.imports.z)
                .attr("number")
                .call()
                .attr("int")
                .call()
                .attr("safe")
                .call()
            : undefined,
      },
    },
  ],
});
