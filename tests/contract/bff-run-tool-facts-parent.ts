import { restorePublic2811ActivityDetailsContract } from "./bff-activity-details-parent"
// Test-only exact formal d629 Public28.11 -> whole Public28.10; no runtime import.
import { createHash } from "node:crypto"
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
// Build/test-only exact Public28.11 tool adjunct inverse; never a production fallback.
export const toolFactsCurrentSha256 = "4d93ec15e2931768afafffb2101039b1da64757ea48c760d16ef88aa8753db16"
const toolFactsPublicDelta =
  "        tool_facts:\n          type: array\n          maxItems: 128\n          x-kokoro-unique-by: activity_id\n          items:\n            type: object\n            required:\n              - activity_id\n            properties:\n              activity_id:\n                type: string\n                minLength: 68\n                maxLength: 68\n                pattern: ^act_[0-9a-f]{64}(?![\\s\\S])\n              display_detail:\n                type: object\n                required:\n                  - kind\n                  - name\n                properties:\n                  kind:\n                    type: string\n                    enum:\n                      - mcp_tool\n                  name:\n                    type: string\n                    minLength: 1\n                    maxLength: 120\n                    x-kokoro-utf8-byte-limit: 480\n                    x-kokoro-unicode-domain: NFC Unicode scalars; no Cc, Cf or Cs\n                additionalProperties: false\n              status:\n                type: string\n                enum:\n                  - failed\n            anyOf:\n              - required:\n                  - display_detail\n              - required:\n                  - status\n            additionalProperties: false\n          description: >-\n            Read-only exact original MCP activity facts: safe public names witnessed by successful same-Run calls, or independently proved failed journal outcomes. No\n            source event or Run status mutation.\n"
export function restorePublic2810ToolFactsContract(source: string) {
  source = restorePublic2811ActivityDetailsContract(source)
  if (!/^  version: 28\.11\.0$/mu.test(source)) {
    if (source.includes("        tool_facts:\n")) throw Error("Tool facts version drift")
    return source
  }
  if (hash(source) !== toolFactsCurrentSha256 || source.split(toolFactsPublicDelta).length !== 2) throw Error("Tool facts complete current drift")
  const parent = source
    .replace(toolFactsPublicDelta, "")
    .replace("      - tool_paths\n      - tool_facts\n", "      - tool_paths\n")
    .replace(/^  version: 28\.11\.0$/mu, "  version: 28.10.0")
  if (hash(parent) !== "9e6a8dddea847ecfd2905f378f4f76022b6cc49a1a4352a2e7abb4e73b3f1328") throw Error("Tool facts complete Public28.10 parent drift")
  return parent
}
