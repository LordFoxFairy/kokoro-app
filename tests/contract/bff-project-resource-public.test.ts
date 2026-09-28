import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"
import YAML from "yaml"

const BFF_OWNER_COMMIT = "d5c868f8ab8b8a33750e1286e9d020ca72895641"
const BFF_PUBLIC_OPENAPI_SHA256 = "3f8aba161444d8b617df7ff1789e698269a4a6dd2c8b2ae7b3aaadb331947681"
const SNAPSHOT = resolve(process.cwd(), "src/generated/bff-public-openapi.yaml")

describe("pinned BFF project resource contract", () => {
  it("pins the exact BFF owner public OpenAPI blob", async () => {
    const bytes = await readFile(SNAPSHOT)
    expect(BFF_OWNER_COMMIT).toHaveLength(40)
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(BFF_PUBLIC_OPENAPI_SHA256)
  })

  it("requires private CLEAN cursor pages with bounded limit and no upload/download locator", async () => {
    const spec = YAML.parse(await readFile(SNAPSHOT, "utf8")) as {
      paths: Record<string, Record<string, unknown>>
      components: { schemas: Record<string, unknown> }
    }
    const get = spec.paths["/v1/projects/{projectId}/resources"]?.get as {
      operationId: string
      parameters: Array<{ name: string; schema: Record<string, unknown> }>
      responses: Record<string, { content?: Record<string, { schema: { $ref: string } }> }>
    }
    expect(get.operationId).toBe("listProjectResources")
    expect(get.parameters.find((param) => param.name === "limit")?.schema).toMatchObject({ minimum: 1, maximum: 100, default: 50 })
    expect(get.parameters.find((param) => param.name === "cursor")?.schema).toMatchObject({ maxLength: 4096 })
    expect(get.responses["200"]?.content?.["application/json"]?.schema.$ref).toBe("#/components/schemas/ProjectResourceListResponse")
    const page = spec.components.schemas.ProjectResourceListResponse as { properties: { data: { properties: { items: { maxItems: number; items: { properties: Record<string, unknown> } } } } } }
    expect(page.properties.data.properties.items.maxItems).toBe(100)
    expect(page.properties.data.properties.items.items.properties.scan_state).toMatchObject({ enum: ["clean"] })
    expect(page.properties.data.properties.items.items.properties).not.toHaveProperty("upload_id")
    expect(page.properties.data.properties.items.items.properties).not.toHaveProperty("download_url")
  })

  it("requires exactly one file and one CLEAN asset response", async () => {
    const spec = YAML.parse(await readFile(SNAPSHOT, "utf8")) as {
      paths: Record<string, Record<string, unknown>>
      components: { schemas: Record<string, unknown> }
    }
    const operation = spec.paths["/v1/projects/{projectId}/resources"]?.post as {
      requestBody: { content: Record<string, { schema: { properties: { files: { minItems?: number; maxItems?: number } } } }> }
      responses: Record<string, { content?: Record<string, { schema: { $ref: string } }> }>
    }
    expect(operation.requestBody.content["multipart/form-data"]?.schema.properties.files).toMatchObject({ minItems: 1, maxItems: 1 })
    expect(operation.responses["200"]?.content?.["application/json"]?.schema.$ref).toBe("#/components/schemas/ProjectResourceUploadResponse")
    expect(spec.components.schemas.ProjectResourceUploadResponse).toMatchObject({
      properties: { data: { properties: { resources: { minItems: 1, maxItems: 1 } } } },
    })
  })
})
