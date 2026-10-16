import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@hey-api/openapi-ts";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  input:
    process.env.BFF_ACCOUNT_PROFILE_CLIENT_INPUT ??
    resolve(root, "src/generated/bff-public-openapi.yaml"),
  output: {
    path:
      process.env.BFF_ACCOUNT_PROFILE_CLIENT_OUTPUT ??
      resolve(root, "src/generated/bff-account-profile"),
    clean: true,
    entryFile: false,
    module: { extension: "" },
    tsConfigPath: resolve(root, "tsconfig.json"),
  },
  parser: {
    filters: {
      operations: {
        include: ["PATCH /v1/account/profile"],
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
