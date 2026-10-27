// Test-only exact Public28.3→28.2 inverse. Never imported by production.
import { createHash } from "node:crypto"
import { restorePublic283ToolDisplayDetailContract } from "./bff-tool-display-detail-parent"

const hash = (source: string) => createHash("sha256").update(source).digest("hex")
const parentField = "        display_code: { type: string, enum: [tool.execution, tool.file.read, tool.mcp.discover, tool.mcp.describe, tool.mcp.call, tool.web.search, tool.web.fetch] }\n"
const currentField = parentField.replace("tool.web.fetch]", "tool.web.fetch, tool.file.write, tool.file.deliver]")

export function restorePublic282FileToolDisplayContract(source: string): string {
  source = restorePublic283ToolDisplayDetailContract(source)
  if (!/^  version: 28\.3\.0$/mu.test(source)) return source
  if (hash(source) !== "85a1b51cd151581b51d7ea7992d85e04462c03fafb36d0527e1df352dd85223a"
    || source.split(currentField).length !== 2) throw Error("File tool display full current drift")
  const parent = source.replace(currentField, parentField).replace(/^  version: 28\.3\.0$/mu, "  version: 28.2.0")
  if (hash(parent) !== "e0bb74069c65fb8d414a6a3cb0d6f4c8d9bcb40bb693c2409a9cbe051b8bac53")
    throw Error("File tool display complete Public28.2 parent drift")
  return parent
}
