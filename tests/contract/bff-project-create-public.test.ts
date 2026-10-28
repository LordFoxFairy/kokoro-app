import { restorePublic26MessagePartsContract } from "./bff-tool-display-parent"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { expect, it } from "vitest"
import YAML from "yaml"

const OWNER_COMMIT = "fb9dc4df1679e2d7c97842efcd2fb3bcae297939"
const OWNER_SHA256 = "86638da86d786e91c81da9e5dd891dee88ef2ca033579866f5ebc6dd6113c00f"
const OWNER_VERSION = "28.12.0"

it("pins BFF project creation to the owner request, idempotency and canonical response", async () => {
  const bytes = await readFile(resolve(process.cwd(), "src/generated/bff-public-openapi.yaml"))
  expect(OWNER_COMMIT).toBe("fb9dc4df1679e2d7c97842efcd2fb3bcae297939")
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(OWNER_SHA256)
  const spec = YAML.parse(bytes.toString()) as {
    info: { version: string }
    paths: Record<string, Record<string, unknown>>
    components: { schemas: Record<string, unknown> }
  }
  expect(spec.info.version).toBe(OWNER_VERSION)
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

it("pins existing public Project list/get permissions, envelopes and absence of pagination", async () => {
  const bytes = await readFile(resolve(process.cwd(), "src/generated/bff-public-openapi.yaml"))
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(OWNER_SHA256)
  const spec = YAML.parse(bytes.toString()) as {
    info: { version: string }
    paths: Record<
      string,
      {
        parameters?: unknown[]
        get?: {
          operationId: string
          parameters?: unknown[]
          "x-kokoro-owner": string
          "x-kokoro-visibility": string
          "x-kokoro-permission": string
          responses: Record<string, { content: { "application/json": { schema: { $ref: string } } } }>
        }
      }
    >
    components: { schemas: Record<string, { required?: string[]; additionalProperties?: boolean; properties?: Record<string, unknown> }> }
  }
  expect(spec.info.version).toBe(OWNER_VERSION)
  const list = spec.paths["/v1/projects"]?.get
  const detail = spec.paths["/v1/projects/{projectId}"]?.get
  expect(list?.operationId).toBe("listProjects")
  expect(detail?.operationId).toBe("getProject")
  for (const operation of [list, detail]) {
    expect(operation).toMatchObject({
      "x-kokoro-owner": "kokoro-bff",
      "x-kokoro-visibility": "public",
      "x-kokoro-permission": "project.read",
      "x-kokoro-stability": "beta",
      "x-kokoro-idempotency": "none",
    })
  }
  expect(list?.parameters ?? []).toEqual([])
  expect(spec.paths["/v1/projects/{projectId}"]?.parameters).toEqual([{ $ref: "#/components/parameters/ProjectId" }])
  expect(list?.responses["200"]?.content["application/json"].schema.$ref).toBe("#/components/schemas/ProjectListResponse")
  expect(detail?.responses["200"]?.content["application/json"].schema.$ref).toBe("#/components/schemas/ProjectResponse")
  expect(spec.components.schemas.Project?.required).toEqual(["id", "name", "slug", "description", "created_at", "updated_at"])
  expect(spec.components.schemas.RequestMeta?.additionalProperties).toBe(false)
  expect(spec.components.schemas.RequestMeta?.properties).not.toHaveProperty("next_cursor")
  expect(spec.components.schemas.ProjectListResponse?.properties).not.toHaveProperty("next_cursor")
  expect(spec.components.schemas.ProjectListResponse?.properties).toHaveProperty("data.properties.projects.items.$ref", "#/components/schemas/Project")
  expect(spec.components.schemas.ProjectListResponse?.properties).not.toHaveProperty("data.properties.next_cursor")
})

it("pins the sole added Project rename operation and its closed command receipt/error/header contract", async () => {
  const bytes = await readFile(resolve(process.cwd(), "src/generated/bff-public-openapi.yaml"))
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(OWNER_SHA256)
  const spec = YAML.parse(restorePublic26MessagePartsContract(bytes.toString())) as {
    paths: Record<string, Record<string, { operationId?: string }>>
    components: { schemas: Record<string, unknown>; responses: Record<string, unknown>; parameters: Record<string, unknown> }
  }
  const operations = Object.values(spec.paths).flatMap((path) =>
    Object.entries(path)
      .filter(([method]) => ["get", "post", "put", "patch", "delete", "options", "head"].includes(method))
      .map(([, operation]) => operation.operationId),
  )
  expect(operations).toHaveLength(186)
  expect(new Set(operations).size).toBe(186)
  expect(operations.filter((operation) => operation === "renameProject")).toHaveLength(1)
  expect(spec.paths["/v1/projects/{projectId}/name"]?.patch).toMatchObject({
    operationId: "renameProject",
    "x-kokoro-owner": "kokoro-bff",
    "x-kokoro-idempotency": "required",
    "x-kokoro-permission": "project.update",
  })
  expect(spec.components.schemas.RenameProjectRequest).toMatchObject({ additionalProperties: false, required: ["name"] })
  expect(spec.components.schemas.RenameProjectResponse).toMatchObject({
    additionalProperties: false,
    required: ["data"],
    properties: { data: { additionalProperties: false, required: ["project_id", "name"] } },
  })
  expect(spec.components.schemas.RenameProjectErrorResponse).toMatchObject({
    additionalProperties: false,
    required: ["error"],
    properties: { error: { additionalProperties: false, required: ["code", "message", "retryable"] } },
  })
  expect(spec.components.responses.RenameProjectSuccess).toMatchObject({
    headers: { "x-request-id": { required: true }, "Cache-Control": { required: true, schema: { const: "no-store" } } },
    content: { "application/json": { schema: { $ref: "#/components/schemas/RenameProjectResponse" } } },
  })
})
