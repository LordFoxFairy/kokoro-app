// Test-only exact Public22.5 ->22.4 complete-artifact inverse; no runtime import.
import { createHash } from "node:crypto"
const proof = {
  current: "c77e4921ccce98cfd91d77fc6897cf327599f237ed13438117323b6a3f8555eb",
  parent: "f6b8f3bd250c144a2d648af94c9fd5fe068db33991a4289b849a077eef009f32",
  inverse: [
    {
      at: 3,
      count: 1,
      sha256: "8a9c3a8ebadf0a23471e4ea9fa650e2324a3c50a787d6762f49e53d007546ae6",
      previous: "  version: 22.4.0\n",
    },
    {
      at: 2985,
      count: 142,
      sha256: "b66ae406d3e2b066fcde419a4213e9ded8f44be4af86e8e3c9b56a5c97555bf0",
      previous: "",
    },
    {
      at: 19575,
      count: 311,
      sha256: "23a77d56fed6e096260f33bb6e962d4b2c229e58bb29ff6294fbb07b8eec566c",
      previous: "",
    },
  ],
} as const
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
// Test-only exact Public26 ->25 complete-artifact inverse; old parent proofs remain sealed.
export function restorePublic25PersonalSseContract(source: string) {
  if (!/^  version: 26\.0\.0$/mu.test(source)) return source
  if (hash(source) !== "20d26736cf23da32c242c2c7cf75c45affb62c5d27696dcecb0bc6193bc39a09") throw Error("Personal SSE fixed current contract drift")
  const field = "        transport: { type: string, enum: [streamable_http, sse_compat] }\n"
  const block = source.match(/^    McpConnectionProjection:\n[\s\S]*?(?=^    [A-Za-z])/mu)?.[0]
  if (!block || block.split(field).length !== 2 || source.split(field).length !== 2) throw Error("Personal SSE exact transport delta drift")
  const parent = source.replace(block, () => block.replace(field, "        transport: { type: string, enum: [streamable_http] }\n")).replace(/^  version: 26\.0\.0$/mu, "  version: 25.0.0")
  if (hash(parent) !== "7261ac9ce2140555ba97ebff2bf0359533cc49dda014b08dcd6a6054a8d38b1c") throw Error("Personal SSE complete Public25 parent drift")
  return parent
}
// Test-only Public25 ->24 inverse; the complete Public24 and earlier oracles stay sealed.
export function restorePublic24SkillDetailContract(source: string) {
  if (!/^  version: 25\.0\.0$/mu.test(source)) return source
  if (hash(source) !== "7261ac9ce2140555ba97ebff2bf0359533cc49dda014b08dcd6a6054a8d38b1c") throw Error("Skill detail fixed current contract drift")
  const metadataSchema = `    SpecificationDetailResponse:
      type: object
      additionalProperties: false
      required: [skill]
      properties:
        skill: { $ref: "#/components/schemas/SpecificationSkill" }
`
  const detail = source.match(/^  \/skill\.v1\.SkillOptionalService\/GetSkill:\n[\s\S]*?(?=^  \/)/mu)?.[0]
  const ref = "#/components/schemas/SpecificationDetailResponse"
  if (!detail || detail.split(ref).length !== 2 || source.split(metadataSchema).length !== 2) throw Error("Skill detail exact metadata delta drift")
  const parent = source
    .replace(detail, () => detail.replace(ref, "#/components/schemas/SpecificationDownloadInfo"))
    .replace(metadataSchema, "")
    .replace(/^  version: 25\.0\.0$/mu, "  version: 24.0.0")
  if (hash(parent) !== "f4caf11f3cd9255d2cd9daf69b74ff9988505d640e31c686ce495e6d8a578b2c") throw Error("Skill detail complete Public24 parent drift")
  return parent
}

export function restoreMcpSelectionContract(source: string) {
  source = restorePublic24SkillDetailContract(restorePublic25PersonalSseContract(source))
  if (/^  version: 24\.0\.0$/mu.test(source)) {
    if (hash(source) !== "f4caf11f3cd9255d2cd9daf69b74ff9988505d640e31c686ce495e6d8a578b2c") throw Error("Exact MCP selection current contract drift")
    source = source
      .replace(
        "        selected_mcp_connection_ids:\n          type: array\n          maxItems: 16\n          uniqueItems: true\n          x-kokoro-json-byte-limit: 4096\n          description: Exact ordered Platform MCP Connection IDs for this message. Omission or [] adds no connections. This is intent, not authorization; compact ASCII JSON is limited to 4096 bytes.\n          items:\n            type: string\n            minLength: 1\n            maxLength: 191\n            pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\\s\\S])'\n",
        "        mcp_servers:\n          type: array\n          items: { type: string, minLength: 1 }\n",
      )
      .replace("  version: 24.0.0", "  version: 23.1.0")
    if (hash(source) !== "703dba47da8a5c659b4236bb0a72317588ad29a4ca444ff9e5c99cfbcd00634b") throw Error("Exact MCP selection complete parent drift")
  }
  return source
}

export function restoreMeteringParent(bytes: Uint8Array): Buffer {
  let source = restoreMcpSelectionContract(Buffer.from(bytes).toString("utf8"))
  if (/^  version: 23\.1\.0$/mu.test(source)) {
    if (hash(source) !== "703dba47da8a5c659b4236bb0a72317588ad29a4ca444ff9e5c99cfbcd00634b") throw Error("Settlement failure current source drift")
    source = source.replace("                - model_settlement_pending\n", "").replace("  version: 23.1.0", "  version: 23.0.0")
    if (hash(source) !== "34ea71e0aa56256ca00fc5b3c40abd4d142bea82e664a6871190b8547ec2b9e6") throw Error("Settlement failure complete parent drift")
  }
  if (/^  version: 23\.0\.0$/mu.test(source)) {
    if (hash(source) !== "34ea71e0aa56256ca00fc5b3c40abd4d142bea82e664a6871190b8547ec2b9e6") throw Error("Exact model binding source drift")
    source = source
      .replace("        - model_revision\n", "")
      .replace(
        "        model_revision:\n          type: object\n          additionalProperties: false\n          required:\n            - id\n            - content_digest\n          properties:\n            id:\n              type: string\n              format: uuid\n              pattern: ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$(?![\\s\\S])\n            content_digest:\n              type: string\n              pattern: ^[0-9a-f]{64}$(?![\\s\\S])\n",
        "",
      )
      .replace("  version: 23.0.0", "  version: 22.5.0")
  }
  if (hash(source) !== proof.current) throw Error("Metering fixed source drift")
  const lines = source.split(/(?<=\n)/u)
  for (const h of [...proof.inverse].reverse()) {
    if (hash(lines.slice(h.at, h.at + h.count).join("")) !== h.sha256) throw Error("Metering inverse drift")
    lines.splice(h.at, h.count, h.previous)
  }
  const parent = lines.join("")
  if (hash(parent) !== proof.parent) throw Error("Metering complete parent drift")
  return Buffer.from(parent)
}
