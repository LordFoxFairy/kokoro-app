import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { expect, it } from "vitest"
import YAML from "yaml"

const SNAPSHOT = resolve(process.cwd(), "src/generated/bff-public-openapi.yaml")
const OWNER_COMMIT = "8a90fdd9ec3809000924229bfc7b986ba8ba1522"
const OWNER_SHA256 = "6fa107540c6cc60ec8b45f1bcc19c8930f19c803b16f4c6d418c2edc9393fc52"

it("pins the BFF owner Library file operation and distinct Asset wire", async () => {
  const bytes = await readFile(SNAPSHOT)
  expect(OWNER_COMMIT).toHaveLength(40)
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(OWNER_SHA256)
  const spec = YAML.parse(bytes.toString()) as {
    paths: Record<string, Record<string, unknown>>
    components: { schemas: Record<string, unknown> }
  }
  const get = spec.paths["/v1/library"]?.get as {
    operationId: string
    parameters: Array<{ name: string; required?: boolean; schema: Record<string, unknown> }>
    responses: Record<string, { content?: { "application/json": { schema: { $ref: string } } } }>
  }
  expect(get.operationId).toBe("listLibrary")
  expect(get.parameters.find((parameter) => parameter.name === "kind")).toMatchObject({ required: true, schema: { enum: ["file"] } })
  expect(get.parameters.find((parameter) => parameter.name === "limit")?.schema).toMatchObject({ minimum: 1, maximum: 100, default: 50 })
  expect(get.responses["200"]?.content?.["application/json"].schema.$ref).toBe("#/components/schemas/LibraryFileListResponse")
  expect(spec.components.schemas.LibraryFileListResponse).toMatchObject({
    properties: { data: { properties: { items: { items: { required: expect.arrayContaining(["kind", "asset_id", "scan_state"]) } } } } },
  })
})

it("pins the single-file personal upload operation, whole-body limit and CLEAN receipt", async () => {
  const spec = YAML.parse(await readFile(SNAPSHOT, "utf8")) as {
    paths: Record<string, Record<string, unknown>>
    components: { schemas: Record<string, unknown> }
  }
  const post = spec.paths["/v1/library/files"]?.post as {
    operationId: string
    "x-kokoro-idempotency": string
    parameters: Array<{ $ref: string }>
    requestBody: { content: { "multipart/form-data": { schema: { properties: { files: { minItems: number; maxItems: number } } } } } }
    responses: Record<string, { content?: { "application/json": { schema: { $ref: string } } } }>
  }
  expect(post.operationId).toBe("uploadLibraryFile")
  expect(post["x-kokoro-idempotency"]).toBe("required")
  expect(post.parameters).toContainEqual({ $ref: "#/components/parameters/IdempotencyKey" })
  expect(post.requestBody.content["multipart/form-data"].schema.properties.files).toMatchObject({ minItems: 1, maxItems: 1 })
  expect(post.responses["200"]?.content?.["application/json"].schema.$ref).toBe("#/components/schemas/PersonalFileUploadResponse")
  expect(post.responses).toHaveProperty("413")
  expect(post.responses).toHaveProperty("422")
  expect(spec.components.schemas.PersonalFileUploadResponse).toMatchObject({
    properties: { data: { properties: { file: { required: expect.arrayContaining(["kind", "asset_id", "scan_state"]) } } } },
  })
})
