import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import YAML from "yaml"

import { isLibraryFileDeleteOwnerError, libraryFileAssetIdSchema, libraryFileDeleteErrorSchema, libraryFileDeleteKeySchema, libraryFileDeleteResponseSchema } from "@/contract/library-file"

type ErrorRefinement = { properties: { error: { properties: { code: { enum: string[] }; retryable?: { const: boolean } } } } }
type DeleteOperation = {
  operationId: string
  requestBody?: unknown
  parameters: { name: string; in: string; required: boolean; schema: { pattern: string } }[]
  responses: Record<string, { content: { "application/json": { schema: { allOf: [unknown, ErrorRefinement] } } } }>
}

const owner = YAML.parse(readFileSync("src/generated/bff-public-openapi.yaml", "utf8")) as {
  paths: Record<string, { delete?: DeleteOperation }>
}

describe("published personal Library DELETE", () => {
  it("consumes the only empty command with the pinned Asset/key and exact result shapes", () => {
    const operation = owner.paths["/v1/library/files/{asset_id}"]?.delete
    expect(operation?.operationId).toBe("deleteLibraryFile")
    expect(operation?.requestBody).toBeUndefined()
    expect(operation?.parameters.map(({ name, in: at, required }) => [name, at, required])).toEqual([
      ["asset_id", "path", true], ["Idempotency-Key", "header", true],
    ])
    for (const [index, schema] of [libraryFileAssetIdSchema, libraryFileDeleteKeySchema].entries()) {
      const ownerPattern = new RegExp(operation!.parameters[index]!.schema.pattern, "u")
      for (const sample of ["asset:scope", "x".repeat(191), "x".repeat(192), "has,comma", "has space", "ends\n"]) {
        expect(schema.safeParse(sample).success).toBe(ownerPattern.test(sample))
      }
    }
    const receipt = { data: { asset_id: "file-1", deleted_at: "2026-11-10T00:00:00.000Z", replayed: true } }
    expect(libraryFileDeleteResponseSchema.safeParse(receipt).success).toBe(true)
    expect(libraryFileDeleteResponseSchema.safeParse({ ...receipt, meta: { request_id: "wrong-envelope" } }).success).toBe(false)
    expect(libraryFileDeleteResponseSchema.safeParse({ data: { ...receipt.data, deleted_at: "2026-11-10T00:00:00+01:00" } }).success).toBe(false)
    expect(libraryFileDeleteErrorSchema.safeParse({ error: { code: "file_not_found", message: "missing", retryable: false }, data: receipt.data }).success).toBe(false)
  })

  it("matches the published status/code/retryable tuples, not a generic success or error", () => {
    const statuses = owner.paths["/v1/library/files/{asset_id}"]?.delete?.responses
    expect(Object.keys(statuses ?? {})).toEqual(["200", "400", "401", "403", "404", "409", "429", "502", "503"])
    for (const [status, response] of Object.entries(statuses!)) {
      if (status === "200") continue
      const rule = response.content["application/json"].schema.allOf[1].properties.error.properties
      expect(isLibraryFileDeleteOwnerError(Number(status), "unknown_code", true)).toBe(false)
      for (const code of rule.code.enum) {
        for (const retryable of [true, false]) {
          expect(isLibraryFileDeleteOwnerError(Number(status), code, retryable)).toBe(rule.retryable?.const === undefined || rule.retryable.const === retryable)
        }
      }
    }
  })
})
