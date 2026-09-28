import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"
import YAML from "yaml"

const BFF_OWNER_COMMIT = "199a1833d5a6c17839ff39b81380cf5a8377cf85"
const BFF_PUBLIC_OPENAPI_SHA256 = "8d250e61080f40a0c980b9d5c055bda605b66adcfb11450f1575375cca435f82"
const SNAPSHOT = resolve(process.cwd(), "src/generated/bff-public-openapi.yaml")

describe("pinned BFF project resource contract", () => {
  it("pins the exact BFF owner public OpenAPI blob", async () => {
    const bytes = await readFile(SNAPSHOT)
    expect(BFF_OWNER_COMMIT).toHaveLength(40)
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(BFF_PUBLIC_OPENAPI_SHA256)
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
