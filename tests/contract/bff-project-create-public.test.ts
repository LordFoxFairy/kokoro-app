import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { expect, it } from "vitest"
import YAML from "yaml"

it("pins BFF project creation to the owner request, idempotency and canonical response", async () => {
  const bytes = await readFile(resolve(process.cwd(), "src/generated/bff-public-openapi.yaml"))
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("f49023882315a4f46e46e95595a02eaa7bb85475d5f46d2b945bc0555edb0c90")
  const spec = YAML.parse(bytes.toString()) as {
    paths: Record<string, Record<string, unknown>>
    components: { schemas: Record<string, unknown> }
  }
  const create = spec.paths["/v1/projects"]?.post as {
    operationId: string
    "x-kokoro-owner": string
    "x-kokoro-idempotency": string
    parameters: Array<{ $ref: string }>
    requestBody: { content: { "application/json": { schema: { $ref: string } } } }
    responses: Record<string, { content?: { "application/json": { schema: { $ref: string } } } }>
  }
  expect(create.operationId).toBe("createProject")
  expect(create["x-kokoro-owner"]).toBe("kokoro-bff")
  expect(create["x-kokoro-idempotency"]).toBe("required")
  expect(create.parameters).toContainEqual({ $ref: "#/components/parameters/IdempotencyKey" })
  expect(create.requestBody.content["application/json"].schema.$ref).toBe("#/components/schemas/CreateProjectRequest")
  expect(create.responses["200"]?.content?.["application/json"].schema.$ref).toBe("#/components/schemas/ProjectResponse")
  expect(spec.components.schemas.CreateProjectRequest).toMatchObject({ required: ["name"] })
  expect(spec.components.schemas.Project).toMatchObject({ required: expect.arrayContaining(["id", "slug", "name"]) })
})
