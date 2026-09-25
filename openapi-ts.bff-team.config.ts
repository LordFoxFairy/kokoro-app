import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig } from "@hey-api/openapi-ts"

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  input: process.env.BFF_TEAM_CLIENT_INPUT ?? resolve(root, "src/generated/bff-public-openapi.yaml"),
  output: {
    path: process.env.BFF_TEAM_CLIENT_OUTPUT ?? resolve(root, "src/generated/bff-team"),
    clean: true,
    entryFile: false,
    module: { extension: "" },
    tsConfigPath: resolve(root, "tsconfig.json"),
  },
  parser: {
    filters: {
      operations: {
        include: [
          "GET /v1/team/members",
          "GET /v1/team/invitations",
          "GET /v1/team/roles",
          "POST /v1/team/invitations",
          "POST /v1/team/invitations/{invitation_id}/resend",
          "DELETE /v1/team/invitations/{invitation_id}",
          "PUT /v1/team/members/{member_id}/roles",
          "DELETE /v1/team/members/{member_id}",
          "DELETE /v1/team/members/me",
        ],
      },
      orphans: false,
    },
  },
  plugins: [
    "@hey-api/typescript",
    { name: "@hey-api/client-fetch", bundle: true, baseUrl: false, throwOnError: false },
    { name: "@hey-api/sdk", operations: { strategy: "flat" }, paramsStructure: "grouped", responseStyle: "fields", auth: false, transformer: false },
  ],
})
