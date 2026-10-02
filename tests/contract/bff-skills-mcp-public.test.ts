import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"
import YAML from "yaml"

const OWNER_COMMIT = "3c08a422f3a6aa3cf204c308716cfa64f6d61bb2"
const OWNER_SHA256 = "5561450bd02e978bace1d4850c262aea645bad8fdf4ec46fd0cfffb6765c8ef6"
const OWNER_VERSION = "4.0.0"
const SNAPSHOT = resolve(process.cwd(), "src/generated/bff-public-openapi.yaml")

type Shape = {
  $ref?: string
  required?: string[]
  additionalProperties?: boolean
  properties?: Record<string, Shape>
  items?: { $ref?: string }
  type?: string | string[]
  const?: string
  pattern?: string
}
type Response = {
  $ref?: string
  headers?: Record<string, { required?: boolean; schema?: { const?: string } }>
  content?: Record<string, { schema?: { $ref?: string } }>
}
type Operation = {
  operationId?: string
  description?: string
  "x-kokoro-empty-body"?: string
  responses?: Record<string, Response>
}
type Spec = {
  info: { version: string }
  paths: Record<string, Record<string, Operation>>
  components: {
    schemas: Record<string, Shape>
    parameters: Record<string, { name?: string; schema?: { enum?: string[] } }>
    responses: Record<string, Response>
  }
}

function operation(spec: Spec, path: string, method: string): Operation {
  const value = spec.paths[path]?.[method]
  if (!value) throw new Error(`missing BFF operation: ${method} ${path}`)
  return value
}

function shape(spec: Spec, name: string): Shape {
  const value = spec.components.schemas[name]
  if (!value) throw new Error(`missing BFF schema: ${name}`)
  return value
}

function field(parent: Shape, name: string): Shape {
  const value = parent.properties?.[name]
  if (!value) throw new Error(`missing schema field: ${name}`)
  return value
}

function exactShape(value: Shape, fields: string[]): void {
  expect(value.required).toEqual(fields)
  expect(Object.keys(value.properties ?? {})).toEqual(fields)
  expect(value.additionalProperties).toBe(false)
}

function resolvedResponse(spec: Spec, value: Response | undefined): Response | undefined {
  const ref = value?.$ref
  if (!ref) return value
  const name = /^#\/components\/responses\/([^/]+)$/u.exec(ref)?.[1]
  return name ? spec.components.responses[name] : undefined
}

function assertGet(spec: Spec, path: string, id: string, successRef: string, errors: Record<string, string>): void {
  const get = operation(spec, path, "get")
  expect(get.operationId).toBe(id)
  expect(Object.keys(get.responses ?? {}).sort()).toEqual(["200", ...Object.keys(errors)].sort())
  for (const status of ["200", ...Object.keys(errors)]) {
    const direct = get.responses?.[status]
    if (status !== "200") expect(direct?.$ref).toBe(`#/components/responses/${errors[status]}`)
    const response = resolvedResponse(spec, direct)
    expect(response?.headers?.["x-request-id"]?.required).toBe(true)
    expect(response?.headers?.["Cache-Control"]?.required).toBe(true)
    expect(response?.headers?.["Cache-Control"]?.schema?.const).toBe("no-store")
  }
  expect(resolvedResponse(spec, get.responses?.["200"])?.content?.["application/json"]?.schema?.$ref).toBe(successRef)
}

function assertProjectionSemantics(spec: Spec): void {
  const readErrors = {
    "400": "PlatformProjectionReadBadRequest", "401": "PlatformProjectionReadUnauthorized",
    "403": "PlatformProjectionReadForbidden", "429": "PlatformProjectionReadRateLimited",
    "502": "PlatformProjectionReadBadGateway", "503": "PlatformProjectionReadUnavailable",
  }
  assertGet(spec, "/v1/skills", "listSkills", "#/components/schemas/SkillListResponse", readErrors)
  assertGet(spec, "/v1/skills/{skill_id}", "getPublishedPersonalSkill", "#/components/schemas/PublishedPersonalSkillResponse", {
    "400": "PublishedPersonalSkillBadRequest", "401": "PublishedPersonalSkillUnauthorized",
    "403": "PublishedPersonalSkillForbidden", "404": "PublishedPersonalSkillNotFound",
    "429": "PublishedPersonalSkillRateLimited", "502": "PublishedPersonalSkillBadGateway",
    "503": "PublishedPersonalSkillUnavailable",
  })
  expect(operation(spec, "/v1/skills/{skill_id}", "get").responses?.["200"]?.$ref).toBe("#/components/responses/PublishedPersonalSkillOk")
  assertGet(spec, "/v1/mcp/servers", "listMcpServers", "#/components/schemas/McpServerListResponse", readErrors)

  expect(spec.components.parameters.CapabilitySkillScope?.name).toBe("scope_kind")
  expect(spec.components.parameters.CapabilitySkillScope?.schema?.enum).toContain("personal")
  expect(spec.components.parameters.CapabilitySkillScope?.schema?.enum).not.toContain("official")
  expect(spec.components.parameters.CapabilitySkillScope?.schema?.enum).not.toContain("third_party")

  const published = shape(spec, "PublishedPersonalSkillResource")
  exactShape(published, ["skill_id", "source_ref", "revision", "status", "name", "summary", "tags"])
  expect(field(published, "status").const).toBe("active")
  expect(field(published, "revision").pattern).toBe("^[1-9][0-9]*$")
  const publishedResponse = shape(spec, "PublishedPersonalSkillResponse")
  exactShape(publishedResponse, ["data"])
  expect(field(publishedResponse, "data").$ref).toBe("#/components/schemas/PublishedPersonalSkillResource")

  const skillList = shape(spec, "SkillListResponse")
  exactShape(skillList, ["data"])
  const skillData = field(skillList, "data")
  expect(skillData.required).toEqual(["skills"])
  expect(skillData.additionalProperties).toBe(false)
  expect(field(skillData, "skills").items?.$ref).toBe("#/components/schemas/Skill")
  expect(field(skillData, "next_cursor").type).toEqual(["string", "null"])
  expect(shape(spec, "Skill").required).toEqual(expect.arrayContaining(["source_ref", "revision"]))

  const mcpList = shape(spec, "McpServerListResponse")
  exactShape(mcpList, ["data"])
  const mcpData = field(mcpList, "data")
  expect(mcpData.required).toEqual(["servers"])
  expect(mcpData.additionalProperties).toBe(false)
  expect(field(mcpData, "servers").items?.$ref).toBe("#/components/schemas/McpServerProjection")
  expect(field(mcpData, "next_cursor").type).toBe("string")
  exactShape(shape(spec, "McpServerProjection"), ["server_id", "provider_key", "server_identity", "transport", "declaration_digest", "status"])
}

describe("pinned BFF Skills and MCP public consumer contract", () => {
  it("pins exact owner bytes and six inactive Skill draft/publish operations", async () => {
    const bytes = await readFile(SNAPSHOT)
    expect(OWNER_COMMIT).toBe("3c08a422f3a6aa3cf204c308716cfa64f6d61bb2")
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(OWNER_SHA256)
    const spec = YAML.parse(bytes.toString()) as Spec
    expect(spec.info.version).toBe(OWNER_VERSION)
    for (const [method, path, id] of [
      ["post", "/v1/skills/drafts", "createSkillDraft"],
      ["get", "/v1/skills/{skill_id}/package-upload", "getSkillPackageUpload"],
      ["post", "/v1/skills/{skill_id}/package-upload", "beginSkillPackageUpload"],
      ["post", "/v1/skills/{skill_id}/package-upload/complete", "completeSkillPackageUpload"],
      ["post", "/v1/skills/{skill_id}/validate", "validateSkillDraft"],
      ["post", "/v1/skills/{skill_id}/publish", "publishSkill"],
    ] as const) {
      expect(operation(spec, path, method).operationId).toBe(id)
      expect(operation(spec, path, method).description?.toLowerCase()).toMatch(/inactive|default-closed/u)
    }
    expect(operation(spec, "/v1/skills/{skill_id}/publish", "post")["x-kokoro-empty-body"]).toBe("required")
  })

  it("pins GET success refs, status-specific errors/headers and nested cursor/item shape", async () => {
    assertProjectionSemantics(YAML.parse(await readFile(SNAPSHOT, "utf8")) as Spec)
  })

  it("rejects actual parsed-spec mutations through the same consumer assertions", async () => {
    const original = YAML.parse(await readFile(SNAPSHOT, "utf8")) as Spec
    const mutations: Array<(candidate: Spec) => void> = [
      (candidate) => { operation(candidate, "/v1/skills/{skill_id}", "get").responses!["200"]!.$ref = "#/components/responses/ServiceUnavailable" },
      (candidate) => { candidate.components.responses.PublishedPersonalSkillOk!.headers!["Cache-Control"]!.schema!.const = "public" },
      (candidate) => { delete operation(candidate, "/v1/skills/{skill_id}", "get").responses!["404"] },
      (candidate) => { operation(candidate, "/v1/skills/{skill_id}", "get").responses!["404"]!.$ref = "#/components/responses/PublishedPersonalSkillForbidden" },
      (candidate) => { field(field(shape(candidate, "SkillListResponse"), "data"), "skills").items!.$ref = "#/components/schemas/SkillRevision" },
      (candidate) => { field(field(shape(candidate, "SkillListResponse"), "data"), "next_cursor").type = "integer" },
      (candidate) => { field(field(shape(candidate, "McpServerListResponse"), "data"), "servers").items!.$ref = "#/components/schemas/McpServer" },
      (candidate) => { field(shape(candidate, "PublishedPersonalSkillResource"), "status").const = "draft" },
      (candidate) => { field(shape(candidate, "PublishedPersonalSkillResponse"), "data").$ref = "#/components/schemas/Skill" },
      (candidate) => { shape(candidate, "McpServerProjection").properties!.secret_ref = { type: "string" } },
      (candidate) => { candidate.components.parameters.CapabilitySkillScope!.schema!.enum!.push("official") },
    ]
    for (const mutate of mutations) {
      const candidate = structuredClone(original)
      mutate(candidate)
      expect(() => assertProjectionSemantics(candidate)).toThrow()
    }
  })
})

it("pins the five Personal installation operations, safe projection and strict error-only headers", async () => {
  const spec = YAML.parse(await readFile(SNAPSHOT, "utf8")) as Spec
  for (const [method, path, id, success, errors] of [
    ["post", "/v1/skill-installations", "installPersonalSkill", "SkillInstallationMutationSuccess", [400, 401, 403, 404, 409, 412, 413, 429, 502, 503, 504]],
    ["get", "/v1/skill-installations", "listPersonalSkillInstallations", "SkillInstallationListSuccess", [400, 401, 403, 413, 429, 502, 503, 504]],
    ["get", "/v1/skill-installations/{installation_id}", "getPersonalSkillInstallation", "SkillInstallationReadSuccess", [400, 401, 403, 404, 413, 429, 502, 503, 504]],
    ["delete", "/v1/skill-installations/{installation_id}", "removePersonalSkillInstallation", "SkillInstallationMutationSuccess", [400, 401, 403, 404, 409, 412, 413, 429, 502, 503, 504]],
    ["put", "/v1/skill-installations/{installation_id}/enabled", "setPersonalSkillInstallationEnabled", "SkillInstallationMutationSuccess", [400, 401, 403, 404, 409, 412, 413, 429, 502, 503, 504]],
  ] as const) {
    const value = operation(spec, path, method)
    expect(value.operationId).toBe(id)
    expect(Object.keys(value.responses ?? {}).sort()).toEqual(["200", ...errors.map(String)].sort())
    expect(value.responses?.["200"]?.$ref).toBe(`#/components/responses/${success}`)
    for (const response of Object.values(value.responses ?? {})) {
      const resolved = resolvedResponse(spec, response)
      expect(resolved?.headers?.["x-request-id"]?.required).toBe(true)
      expect(resolved?.headers?.["Cache-Control"]?.schema?.const).toBe("no-store")
    }
  }
  expect(Object.keys(shape(spec, "SkillInstallation").properties ?? {})).toEqual(["installation_id", "source_ref", "series_id", "revision", "installed", "enabled", "installed_at", "updated_at", "removed_at"])
  expect(shape(spec, "SkillInstallation").required).not.toContain("removed_at")
  expect(shape(spec, "SkillInstallation").additionalProperties).toBe(false)
  const page = shape(spec, "SkillInstallationListEnvelope")
  expect(page.required).toEqual(["data"])
  expect(field(page, "data").type).toBe("array")
  expect(field(page, "meta").required).toEqual(["next_cursor"])
  expect(Object.keys(field(page, "meta").properties ?? {})).toEqual(["next_cursor"])
})
