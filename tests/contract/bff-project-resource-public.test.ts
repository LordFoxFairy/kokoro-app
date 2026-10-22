import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"
import YAML from "yaml"

const BFF_OWNER_COMMIT = "e461d5178c6bf92558d7cd7dd288cb29cb008525"
const BFF_PUBLIC_OPENAPI_SHA256 = "727159cea88e9f70ca3d1127306e8a6a6bcaa568398de8b0d8fec1cce6b3fae3"
const BFF_PUBLIC_OPENAPI_VERSION = "22.3.0"
const SNAPSHOT = resolve(process.cwd(), "src/generated/bff-public-openapi.yaml")

describe("pinned BFF project resource contract", () => {
  it("pins the exact BFF owner public OpenAPI blob", async () => {
    const bytes = await readFile(SNAPSHOT)
    const spec = YAML.parse(bytes.toString("utf8")) as { info?: { version?: string } }
    expect(BFF_OWNER_COMMIT).toBe("e461d5178c6bf92558d7cd7dd288cb29cb008525")
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(BFF_PUBLIC_OPENAPI_SHA256)
    expect(spec.info?.version).toBe(BFF_PUBLIC_OPENAPI_VERSION)
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
    const page = spec.components.schemas.ProjectResourceListResponse as {
      properties: { data: { properties: { items: { maxItems: number; items: { properties: Record<string, unknown> } } } } }
    }
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
