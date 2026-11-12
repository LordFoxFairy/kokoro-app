import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { expect, it } from "vitest"
import YAML from "yaml"
import { BFF_TOOL_DISPLAY_CODES, BFF_TOOL_DISPLAY_PROVENANCE, selectedResourceRefsWireSchema } from "@/generated/bff-tool-display"
import { restorePublic27ToolDisplayContract, restorePublic26MessagePartsContract } from "./bff-tool-display-parent"
import { restorePublic282FileToolDisplayContract } from "./bff-file-tool-display-parent"
import { restorePublic2824FinalAnswerResourceContract, restorePublic2825LibraryFileDeletionContract, restorePublic2826LibraryFileSearchContract, restorePublic2827LibraryArtifactSourceContract, restorePublic2828LibraryArtifactCommandsContract, restorePublic2829DeliveryDisplayContract, restorePublic2830ProjectWebsitesContract, restorePublic2831AgentConnectionContract, restorePublic2832WorkspaceOutputsContract, restorePublic2833LineConnectionContract, restorePublic2834SlackConnectionContract } from "./bff-message-resource-parent"

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
it("pins the whole Public28.24 parent and accepts only an opaque final-answer resource intent", async () => {
  const raw = await readFile("src/generated/bff-public-openapi.yaml", "utf8")
  expect(hash(restorePublic2834SlackConnectionContract(raw))).toBe("ea0b6ff7b4ea4a0348a4dd579c2440dca32e58c5958b2374e8555e02b74382a6")
  expect(hash(restorePublic2833LineConnectionContract(raw))).toBe("03d4add75d31c6c4dd22e7fcb3b4269556ad3ced87d29a5640976bc74f39810f")
  expect(hash(restorePublic2832WorkspaceOutputsContract(raw))).toBe("e12a8078f5ecaa741c255a3bcec032d398d35309d845d3cf736dc764a0287d33")
  expect(hash(restorePublic2831AgentConnectionContract(raw))).toBe("9fea8041e3eac479e5ea008e120729fb37637636bb6bf3ad8b94ac161ac8a88c")
  expect(hash(restorePublic2830ProjectWebsitesContract(raw))).toBe("2e459bd39f73686ac6d458011b777f08ea17b79a1467e563cdbb299e044a3cf9")
  expect(hash(restorePublic2829DeliveryDisplayContract(raw))).toBe("be6473bfa58332dee9f0417a10f6b21c8320efa79802151fe5b13f93753d4504")
  expect(hash(restorePublic2828LibraryArtifactCommandsContract(raw))).toBe("495afa65989a1308194910b0b5ece62b4f9db0c84f8dc34e7e0f3b00f7c5294f")
  expect(hash(restorePublic2827LibraryArtifactSourceContract(raw))).toBe("52b59b49be42bc3c1126b6fc94b1d88c440b7ac911c2631e8a0305f43f96bd08")
  expect(hash(restorePublic2826LibraryFileSearchContract(raw))).toBe("c80d5aaba1732eca0fb7bc8f32f500adef99e7d884f579cfb7944b8b11e8901a")
  expect(hash(restorePublic2825LibraryFileDeletionContract(raw))).toBe("008667f501044dc186e615b83370f96a7401de8027f25e7635248724fb165759")
  expect(hash(restorePublic2824FinalAnswerResourceContract(raw))).toBe("921c4b7273580a5c64cf6a220808472e828239d4abfbc7b5b93138ecc055a429")
  expect(() => restorePublic2824FinalAnswerResourceContract(raw.replace(", final_answer]", ", unknown]"))).toThrow()
  const ref = { kind: "final_answer", resource_id: "assistant-message" }
  expect(selectedResourceRefsWireSchema.parse([ref])).toEqual([ref])
  for (const extra of [{ text: "body" }, { segment_id: "private" }, { revision: "7" }, { project_ref: "project" }, { sha256: "digest" }])
    expect(selectedResourceRefsWireSchema.safeParse([{ ...ref, ...extra }]).success).toBe(false)
})
it("consumes the complete formal BFF28 once and restores the original whole Public27 and Public26", async () => {
  const raw = await readFile("src/generated/bff-public-openapi.yaml", "utf8")
  expect(hash(raw)).toBe("737688c79fa4fad8216168656d0fe7e4131b496ef2b506e424dbff82d7dca2c8")
  const spec = YAML.parse(raw)
  expect(spec.info.version).toBe("28.37.0")
  expect(BFF_TOOL_DISPLAY_PROVENANCE).toEqual({ ownerCommit: "0a2c98ae6b16e48849c96ccd5fb87c1dcc2b6e97", sourceSha256: hash(raw), openapiVersion: "28.37.0" })
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
