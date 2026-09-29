import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"
import YAML from "yaml"

const OWNER_COMMIT = "62daba37fc0267830d73590bb5a3499807d46fc6"
const OWNER_SHA256 = "5553b798446c8b764fc33d3ccdba6185c3c308213f712cdcf34e751166e0e923"

type Shape = { required?: string[]; additionalProperties?: boolean; properties?: Record<string, unknown> }
type Operation = { operationId?: string; description?: string; "x-kokoro-empty-body"?: string }
type Spec = {
  paths: Record<string, Record<string, Operation>>
  components: { schemas: Record<string, Shape>; parameters: Record<string, { name?: string; schema?: { enum?: string[] } }> }
}

function exactShape(shape: Shape, fields: string[]): void {
  expect(shape.required).toEqual(fields)
  expect(Object.keys(shape.properties ?? {})).toEqual(fields)
  expect(shape.additionalProperties).toBe(false)
}

function requiredShape(spec: Spec, name: string): Shape {
  const shape = spec.components.schemas[name]
  if (!shape) throw new Error(`missing BFF public schema: ${name}`)
  return shape
}

describe("pinned BFF Skills and MCP public consumer contract", () => {
  it("pins the BFF owner artifact and all six default-closed Skill commands", async () => {
    const bytes = await readFile(resolve(process.cwd(), "src/generated/bff-public-openapi.yaml"))
    expect(OWNER_COMMIT).toHaveLength(40)
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(OWNER_SHA256)
    const spec = YAML.parse(bytes.toString()) as Spec
    for (const [method, path, id] of [
      ["post", "/v1/skills/drafts", "createSkillDraft"],
      ["get", "/v1/skills/{skill_id}/package-upload", "getSkillPackageUpload"],
      ["post", "/v1/skills/{skill_id}/package-upload", "beginSkillPackageUpload"],
      ["post", "/v1/skills/{skill_id}/package-upload/complete", "completeSkillPackageUpload"],
      ["post", "/v1/skills/{skill_id}/validate", "validateSkillDraft"],
      ["post", "/v1/skills/{skill_id}/publish", "publishSkill"],
    ] as const) {
      expect(spec.paths[path]?.[method]?.operationId).toBe(id)
      expect(spec.paths[path]?.[method]?.description?.toLowerCase()).toMatch(/inactive|default-closed/)
    }
    expect(spec.paths["/v1/skills/{skill_id}/publish"]?.post?.["x-kokoro-empty-body"]).toBe("required")
  })

  it("keeps personal ACTIVE read, list scope, and owner-native MCP projection strict", async () => {
    const spec = YAML.parse(await readFile(resolve(process.cwd(), "src/generated/bff-public-openapi.yaml"), "utf8")) as Spec
    expect(spec.paths["/v1/skills/{skill_id}"]?.get?.operationId).toBe("getPublishedPersonalSkill")
    expect(spec.paths["/v1/skills"]?.get?.operationId).toBe("listSkills")
    expect(spec.paths["/v1/mcp/servers"]?.get?.operationId).toBe("listMcpServers")
    expect(spec.components.parameters.CapabilitySkillScope?.name).toBe("scope_kind")
    expect(spec.components.parameters.CapabilitySkillScope?.schema?.enum).toContain("personal")
    expect(spec.components.parameters.CapabilitySkillScope?.schema?.enum).not.toContain("official")
    expect(spec.components.parameters.CapabilitySkillScope?.schema?.enum).not.toContain("third_party")
    exactShape(requiredShape(spec, "PublishedPersonalSkillResource"), ["skill_id", "source_ref", "revision", "status", "name", "summary", "tags"])
    exactShape(requiredShape(spec, "McpServerProjection"), ["server_id", "provider_key", "server_identity", "transport", "declaration_digest", "status"])
    expect(spec.components.schemas.Skill?.required).toContain("source_ref")
    expect(spec.components.schemas.Skill?.required).toContain("revision")
    exactShape(requiredShape(spec, "SkillListResponse"), ["data"])
    exactShape(requiredShape(spec, "McpServerListResponse"), ["data"])
  })

  it("rejects former scope and fabricated MCP/Skill response fields as direct negative cases", async () => {
    const spec = YAML.parse(await readFile(resolve(process.cwd(), "src/generated/bff-public-openapi.yaml"), "utf8")) as Spec
    const published = structuredClone(requiredShape(spec, "PublishedPersonalSkillResource"))
    published.properties = { ...published.properties, asset_ref: { type: "string" } }
    expect(() => exactShape(published, ["skill_id", "source_ref", "revision", "status", "name", "summary", "tags"])).toThrow()
    const mcp = structuredClone(requiredShape(spec, "McpServerProjection"))
    mcp.properties = { ...mcp.properties, url: { type: "string" }, secret_ref: { type: "string" } }
    expect(() => exactShape(mcp, ["server_id", "provider_key", "server_identity", "transport", "declaration_digest", "status"])).toThrow()
    const list = structuredClone(requiredShape(spec, "SkillListResponse"))
    list.properties = { ...list.properties, meta: { type: "object" } }
    expect(() => exactShape(list, ["data"])).toThrow()
    published.required = (published.required ?? []).filter((name) => name !== "source_ref")
    expect(() => exactShape(published, ["skill_id", "source_ref", "revision", "status", "name", "summary", "tags"])).toThrow()
    expect(spec.components.parameters.CapabilitySkillScope?.schema?.enum).not.toContain("official")
    expect(spec.components.parameters.CapabilitySkillScope?.schema?.enum).not.toContain("third_party")
  })
})
