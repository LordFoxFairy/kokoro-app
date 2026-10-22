import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { expect, it } from "vitest"
import YAML from "yaml"
import { restoreMeteringParent } from "./bff-metering-parent"
it("pins three formal pricing operations while preserving every preceding byte and operation", async () => {
  const raw = await readFile("src/generated/bff-public-openapi.yaml"),
    parentRaw = restoreMeteringParent(raw),
    spec = YAML.parse(raw.toString()),
    parent = YAML.parse(parentRaw.toString())
  expect(createHash("sha256").update(raw).digest("hex")).toBe("34ea71e0aa56256ca00fc5b3c40abd4d142bea82e664a6871190b8547ec2b9e6")
  expect(createHash("sha256").update(parentRaw).digest("hex")).toBe("f6b8f3bd250c144a2d648af94c9fd5fe068db33991a4289b849a077eef009f32")
  expect(spec.info.version).toBe("23.0.0")
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
