import { describe, expect, it } from "vitest"
import { messagePartsPageSchema, parseSessionSnapshot, parseSharedSessionSnapshot } from "@/contract/chat"
import { messagePartsPath } from "@/contract/paths"
const message = { message_id: "m", role: "assistant", content: null, run_id: "r", status: "completed", created_at: "now", rendering: { mode: "ordered", format_version: 1, revision: "9007199254740993", event_watermark: null, parts_cursor: "initial-opaque" } }
const snapshot = { session: { session_id: "s", title: "x", owner_id: "a", created_at: "now", updated_at: "now" }, messages: [message], execution_process: null, files: [], deliveries: [], deliveries_has_more: false, event_watermark: null }
const text = { kind: "text", part_id: "opaque", segment_id: "segment", first_sequence: "1", latest_sequence: "9007199254740993", text: "😀a", offset: "0", end: "2", total_scalars: "2", completed: true }
const page = { session_id: "s", message_id: "m", run_id: "r", format_version: 1, revision: "9007199254740993", event_watermark: null, items: [text], next_cursor: null }
describe("private ordered message read", () => {
  it("keeps nullable private reads distinct from public legacy snapshots", () => {
    expect(parseSessionSnapshot(snapshot).messages?.[0]?.content).toBeNull()
    expect(() => parseSharedSessionSnapshot(snapshot)).toThrow()
    expect(messagePartsPath("s/?", "m/#")).toBe("/sessions/s%2F%3F/messages/m%2F%23/parts")
  })
  it("validates closed scalar slices and exact signed-64 decimal bounds", () => {
    expect(messagePartsPageSchema.parse(page)).toEqual(page)
    for (const patch of [{ end: "3" }, { offset: "01" }, { text: "\ud800" }, { segment_id: undefined }, { latest_sequence: "9223372036854775808" }, { first_sequence: "0" }, { text: "a".repeat(4097) }]) expect(messagePartsPageSchema.safeParse({ ...page, items: [{ ...text, ...patch }] }).success).toBe(false)
    expect(messagePartsPageSchema.safeParse({ ...page, private: true }).success).toBe(false)
    expect(messagePartsPageSchema.safeParse({ ...page, revision: "1" }).success).toBe(false)
  })
})

it("pins the fixed Public27 owner and restores the entire sealed Public26 parent", async () => {
  const { readFile } = await import("node:fs/promises")
  const { createHash } = await import("node:crypto")
  const { default: YAML } = await import("yaml")
  const { restorePublic26MessagePartsContract } = await import("./bff-tool-display-parent")
  const source = await readFile("src/generated/bff-public-openapi.yaml", "utf8")
  expect(createHash("sha256").update(source).digest("hex")).toBe("ea0031103488daa1fcc0cca45fdd13f4d4061546ac4525c745ec47105649f7e7")
  const parent = restorePublic26MessagePartsContract(source)
  expect(createHash("sha256").update(parent).digest("hex")).toBe("20d26736cf23da32c242c2c7cf75c45affb62c5d27696dcecb0bc6193bc39a09")
  const { restorePublic28ProjectResourceContract } = await import("./bff-project-resource-parent")
  const spec = YAML.parse(restorePublic28ProjectResourceContract(source))
  expect(Object.values(spec.paths).flatMap((path) => Object.values(path as Record<string, { operationId?: string }>)).filter((operation) => operation.operationId)).toHaveLength(187)
  expect(spec.paths["/v1/sessions/{id}/messages/{messageId}/parts"].get.operationId).toBe("getSessionMessageParts")
  expect(spec.components.schemas.KokoroAgUiReplayMetadata.properties.kokoro.oneOf[0].required).toContain("public_sequence")
  for (const changed of [source + "\n", source.replace("getSessionMessageParts", "rewrittenParts"), source.replace("KokoroAgUiReplayMetadata", "RewrittenMetadata")]) expect(() => restorePublic26MessagePartsContract(changed)).toThrow()
})

for (const display_code of ["tool.execution", "tool.file.read", "tool.mcp.discover", "tool.mcp.describe", "tool.mcp.call", "tool.web.search", "tool.web.fetch", "tool.file.write", "tool.file.deliver"]) {
  it(`Public28 ordered parts keep ${display_code} and original coordinates`, () => {
    const activity = { activity: "tool", activity_id: `act_${"a".repeat(64)}`, segment_id: `seg_${"b".repeat(64)}`, status: "failed", display_code }
    const part = { kind: "activity", part_id: `activity:${activity.activity_id}`, first_sequence: "2", latest_sequence: "3", activity }
    const input = { ...page, items: [part] }
    expect(messagePartsPageSchema.parse(input)).toEqual(input)
    expect(() => messagePartsPageSchema.parse({ ...input, items: [{ ...part, activity: { ...activity, display_code: "tool.file.unknown" } }] })).toThrow()
  })
}

it("Public28.4 ordered activity slots retain safe target values, reject mismatches, and do not change public text", () => {
  const activity = { activity: "tool", activity_id: `act_${"a".repeat(64)}`, segment_id: `seg_${"b".repeat(64)}`, status: "completed", display_code: "tool.mcp.describe", display_detail: { kind: "mcp_tool", name: "provider/tools.read" } }
  const part = { kind: "activity", part_id: "safe-target", first_sequence: "2", latest_sequence: "3", activity }
  expect(messagePartsPageSchema.parse({ ...page, items: [text, part] }).items).toEqual([text, part])
  expect(() => messagePartsPageSchema.parse({ ...page, items: [{ ...part, activity: { ...activity, display_detail: { ...activity.display_detail, kind: "file" } } }] })).toThrow()
})
