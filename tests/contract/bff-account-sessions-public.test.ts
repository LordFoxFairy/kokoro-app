import { restorePublic26MessagePartsContract } from "./bff-tool-display-parent"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { readFile } from "node:fs/promises"
import { expect, it } from "vitest"
import YAML from "yaml"
import * as sdk from "@/generated/bff-account-sessions/sdk.gen"
import { accountSessionsSchema, accountSessionRevokeSchema } from "@/lib/account-sessions.schema"
it("pins the complete formal public15.2 artifact with 145 operations and exactly two narrow SDK exports", async () => {
  const bytes = await readFile(resolve(process.cwd(), "src/generated/bff-public-openapi.yaml"))
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("a26431d45ad96c4e80e6751d61e66a14b3933ae7c2ffb6f9e7df57fcc7e6808f")
  const spec = YAML.parse(restorePublic26MessagePartsContract(bytes.toString()))
  expect(spec.info.version).toBe("26.0.0")
  expect(Object.values(spec.paths).flatMap((path) => Object.keys(path as object).filter((key) => ["get", "post", "put", "delete", "patch", "head", "options"].includes(key)))).toHaveLength(186)
  expect(Object.keys(sdk)).toEqual(["listAccountSessions", "revokeAccountSession"])
})
it("nested raw closed validation rejects added credentials before normal generated stripping", () => {
  const sid = { session_id: "current", created_at: "2026-10-14T00:00:00.000Z", expires_at: "2026-10-15T00:00:00.000Z" }
  const raw = { data: { current_session: sid, sessions: [] }, meta: { request_id: "id", next_cursor: null } }
  expect(accountSessionsSchema.safeParse(raw).success).toBe(true)
  expect(accountSessionsSchema.safeParse({ ...raw, data: { ...raw.data, current_session: { ...sid, token: "private" } } }).success).toBe(false)
  expect(accountSessionRevokeSchema.safeParse({ data: { session_id: "other", revoked: true, token: "private" }, meta: { request_id: "id" } }).success).toBe(false)
})
