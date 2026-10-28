// Test-only exact formal Public28.13 -> Public28.12 inverse. Never runtime.
import { createHash } from "node:crypto"
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
export const actionDisplayCurrentSha256 = "30b288a7f719ec1d5a6f85c70ad80f18bbbce614fbdad1412d1ff3de7a0b2f9c"
const actionTitlePublicDelta =
  "        action_title:\n          type: string\n          minLength: 1\n          maxLength: 256\n          x-kokoro-utf8-byte-limit: 256\n          description: Public intent of this exact model tool call, bound before approval edits. Not reasoning, capability documentation, execution status or authority. No surrounding whitespace, control/format/surrogate characters or private text. Omitted when absent or mismatched; never inferred from adjacent prose.\n"
const capabilityPublicDelta =
  "              tool_description:\n                type: object\n                required:\n                - text\n                - truncated\n                - redacted\n                properties:\n                  text:\n                    type: string\n                    minLength: 1\n                    maxLength: 1024\n                    x-kokoro-utf8-byte-limit: 1024\n                  truncated:\n                    type: boolean\n                  redacted:\n                    type: boolean\n                additionalProperties: false\n                description: Provider capability documentation observed in this Run, matched by connection and selector. Not a per-call purpose, execution result, title or authorization. Missing or conflicting evidence is omitted; private display only.\n"
const capabilityConditionPublicDelta =
  "            allOf:\n            - if:\n                required:\n                - tool_description\n              then:\n                required:\n                - target\n                properties:\n                  tool_name:\n                    enum:\n                    - mcp_call\n                    - mcp_describe_tool\n                  target:\n                    properties:\n                      kind:\n                        const: mcp_tool\n"
export function restorePublic2812ActionDisplayContract(source: string): string {
  if (!/^  version: 28\.13\.0$/mu.test(source)) return source
  if (hash(source) !== actionDisplayCurrentSha256) throw Error("Action display complete Public28.13 child drift")
  const parent = source
    .replace(actionTitlePublicDelta, "")
    .replace(capabilityPublicDelta, "")
    .replace(capabilityConditionPublicDelta, "")
    .replace(/^  version: 28\.13\.0$/mu, "  version: 28.12.0")
  if (hash(parent) !== "86638da86d786e91c81da9e5dd891dee88ef2ca033579866f5ebc6dd6113c00f") throw Error("Action display complete Public28.12 parent drift")
  return parent
}
