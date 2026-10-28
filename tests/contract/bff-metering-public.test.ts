import { restorePublic26MessagePartsContract } from "./bff-tool-display-parent"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { expect, it } from "vitest"
import YAML from "yaml"
import { restoreMcpSelectionContract, restoreMeteringParent, restorePublic24SkillDetailContract, restorePublic25PersonalSseContract } from "./bff-metering-parent"

it("restores metadata-only Public25 through the complete immutable Public24 parent", async () => {
  const source = restorePublic25PersonalSseContract(await readFile("src/generated/bff-public-openapi.yaml", "utf8"))
  const parent = restorePublic24SkillDetailContract(source)
  expect(createHash("sha256").update(parent).digest("hex")).toBe("f4caf11f3cd9255d2cd9daf69b74ff9988505d640e31c686ce495e6d8a578b2c")
  expect(restorePublic24SkillDetailContract(parent)).toBe(parent)
  expect(createHash("sha256").update(restoreMcpSelectionContract(source)).digest("hex")).toBe("703dba47da8a5c659b4236bb0a72317588ad29a4ca444ff9e5c99cfbcd00634b")
})

it("rejects metadata-only Public25 reference, schema and unrelated byte drift before historical restoration", async () => {
  const source = restorePublic25PersonalSseContract(await readFile("src/generated/bff-public-openapi.yaml", "utf8"))
  const metadataSchema = "    SpecificationDetailResponse:\n      type: object\n      additionalProperties: false\n      required: [skill]\n      properties:\n        skill: { $ref: \"#/components/schemas/SpecificationSkill\" }\n"
  for (const changed of [
    source.replace('$ref: "#/components/schemas/SpecificationDetailResponse"', '$ref: "#/components/schemas/SpecificationDownloadInfo"'),
    source.replace(metadataSchema, metadataSchema.replace("required: [skill]", "required: [skill, downloadInfo]")),
    source.replace("listTeamMembers", "changedUnrelatedOperation"),
    source + "\n",
  ]) {
    expect(changed).not.toBe(source)
    expect(() => restorePublic24SkillDetailContract(changed)).toThrow()
    expect(() => restoreMcpSelectionContract(changed)).toThrow()
  }
})

it("pins three formal pricing operations while preserving every preceding byte and operation", async () => {
  const raw = await readFile("src/generated/bff-public-openapi.yaml"),
    parentRaw = restoreMeteringParent(raw),
    current = YAML.parse(raw.toString()),
    spec = YAML.parse(restorePublic26MessagePartsContract(raw.toString())),
    parent = YAML.parse(parentRaw.toString())
  expect(createHash("sha256").update(raw).digest("hex")).toBe("4d93ec15e2931768afafffb2101039b1da64757ea48c760d16ef88aa8753db16")
  expect(createHash("sha256").update(parentRaw).digest("hex")).toBe("f6b8f3bd250c144a2d648af94c9fd5fe068db33991a4289b849a077eef009f32")
  expect(current.info.version).toBe("28.11.0")
  expect(spec.info.version).toBe("26.0.0")
  expect(parent.info.version).toBe("22.4.0")
  const inventory = (doc: typeof spec) =>
    Object.entries(doc.paths).flatMap(([path, value]) =>
      Object.entries(value as Record<string, { operationId?: string }>)
        .filter(([, op]) => op.operationId)
        .map(([method, op]) => `${method.toUpperCase()} ${path} ${op.operationId}`),
    )
  expect(inventory(spec)).toHaveLength(186)
  expect(inventory(parent)).toHaveLength(183)
  const added: string[] = []
  for (const [method, name, operationId] of [
    ["get", "pricing", "getAdminMeteringPricing"],
    ["post", "rate-revisions", "publishAdminMeteringRate"],
    ["post", "policy-revisions", "publishAdminMeteringPolicy"],
  ] as const) {
    const path = "/v1/admin/billing/metering/" + name,
      op = spec.paths[path][method]
    added.push(`${method.toUpperCase()} ${path} ${operationId}`)
    expect(Object.keys(spec.paths[path])).toEqual([method])
    expect(op.operationId).toBe(operationId)
    expect(op["x-kokoro-permission"]).toBe("admin.billing.metering.manage")
    expect(op["x-kokoro-idempotency"]).toBe(method === "get" ? "none" : "required")
    expect(parent.paths[path]).toBeUndefined()
  }
  expect(inventory(spec).filter((item: string) => !added.includes(item))).toEqual(inventory(parent))
  expect(spec.components.schemas.MeteringPolicyConfiguration.properties.max_attempt_credits.type).toBe("string")
  expect(spec.components.schemas.AdminMeteringPolicyPublishRequest.additionalProperties).toBe(false)
  for (const changed of [
    Buffer.concat([raw, Buffer.from("\n")]),
    Buffer.from(raw.toString().replace("getAdminMeteringPricing", "arbitraryBillingProxy")),
    Buffer.from(raw.toString().replace("createAdminCreditGrant", "UnrelatedMutation")),
  ]) {
    expect(changed.equals(raw)).toBe(false)
    expect(() => restoreMeteringParent(changed)).toThrow()
  }
})

it("requires exact System model revision identity in published and read-back rates rather than a display name", async () => {
  const raw = await readFile("src/generated/bff-public-openapi.yaml"),
    spec = YAML.parse(raw.toString())
  const rate = spec.components.schemas.MeteringRate
  expect(rate.required).toContain("model_revision")
  expect(rate.properties.model_revision).toEqual({
    type: "object",
    additionalProperties: false,
    required: ["id", "content_digest"],
    properties: {
      id: {
        type: "string",
        format: "uuid",
        pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$(?![\\s\\S])",
      },
      content_digest: { type: "string", pattern: "^[0-9a-f]{64}$(?![\\s\\S])" },
    },
  })
  for (const changed of [raw.toString().replace("        - model_revision\n", ""), raw.toString().replace("        - content_digest\n", "")]) {
    expect(changed).not.toBe(raw.toString())
    expect(() => restoreMeteringParent(Buffer.from(changed))).toThrow()
  }
})

it("restores only complete fixed Public26 SSE delta and rejects unknown unrelated changes", async () => {
 const source = await readFile("src/generated/bff-public-openapi.yaml", "utf8");
 const parent = restorePublic25PersonalSseContract(source);
 expect(createHash("sha256").update(parent).digest("hex")).toBe("7261ac9ce2140555ba97ebff2bf0359533cc49dda014b08dcd6a6054a8d38b1c");
 for (const changed of [source + "\n", source.replace("enum: [streamable_http, sse_compat]", "enum: [streamable_http, sse_compat, stdio]"), source.replace("listTeamMembers", "unknownOperation")]) {
  expect(changed).not.toBe(source); expect(() => restorePublic25PersonalSseContract(changed)).toThrow();
 }
});
