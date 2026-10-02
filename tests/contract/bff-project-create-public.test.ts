import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { expect, it } from "vitest"
import YAML from "yaml"

const OWNER_COMMIT = "3c08a422f3a6aa3cf204c308716cfa64f6d61bb2"
const OWNER_SHA256 = "5561450bd02e978bace1d4850c262aea645bad8fdf4ec46fd0cfffb6765c8ef6"
const OWNER_VERSION = "4.0.0"

it("pins BFF project creation to the owner request, idempotency and canonical response", async () => {
  const bytes = await readFile(resolve(process.cwd(), "src/generated/bff-public-openapi.yaml"))
  expect(OWNER_COMMIT).toBe("3c08a422f3a6aa3cf204c308716cfa64f6d61bb2")
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
    paths: Record<string, { parameters?: unknown[]; get?: { operationId: string; parameters?: unknown[]; "x-kokoro-owner": string; "x-kokoro-visibility": string; "x-kokoro-permission": string; responses: Record<string, { content: { "application/json": { schema: { $ref: string } } } }> } }>
    components: { schemas: Record<string, { required?: string[]; additionalProperties?: boolean; properties?: Record<string, unknown> }> }
  }
  expect(spec.info.version).toBe(OWNER_VERSION)
  const list = spec.paths["/v1/projects"]?.get
  const detail = spec.paths["/v1/projects/{projectId}"]?.get
  expect(list?.operationId).toBe("listProjects")
  expect(detail?.operationId).toBe("getProject")
  for (const operation of [list, detail]) {
    expect(operation).toMatchObject({ "x-kokoro-owner": "kokoro-bff", "x-kokoro-visibility": "public", "x-kokoro-permission": "project.read", "x-kokoro-stability": "beta", "x-kokoro-idempotency": "none" })
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
