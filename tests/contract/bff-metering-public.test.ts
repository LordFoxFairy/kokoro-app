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
  expect(createHash("sha256").update(raw).digest("hex")).toBe("c77e4921ccce98cfd91d77fc6897cf327599f237ed13438117323b6a3f8555eb")
  expect(createHash("sha256").update(parentRaw).digest("hex")).toBe("f6b8f3bd250c144a2d648af94c9fd5fe068db33991a4289b849a077eef009f32")
  expect(spec.info.version).toBe("22.5.0")
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
