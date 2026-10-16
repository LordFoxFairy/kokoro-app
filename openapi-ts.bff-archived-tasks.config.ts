import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@hey-api/openapi-ts";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  input:
    process.env.BFF_ARCHIVED_TASKS_CLIENT_INPUT ??
    resolve(root, "src/generated/bff-public-openapi.yaml"),
  output: {
    path:
      process.env.BFF_ARCHIVED_TASKS_CLIENT_OUTPUT ??
      resolve(root, "src/generated/bff-archived-tasks"),
    clean: true,
    entryFile: false,
    module: { extension: "" },
    tsConfigPath: resolve(root, "tsconfig.json"),
  },
  parser: {
    filters: {
      operations: {
        include: ["GET /v1/account/archived-tasks", "GET /v1/sessions/{session_id}/archive", "POST /v1/sessions/{session_id}/archive", "POST /v1/sessions/{session_id}/restore"],
      },
      orphans: false,
    },
  },
  plugins: [
    "@hey-api/typescript",
    { name: "zod", compatibilityVersion: 3, requests: false, responses: true },
    {
      name: "@hey-api/client-fetch",
      bundle: true,
      baseUrl: false,
      throwOnError: false,
    },
    {
      name: "@hey-api/sdk",
      operations: { strategy: "flat" },
      paramsStructure: "grouped",
      responseStyle: "fields",
      auth: false,
      transformer: false,
    },
  ],
});
