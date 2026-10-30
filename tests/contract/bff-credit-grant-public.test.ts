import { restoreMeteringParent } from "./bff-metering-parent"
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { expect, it } from "vitest"
import YAML from "yaml"
import { restoreCreditGrantParent } from "./bff-credit-grant-parent"
it("pins only the formal non-cash funding POST while preserving the complete prior 182-operation artifact", async () => {
  const raw = await readFile("src/generated/bff-public-openapi.yaml"),
    spec = YAML.parse(restoreMeteringParent(raw).toString()),
    oldRaw = restoreCreditGrantParent(raw),
    old = YAML.parse(oldRaw.toString())
  expect(createHash("sha256").update(oldRaw).digest("hex")).toBe("727159cea88e9f70ca3d1127306e8a6a6bcaa568398de8b0d8fec1cce6b3fae3")
  expect(spec.info.version).toBe("22.4.0")
  expect(old.info.version).toBe("22.3.0")
  const path = "/v1/admin/billing/credit-grants",
    op = spec.paths[path].post
  expect(Object.keys(spec.paths[path])).toEqual(["post"])
  expect(op.operationId).toBe("createAdminCreditGrant")
  expect(op["x-kokoro-permission"]).toBe("admin.billing.credit_grant")
  expect(op["x-kokoro-idempotency"]).toBe("required")
  expect(old.paths[path]).toBeUndefined()
  const inventory = (d: typeof spec) =>
    Object.entries(d.paths).flatMap(([path, ops]) =>
      Object.entries(ops as Record<string, { operationId?: string }>)
        .filter(([, op]) => op.operationId)
        .map(([method, op]) => `${method.toUpperCase()} ${path} ${op.operationId}`),
    )
  expect(inventory(spec)).toHaveLength(183)
  expect(inventory(old)).toHaveLength(182)
  expect(inventory(spec).filter((v) => !v.startsWith(`POST ${path} `))).toEqual(inventory(old))
  const fields = spec.components.schemas.AdminCreditGrantRequest
  expect(fields.additionalProperties).toBe(false)
  expect(fields.required).toEqual(["funding_id", "subject_id", "amount_credits", "reason", "effective_at"])
  expect(fields.properties.amount_credits.type).toBe("string")
  for (const changed of [
    Buffer.concat([raw, Buffer.from("\n")]),
    Buffer.from(raw.toString().replace("createAdminCreditGrant", "arbitraryBillingProxy")),
    Buffer.from(raw.toString().replace("List current-tenant members for platform administration", "Changed old route")),
  ])
    expect(() => restoreCreditGrantParent(changed)).toThrow()
})
