import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { expect, it } from "vitest"
import YAML from "yaml"
import { BFF_TOOL_DISPLAY_CODES, BFF_TOOL_DISPLAY_PROVENANCE } from "@/generated/bff-tool-display"
import { restorePublic27ToolDisplayContract, restorePublic26MessagePartsContract } from "./bff-tool-display-parent"
import { restorePublic282FileToolDisplayContract } from "./bff-file-tool-display-parent"

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
it("consumes the complete formal BFF28 once and restores the original whole Public27 and Public26", async () => {
  const raw = await readFile("src/generated/bff-public-openapi.yaml", "utf8")
  expect(hash(raw)).toBe("9e6a8dddea847ecfd2905f378f4f76022b6cc49a1a4352a2e7abb4e73b3f1328")
  const spec = YAML.parse(raw)
  expect(spec.info.version).toBe("28.10.0")
  expect(BFF_TOOL_DISPLAY_PROVENANCE).toEqual({ ownerCommit: "0b67e0eab4918264a7270b828d558e631bdfb3f5", sourceSha256: hash(raw), openapiVersion: "28.10.0" })
  expect(BFF_TOOL_DISPLAY_CODES).toEqual(["tool.execution", "tool.file.read", "tool.mcp.discover", "tool.mcp.describe", "tool.mcp.call", "tool.web.search", "tool.web.fetch", "tool.file.write", "tool.file.deliver"])
  expect(spec.components.schemas.RunToolActivity.properties.display_code.enum).toEqual(BFF_TOOL_DISPLAY_CODES)
  expect(hash(restorePublic282FileToolDisplayContract(raw))).toBe("e0bb74069c65fb8d414a6a3cb0d6f4c8d9bcb40bb693c2409a9cbe051b8bac53")
  expect(hash(restorePublic27ToolDisplayContract(raw))).toBe("d2b3d546164cadc9655616fc44daf1511a6f7d4a2e5d172f1415552af8942ed1")
  expect(hash(restorePublic26MessagePartsContract(raw))).toBe("20d26736cf23da32c242c2c7cf75c45affb62c5d27696dcecb0bc6193bc39a09")
  for (const changed of [raw + "\n", raw.replace("tool.file.deliver]", "tool.file.deliver, tool.file.unknown]"), raw.replace("const: subagent.execution", "const: tool.execution"), raw.replace("listTeamMembers", "changedOperation")]) {
    expect(changed).not.toBe(raw)
    expect(() => restorePublic27ToolDisplayContract(changed)).toThrow()
  }
})
it("generates only a closed tool tuple from the fixed schema and rejects weakened or cross-branch metadata", async () => {
  const generator = await import(/* @vite-ignore */ pathToFileURL(resolve("scripts/generate-bff-tool-display.mjs")).href) as {
    inspectBffToolDisplayContract: (spec: unknown) => { codes: readonly string[]; detail: unknown }
    renderBffToolDisplayArtifact: (profile: { codes: readonly string[]; detail: unknown }) => string
  }
  const spec = YAML.parse(await readFile("src/generated/bff-public-openapi.yaml", "utf8"))
  expect(generator.inspectBffToolDisplayContract(spec).codes).toEqual(BFF_TOOL_DISPLAY_CODES)
  expect(generator.renderBffToolDisplayArtifact(generator.inspectBffToolDisplayContract(spec))).toBe(await readFile("src/generated/bff-tool-display.ts", "utf8"))
  for (const mutate of [
    (s: typeof spec) => { s.info.version = "27.0.0" },
    (s: typeof spec) => { s.components.schemas.RunToolActivity.additionalProperties = true },
    (s: typeof spec) => { s.components.schemas.RunToolActivity.properties.display_code.enum.push("tool.file.unknown") },
    (s: typeof spec) => { s.components.schemas.RunToolActivity.properties.display_code.enum.pop() },
    (s: typeof spec) => { s.components.schemas.RunToolActivity.properties.display_code = { type: "string" } },
    (s: typeof spec) => { s.components.schemas.RunSubagentActivity.properties.display_code.const = "tool.execution" },
  ]) {
    const changed = structuredClone(spec)
    mutate(changed)
    expect(() => generator.inspectBffToolDisplayContract(changed)).toThrow()
  }
})

it("derives the complete finite target profile from canonical conditional file and MCP branches", async () => {
  const generator = await import(/* @vite-ignore */ pathToFileURL(resolve("scripts/generate-bff-tool-display.mjs")).href) as {
    inspectBffToolDisplayContract: (spec: unknown) => { codes: readonly string[]; detail: { fileNamePattern: string; kinds: readonly string[]; nameMaxScalars: number; nameMaxUtf8Bytes: number; codesByKind: Record<string, readonly string[]> } }
  }
  const raw = await readFile("src/generated/bff-public-openapi.yaml", "utf8")
  const spec = YAML.parse(raw)
  const profile = generator.inspectBffToolDisplayContract(spec)
  expect(profile.detail).toMatchObject({ kinds: ["file", "mcp_tool"], nameMaxScalars: 120, nameMaxUtf8Bytes: 480, fileNamePattern: spec.components.schemas.RunToolActivity.allOf[0].then.properties.display_detail.properties.name.pattern })
  expect(profile.detail.codesByKind.file).toEqual(["tool.file.read", "tool.file.write", "tool.file.deliver"])
  expect(profile.detail.codesByKind.mcp_tool).toEqual(["tool.mcp.describe", "tool.mcp.call"])
  for (const mutate of [
    (s: typeof spec) => { s.components.schemas.RunToolActivity.properties.display_detail.additionalProperties = true },
    (s: typeof spec) => { delete s.components.schemas.RunToolActivity.allOf[0].then.properties.display_detail.properties.name.pattern },
    (s: typeof spec) => { s.components.schemas.RunToolActivity.properties.display_detail.properties.name["x-kokoro-unicode-domain"] = "arbitrary Unicode" },
    (s: typeof spec) => { s.components.schemas.SessionSnapshotResponse.properties.data.properties.execution_process = { type: "object" } },
  ]) {
    const changed = structuredClone(spec); mutate(changed)
    expect(() => generator.inspectBffToolDisplayContract(changed)).toThrow()
  }
  const { restorePublic283ToolDisplayDetailContract } = await import("./bff-tool-display-detail-parent")
  expect(hash(restorePublic283ToolDisplayDetailContract(raw))).toBe("85a1b51cd151581b51d7ea7992d85e04462c03fafb36d0527e1df352dd85223a")
  for (const changed of [raw + "\n", raw.replace("listTeamMembers", "mutatedUnrelatedOperation")]) expect(() => restorePublic283ToolDisplayDetailContract(changed)).toThrow()
})
