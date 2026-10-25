import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { expect, it } from "vitest"
import YAML from "yaml"
import { restoreCreditInitializationParent } from "./bff-personal-history-parent"
import { billingCreditAccountPath, billingSummarySchema } from "@/contract/http"

it("pins the current tenant's inherently idempotent initialization without changing the read projections", async () => {
  const bytes = await readFile("src/generated/bff-public-openapi.yaml")
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("20d26736cf23da32c242c2c7cf75c45affb62c5d27696dcecb0bc6193bc39a09")
  const spec = YAML.parse(bytes.toString())
  expect(spec.info.version).toBe("26.0.0")
  const path = spec.paths["/v1/billing/credit-account"]
  expect(Object.keys(path)).toEqual(["put"])
  expect(billingCreditAccountPath()).toBe("/billing/credit-account")
  expect(path.put.operationId).toBe("initializeBillingCreditAccount")
  expect(path.put["x-kokoro-idempotency"]).toBe("inherent")
  expect(path.put["x-kokoro-permission"]).toBe("billing.self.write")
  expect(path.put.parameters).toBeUndefined()
  expect(path.put.requestBody).toEqual({ required: true, content: { "application/json": { schema: { type: "object", additionalProperties: false, maxProperties: 0 } } } })
  expect(Object.keys(path.put.responses).sort()).toEqual(["200", "400", "401", "403", "429", "502", "503"])
  expect(path.put.responses["200"]).toEqual(spec.paths["/v1/billing/summary"].get.responses["200"])
  const summary = spec.components.schemas.BillingSummary
  expect(Object.keys(billingSummarySchema.shape).sort()).toEqual([...summary.required].sort())
})

it("restores the complete prior public artifact and rejects drift rather than weakening prior oracles", async () => {
  const bytes = await readFile("src/generated/bff-public-openapi.yaml")
  expect(createHash("sha256").update(restoreCreditInitializationParent(bytes)).digest("hex")).toBe("f726cac620362524f92474ca9d647229280db308d16105820c718f9bc32db1ae")
  for (const source of [bytes.toString() + "\n", bytes.toString().replace("x-kokoro-idempotency: inherent", "x-kokoro-idempotency: none"), bytes.toString().replace("  version: 26.0.0", "  version: 22.1.0")]) {
    expect(source).not.toBe(bytes.toString())
    expect(() => restoreCreditInitializationParent(Buffer.from(source))).toThrow()
  }
})
