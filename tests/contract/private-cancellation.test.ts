import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { it, expect } from "vitest"
import YAML from "yaml"
import * as generated from "@/generated/bff-agent-failure"
import { restorePublic288CancelledMessageContract } from "./bff-private-cancellation-parent"
const source = readFileSync("src/generated/bff-public-openapi.yaml", "utf8")
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
it("uses the formal private cancelled literal while restoring the complete unchanged28.8 parent", () => {
  expect(generated).toHaveProperty("BFF_PRIVATE_CANCELLED_STATUS", "cancelled")
  expect(hash(restorePublic288CancelledMessageContract(source))).toBe("6376e2d2a5fa9efd8e6ce4d9d4aa3686ad73dda8babffd9ac5b7097073538498")
  for (const changed of [source + "\n", source.replace("version: 28.16.0", "version: 28.17.0"), source.replace("getProjectSkillInstallationPackage", "otherMethod"), source.replace("terminal_status: { type: string, const: cancelled }", "terminal_status: { type: string }")]) {
    expect(() => restorePublic288CancelledMessageContract(changed)).toThrow(/drift/)
  }
})
it("rejects drift in every private cancel guard, not merely the public failure tuples", async () => {
  const generatorPath = "../../scripts/generate-bff-agent-failure.mjs"
  const { inspectBffAgentFailureContract } = await import(/* @vite-ignore */ generatorPath)
  const spec = YAML.parse(source)
  expect(() => inspectBffAgentFailureContract(spec)).not.toThrow()
  for (const mutate of [
    (s: typeof spec) => { s.components.schemas.CancelledAssistantMessageRead.additionalProperties = true },
    (s: typeof spec) => { s.components.schemas.CancelledAssistantMessageRead.properties.terminal_status.const = "completed" },
    (s: typeof spec) => { s.components.schemas.CancelledAssistantMessageRead.properties.role.const = "user" },
    (s: typeof spec) => { s.components.schemas.OrderedAssistantMessageRead.allOf.pop() },
    (s: typeof spec) => { s.components.schemas.ChatMessageRead.oneOf.pop() },
  ]) {
    const mutant = structuredClone(spec); mutate(mutant)
    expect(() => inspectBffAgentFailureContract(mutant)).toThrow()
  }
})
