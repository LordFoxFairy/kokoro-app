import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { createHash } from "node:crypto"
import { readFile, mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"
import YAML from "yaml"
import {
  createSkillDraftRequestSchema,
  skillDraftSchema,
  beginSkillUploadRequestSchema,
  beginSkillUploadSchema,
  completeSkillUploadRequestSchema,
  completeSkillUploadSchema,
  validateSkillDraftRequestSchema,
  validateSkillDraftSchema,
  skillPublishRequestSchema,
  publishSkillDraftSchema,
  skillUploadStateSchema,
  managedPersonalSkillSchema,
  personalInstallationSchema,
  installationErrorAllowed,
  type InstallationOperation,
} from "@/hub/schemas"

const OWNER_COMMIT = "615b16a7f75917d30d334b66d5470d87339aacd1"
const OWNER_SHA256 = "a9729722383de5571821961357051499612d12c76aa835b8774828adea82a577"
const OWNER_VERSION = "14.8.0"
const SNAPSHOT = resolve(process.cwd(), "src/generated/bff-public-openapi.yaml")

type Shape = {
  $ref?: string
  required?: string[]
  additionalProperties?: boolean
  properties?: Record<string, Shape>
  items?: { $ref?: string }
  type?: string | string[]
  const?: string | boolean
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
  "x-kokoro-idempotency"?: string
  parameters?: Array<{ name?: string; in?: string; required?: boolean }>
  requestBody?: { content?: { "application/json"?: { schema?: { $ref?: string } } } }
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
  const validated = shape(spec, "SkillValidateResource")
  exactShape(validated, ["skill_id", "series_id", "valid", "content_digest", "manifest_identity", "replayed", "state_version"])
  expect(field(validated, "valid").const).toBe(true)
  expect(field(validated, "content_digest").pattern).toBe("^[a-f0-9]{64}$")
  expect(field(validated, "manifest_identity").pattern).toBe("^(?:skill-md-v1|zip-v2):sha256:[a-f0-9]{64}$")
  const readErrors = {
    "400": "PlatformProjectionReadBadRequest",
    "401": "PlatformProjectionReadUnauthorized",
    "403": "PlatformProjectionReadForbidden",
    "429": "PlatformProjectionReadRateLimited",
    "502": "PlatformProjectionReadBadGateway",
    "503": "PlatformProjectionReadUnavailable",
  }
  assertGet(spec, "/v1/self/skills", "listManagedPersonalSkills", "#/components/schemas/ManagedPersonalSkillListResponse", {
    "400": "ManagedPersonalSkillBadRequest",
    "401": "ManagedPersonalSkillUnauthorized",
    "403": "ManagedPersonalSkillForbidden",
    "429": "ManagedPersonalSkillRateLimited",
    "502": "ManagedPersonalSkillBadGateway",
    "503": "ManagedPersonalSkillUnavailable",
  })
  assertGet(spec, "/v1/self/skills/{skill_id}", "getManagedPersonalSkill", "#/components/schemas/ManagedPersonalSkillDetailResponse", {
    "400": "ManagedPersonalSkillBadRequest",
    "401": "ManagedPersonalSkillUnauthorized",
    "403": "ManagedPersonalSkillForbidden",
    "404": "ManagedPersonalSkillNotFound",
    "429": "ManagedPersonalSkillRateLimited",
    "502": "ManagedPersonalSkillBadGateway",
    "503": "ManagedPersonalSkillUnavailable",
  })
  expect(operation(spec, "/v1/self/skills/{skill_id}", "get").responses?.["200"]?.$ref).toBe("#/components/responses/ManagedPersonalSkillDetailOk")
  assertGet(spec, "/v1/mcp/servers", "listMcpServers", "#/components/schemas/McpServerListResponse", readErrors)
  assertGet(spec, "/v1/mcp/connections", "listSelfMcpConnections", "#/components/schemas/McpConnectionListResponse", {
    "400": "McpConnectionReadBadRequest",
    "401": "McpConnectionReadUnauthorized",
    "403": "McpConnectionReadForbidden",
    "429": "McpConnectionReadRateLimited",
    "502": "McpConnectionReadBadGateway",
    "503": "McpConnectionReadUnavailable",
  })

  const published = shape(spec, "ManagedPersonalSkillResource")
  expect(published.required).toEqual([
    "skill_id",
    "source_ref",
    "series_id",
    "revision",
    "name",
    "summary",
    "tags",
    "status",
    "skill_updated_at",
    "example_prompts",
    "category_keys",
    "product",
  ])
  expect(published.additionalProperties).toBe(false)
  expect((field(published, "status") as Shape & { enum: string[] }).enum).toEqual(["draft", "active", "disabled", "withdrawn", "quarantined"])
  expect(field(published, "revision").pattern).toBe("^[1-9][0-9]*$")
  const publishedResponse = shape(spec, "ManagedPersonalSkillDetailResponse")
  exactShape(publishedResponse, ["data", "meta"])
  expect(field(publishedResponse, "data").$ref).toBe("#/components/schemas/ManagedPersonalSkillResource")

  const skillList = shape(spec, "ManagedPersonalSkillListResponse")
  exactShape(skillList, ["data", "meta"])
  const skillData = field(skillList, "data")
  expect(skillData.required).toEqual(["skills", "next_cursor"])
  expect(skillData.additionalProperties).toBe(false)
  expect(field(skillData, "skills").items?.$ref).toBe("#/components/schemas/ManagedPersonalSkillResource")
  expect(field(skillData, "next_cursor").type).toEqual(["string", "null"])
  expect(shape(spec, "ManagedPersonalSkillResource").required).toEqual(expect.arrayContaining(["source_ref", "revision"]))

  const mcpList = shape(spec, "McpServerListResponse")
  exactShape(mcpList, ["data"])
  const mcpData = field(mcpList, "data")
  expect(mcpData.required).toEqual(["servers"])
  expect(mcpData.additionalProperties).toBe(false)
  expect(field(mcpData, "servers").items?.$ref).toBe("#/components/schemas/McpServerProjection")
  expect(field(mcpData, "next_cursor").type).toBe("string")
  exactShape(shape(spec, "McpServerProjection"), ["server_id", "provider_key", "server_identity", "transport", "declaration_digest", "status"])
  const connections = shape(spec, "McpConnectionListResponse")
  exactShape(connections, ["data"])
  expect(field(field(connections, "data"), "connections").items?.$ref).toBe("#/components/schemas/McpConnectionProjection")
  exactShape(shape(spec, "McpConnectionProjection"), ["connection_id", "connector_id", "server_id", "provider_key", "transport", "status"])
}

describe("pinned BFF Skills and MCP public consumer contract", () => {
  it("pins exact owner bytes and six current Skill draft/publish operations", async () => {
    const bytes = await readFile(SNAPSHOT)
    expect(OWNER_COMMIT).toBe("615b16a7f75917d30d334b66d5470d87339aacd1")
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
    }
    expect(operation(spec, "/v1/skills/{skill_id}/publish", "post")["x-kokoro-empty-body"]).toBeUndefined()
    for (const name of ["BeginSkillPackageUploadRequest", "CompleteSkillPackageUploadRequest", "ValidateSkillDraftRequest"])
      expect(shape(spec, name).required).toContain("expected_state_version")
  })

  it("pins GET success refs, status-specific errors/headers and nested cursor/item shape", async () => {
    assertProjectionSemantics(YAML.parse(await readFile(SNAPSHOT, "utf8")) as Spec)
  })

  it("rejects actual parsed-spec mutations through the same consumer assertions", async () => {
    const original = YAML.parse(await readFile(SNAPSHOT, "utf8")) as Spec
    const mutations: Array<(candidate: Spec) => void> = [
      (candidate) => {
        field(shape(candidate, "SkillValidateResource"), "manifest_identity").pattern = "^zip-v1:sha256:[a-f0-9]{64}$"
      },
      (candidate) => {
        operation(candidate, "/v1/self/skills/{skill_id}", "get").responses!["200"]!.$ref = "#/components/responses/ServiceUnavailable"
      },
      (candidate) => {
        candidate.components.responses.ManagedPersonalSkillDetailOk!.headers!["Cache-Control"]!.schema!.const = "public"
      },
      (candidate) => {
        delete operation(candidate, "/v1/self/skills/{skill_id}", "get").responses!["404"]
      },
      (candidate) => {
        operation(candidate, "/v1/self/skills/{skill_id}", "get").responses!["404"]!.$ref = "#/components/responses/ManagedPersonalSkillForbidden"
      },
      (candidate) => {
        field(field(shape(candidate, "ManagedPersonalSkillListResponse"), "data"), "skills").items!.$ref = "#/components/schemas/SkillRevision"
      },
      (candidate) => {
        field(field(shape(candidate, "ManagedPersonalSkillListResponse"), "data"), "next_cursor").type = "integer"
      },
      (candidate) => {
        field(field(shape(candidate, "McpServerListResponse"), "data"), "servers").items!.$ref = "#/components/schemas/McpServer"
      },
      (candidate) => {
        ;(field(shape(candidate, "ManagedPersonalSkillResource"), "status") as Shape & { enum: string[] }).enum = ["draft"]
      },
      (candidate) => {
        field(shape(candidate, "ManagedPersonalSkillDetailResponse"), "data").$ref = "#/components/schemas/Skill"
      },
      (candidate) => {
        shape(candidate, "McpServerProjection").properties!.secret_ref = { type: "string" }
      },
      (candidate) => {
        shape(candidate, "ManagedPersonalSkillResource").properties!.secret_ref = { type: "string" }
        shape(candidate, "ManagedPersonalSkillResource").additionalProperties = true
      },
    ]
    for (const mutate of mutations) {
      const candidate = structuredClone(original)
      mutate(candidate)
      expect(() => assertProjectionSemantics(candidate)).toThrow()
    }
  })
})

it("pins the six Personal installation operations, safe projection and strict error-only headers", async () => {
  const spec = YAML.parse(await readFile(SNAPSHOT, "utf8")) as Spec
  for (const [method, path, id, success, errors] of [
    ["post", "/v1/skill-installations/{installation_id}/update", "updatePersonalSkillInstallation", "SkillInstallationUpdateSuccess", [400, 401, 403, 404, 409, 412, 413, 429, 502, 503, 504]],
    ["post", "/v1/skill-installations", "installPersonalSkill", "SkillInstallationMutationSuccess", [400, 401, 403, 404, 409, 412, 413, 429, 502, 503, 504]],
    ["get", "/v1/skill-installations", "listPersonalSkillInstallations", "SkillInstallationListSuccess", [400, 401, 403, 413, 429, 502, 503, 504]],
    [
      "get",
      "/v1/skill-installations/{installation_id}",
      "getPersonalSkillInstallation",
      "SkillInstallationReadSuccess",
      [400, 401, 403, 404, 413, 429, 502, 503, 504],
    ],
    [
      "delete",
      "/v1/skill-installations/{installation_id}",
      "removePersonalSkillInstallation",
      "SkillInstallationMutationSuccess",
      [400, 401, 403, 404, 409, 412, 413, 429, 502, 503, 504],
    ],
    [
      "put",
      "/v1/skill-installations/{installation_id}/enabled",
      "setPersonalSkillInstallationEnabled",
      "SkillInstallationMutationSuccess",
      [400, 401, 403, 404, 409, 412, 413, 429, 502, 503, 504],
    ],
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
  expect(Object.keys(shape(spec, "SkillInstallation").properties ?? {})).toEqual([
    "example_prompts",
    "installation_id",
    "source_ref",
    "series_id",
    "revision",
    "installed",
    "enabled",
    "installed_at",
    "updated_at",
    "skill_updated_at",
    "removed_at",
    "display_name",
    "summary",
    "source_status",
    "category_keys",
    "product",
    "publisher_profile",
    "available_update",
    "tags",
  ])
  expect(shape(spec, "SkillInstallation").required).not.toContain("removed_at")
  expect(shape(spec, "SkillInstallation").additionalProperties).toBe(false)
  const page = shape(spec, "SkillInstallationListEnvelope")
  expect(page.required).toEqual(["data"])
  expect(field(page, "data").type).toBe("array")
  expect(field(page, "meta").required).toEqual(["next_cursor"])
  expect(Object.keys(field(page, "meta").properties ?? {})).toEqual(["next_cursor"])
})

it("compares every live publish/managed/installation component field matrix to the final owner snapshot", async () => {
  const spec = YAML.parse(await readFile(SNAPSHOT, "utf8")) as Spec
  const matrices = [
    ["CreateSkillDraftRequest", createSkillDraftRequestSchema.shape],
    ["SkillDraftResource", skillDraftSchema.shape],
    ["BeginSkillPackageUploadRequest", beginSkillUploadRequestSchema.shape],
    ["SkillPackageBeginResource", beginSkillUploadSchema.shape],
    ["CompleteSkillPackageUploadRequest", completeSkillUploadRequestSchema.shape],
    ["SkillPackageCompleteResource", completeSkillUploadSchema.shape],
    ["ValidateSkillDraftRequest", validateSkillDraftRequestSchema.shape],
    ["SkillValidateResource", validateSkillDraftSchema.shape],
    ["SkillAudienceRequest", skillPublishRequestSchema.shape],
    ["SkillPublishResource", publishSkillDraftSchema.shape],
    ["ManagedPersonalSkillResource", managedPersonalSkillSchema.shape],
    ["SkillInstallation", personalInstallationSchema.innerType().innerType().shape],
  ] as const
  for (const [name, fields] of matrices) {
    const machine = shape(spec, name)
    expect(Object.keys(fields).sort(), name).toEqual(Object.keys(machine.properties ?? {}).sort())
    expect(
      Object.entries(fields)
        .filter(([, schema]) => !schema.isOptional())
        .map(([field]) => field)
        .sort(),
      name,
    ).toEqual([...(machine.required ?? [])].sort())
    expect(machine.additionalProperties, name).toBe(false)
  }
  const upload = shape(spec, "SkillPackageUploadState") as Shape & { oneOf: Array<Shape & { properties?: Record<string, Shape | false> }> }
  expect(upload.oneOf).toHaveLength(4)
  for (const consumer of skillUploadStateSchema.options) {
    const phase = consumer.shape.phase.value
    const machine = upload.oneOf.find((branch) => {
      const discriminator = branch.properties?.phase as Shape & { enum?: string[] }
      return discriminator?.const === phase || discriminator?.enum?.includes(phase)
    })
    expect(machine, phase).toBeDefined()
    expect(Object.keys(consumer.shape).sort(), phase).toEqual(
      Object.keys(upload.properties ?? {})
        .filter((field) => machine!.properties?.[field] !== false)
        .sort(),
    )
    expect(
      Object.entries(consumer.shape)
        .filter(([, schema]) => !schema.isOptional())
        .map(([field]) => field)
        .sort(),
      phase,
    ).toEqual([...new Set([...(upload.required ?? []), ...(machine!.required ?? [])])].sort())
  }
})

it("compares all five installation operation/status error families, including mutation-only skill authorization", async () => {
  const spec = YAML.parse(await readFile(SNAPSHOT, "utf8")) as Spec
  for (const [method, path, consumer] of [
    ["post", "/v1/skill-installations/{installation_id}/update", "update"],
    ["post", "/v1/skill-installations", "install"],
    ["get", "/v1/skill-installations", "list"],
    ["get", "/v1/skill-installations/{installation_id}", "get"],
    ["delete", "/v1/skill-installations/{installation_id}", "remove"],
    ["put", "/v1/skill-installations/{installation_id}/enabled", "setEnabled"],
  ] as const) {
    const responses = operation(spec, path, method).responses!
    for (const [status, reference] of Object.entries(responses)) {
      if (status === "200") continue
      const response = resolvedResponse(spec, reference) as Response & {
        content: { "application/json": { schema: { allOf: Array<{ properties?: { error?: { properties?: { code?: { enum?: string[] } } } } }> } } }
      }
      const codes = response.content["application/json"].schema.allOf[1]?.properties?.error?.properties?.code?.enum
      expect(codes, `${consumer}:${status}`).toBeDefined()
      for (const code of codes!)
        expect(installationErrorAllowed(consumer as InstallationOperation, Number(status), code), `${consumer}:${status}:${code}`).toBe(true)
      expect(installationErrorAllowed(consumer, Number(status), "unpublished_error"), `${consumer}:${status}`).toBe(false)
    }
    expect(installationErrorAllowed(consumer, 403, "skill_forbidden")).toBe(!["list", "get"].includes(consumer))
  }
})

it("pins the current public revision's shared-skill operation without replacing Resolve", async () => {
  const bytes = await readFile(SNAPSHOT)
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(OWNER_SHA256)
  const spec = YAML.parse(bytes.toString())
  expect(spec.info.version).toBe(OWNER_VERSION)
  expect(spec.paths["/v1/skill-shares/{share_id}/skill"].get.operationId).toBe("getSharedSkillRevision")
  expect(spec.components.schemas.SkillShareResponse.properties.data.required).toEqual([
    "share_id",
    "source_ref",
    "url",
    "created_at",
    "expires_at",
    "revoked_at",
  ])
})


it("pins and derives the separate browser-private connector error profile without replacing public OpenAPI", async () => {
  const { BFF_CONNECTOR_COMMAND_ERROR_PROVENANCE: provenance, BFF_CONNECTOR_COMMAND_ERROR_POLICY: policy } = await import("@/generated/bff-connector-command-errors")
  const bytes = await readFile(resolve(process.cwd(), "src/generated/bff-connector-command-errors.json"))
  expect(provenance).toEqual({ ownerCommit: "d176e3d0cbbc2eab903dae2b2d969906ba5808fe", sourceSha256: "24158f50a6f4dac1b34553797f0b1afcc8f99dbc79f36b916d03b56999a67a71", profileVersion: "1.0.0" })
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(provenance.sourceSha256)
  expect(policy).toEqual(JSON.parse(bytes.toString("utf8")))
  expect(policy.visibility).toBe("browser-private")
  expect(policy.automatic_retries).toBe(false)
  expect(policy.new_command_authorized).toBe(false)
  const generator = await import(/* @vite-ignore */ pathToFileURL(resolve(process.cwd(), "scripts/generate-bff-connector-command-errors.mjs")).href) as { renderConnectorCommandErrors(bytes: Buffer): string }
  expect(await readFile(resolve(process.cwd(), "src/generated/bff-connector-command-errors.ts"), "utf8")).toBe(generator.renderConnectorCommandErrors(bytes))
  expect(() => generator.renderConnectorCommandErrors(Buffer.concat([bytes, Buffer.from("\n")]))).toThrow("digest drift")
})

it("executes private connector profile drift checks in an isolated fixture and cleans it up", async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), "kokoro-connector-profile-"))
  const names = ["scripts/generate-bff-connector-command-errors.mjs", "src/generated/bff-connector-command-errors.json", "src/generated/bff-connector-command-errors.ts"]
  try {
    await mkdir(resolve(fixture, "scripts"), { recursive: true })
    await mkdir(resolve(fixture, "src/generated"), { recursive: true })
    for (const name of names) await copyFile(resolve(process.cwd(), name), resolve(fixture, name))
    const check = () => execFileSync(process.execPath, [resolve(fixture, names[0]!), "--check"], { cwd: fixture, stdio: "pipe" })
    expect(() => check()).not.toThrow()
    const snapshot = await readFile(resolve(fixture, names[1]!))
    await writeFile(resolve(fixture, names[1]!), Buffer.concat([snapshot, Buffer.from("\n")]))
    expect(() => check()).toThrow()
    await writeFile(resolve(fixture, names[1]!), snapshot)
    await writeFile(resolve(fixture, names[2]!), "export const stale = true;\n")
    expect(() => check()).toThrow()
  } finally { await rm(fixture, { recursive: true, force: true }) }
})
