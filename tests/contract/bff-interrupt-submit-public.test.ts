import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import YAML from "yaml"

import { messageCreateParamsSchema } from "@/contract/chat"
import { restorePublic2820InterruptSubmitContract, restorePublic2821SteerReceiptContract } from "./bff-interrupt-submit-parent"

const raw = readFileSync("src/generated/bff-public-openapi.yaml", "utf8")

it("pins interrupt submit to the exact optional BFF Run identifier and restores the complete 28.20 contract", () => {
  const parent = restorePublic2820InterruptSubmitContract(raw)
  expect(createHash("sha256").update(parent).digest("hex")).toBe("c5fc7225901fa5b815cdb7ee5286354d7c4cabed9919676e6e86651fb9910783")
  const spec = YAML.parse(restorePublic2821SteerReceiptContract(raw))
  expect(spec.info.version).toBe("28.21.0")
  const request = spec.components.schemas.MessageCreateRequest
  const interrupt = request.properties.interrupt_run_id
  expect(interrupt).toMatchObject({ type: "string", minLength: 1, maxLength: 191 })
  expect(interrupt.description).toContain("409 run_delivery_conflict")
  expect(request.required).not.toContain("interrupt_run_id")
  const input = { idempotency_key: "original", content: "Follow up" }
  const exact = new RegExp(interrupt.pattern, "u")
  expect(messageCreateParamsSchema.parse(input)).toEqual(input)
  for (const id of ["Run_id:one-2.0", "x".repeat(191)]) {
    expect(exact.test(id)).toBe(true)
    expect(messageCreateParamsSchema.parse({ ...input, interrupt_run_id: id })).toEqual({ ...input, interrupt_run_id: id })
  }
  for (const id of ["", "_leading", "run\n", "run/other", "x".repeat(192)]) {
    expect(exact.test(id)).toBe(false)
    expect(messageCreateParamsSchema.safeParse({ ...input, interrupt_run_id: id }).success).toBe(false)
  }
})

it("rejects interrupt field and version tampering before restoring the historical contract", () => {
  for (const changed of [
    raw.replace("        interrupt_run_id:\n", "        changed_run_id:\n"),
    raw.replace("  version: 28.37.0\n", "  version: 28.36.0\n"),
  ]) {
    expect(changed).not.toBe(raw)
    expect(() => restorePublic2820InterruptSubmitContract(changed)).toThrow()
  }
})

it("pins the optional BFF-owned steer message receipt without changing the previous canonical bytes", () => {
  const restored = restorePublic2821SteerReceiptContract(raw)
  expect(createHash("sha256").update(restored).digest("hex")).toBe("a5ea4bb0ef1458a536e3b54e01049267aec2913d147f2ad7bb99a481197d0525")
  const spec = YAML.parse(raw)
  expect(spec.info.version).toBe("28.37.0")
  const receipt = spec.components.schemas.ControlReceipt
  expect(receipt.required).not.toContain("message_id")
  expect(receipt.properties.message_id).toMatchObject({ type: "string", minLength: 1 })
  expect(receipt.properties.message_id.description).toContain("Pending does not prove injection")
})
