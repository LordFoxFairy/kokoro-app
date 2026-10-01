import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { expect, it } from "vitest"
import YAML from "yaml"

const SNAPSHOT = resolve(process.cwd(), "src/generated/bff-public-openapi.yaml")
const OWNER_COMMIT = "ccb8e144d72e35d90f9edc23f8b3ed0c82fde98d"
const OWNER_SHA256 = "ba10f89baf0fdd8cd4da58947b0411da8c84294dfe77e278533aeda59a905773"

it("pins the BFF owner Library file operation and distinct Asset wire", async () => {
  const bytes = await readFile(SNAPSHOT)
  expect(OWNER_COMMIT).toBe("ccb8e144d72e35d90f9edc23f8b3ed0c82fde98d")
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
  expect(get.parameters.find((parameter) => parameter.name === "kind")).toMatchObject({ required: true, schema: { enum: ["file", "artifact"] } })
  expect(get.parameters.find((parameter) => parameter.name === "limit")?.schema).toMatchObject({ minimum: 1, maximum: 100, default: 50 })
  expect(get.responses["200"]?.content?.["application/json"].schema.$ref).toBe("#/components/schemas/LibraryListResponse")
  expect(spec.components.schemas.LibraryFilePage).toMatchObject({
    properties: { items: { items: { $ref: "#/components/schemas/LibraryFileItem" } } },
  })
  expect(spec.components.schemas.LibraryFileItem).toMatchObject({
    required: expect.arrayContaining(["kind", "asset_id", "scan_state"]),
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

it("pins the private personal file binary download without redirect or idempotency", async () => {
  const spec = YAML.parse(await readFile(SNAPSHOT, "utf8")) as {
    paths: Record<string, Record<string, unknown>>
  }
  const get = spec.paths["/v1/library/files/{asset_id}/content"]?.get as {
    operationId: string
    "x-kokoro-owner": string
    "x-kokoro-idempotency": string
    parameters: Array<{ name: string; in: string; required: boolean }>
    responses: Record<string, { headers?: Record<string, unknown>; content?: Record<string, unknown> }>
  }
  expect(get.operationId).toBe("downloadLibraryFile")
  expect(get["x-kokoro-owner"]).toBe("kokoro-bff")
  expect(get["x-kokoro-idempotency"]).toBe("none")
  expect(get.parameters).toContainEqual(expect.objectContaining({ name: "asset_id", in: "path", required: true }))
  expect(get.responses["200"]?.headers).toEqual(expect.objectContaining({
    "Content-Disposition": expect.any(Object),
    "Content-Length": expect.any(Object),
    "Referrer-Policy": expect.any(Object),
    "X-Content-Type-Options": expect.any(Object),
  }))
  expect(get.responses["200"]?.content).toHaveProperty("*/*")
  for (const status of ["400", "401", "403", "404", "429", "502", "503"]) expect(get.responses).toHaveProperty(status)
  expect(get.responses).not.toHaveProperty("302")
})
