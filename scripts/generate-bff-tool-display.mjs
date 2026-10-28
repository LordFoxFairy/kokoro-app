import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, realpathSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import YAML from "yaml"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const sourcePath = join(root, "src/generated/bff-public-openapi.yaml")
const outputPath = join(root, "src/generated/bff-tool-display.ts")
const ownerCommit = "364f80cab855a4358eab956b7e3e3a4b5bae647b"
const sourceSha256 = "6376e2d2a5fa9efd8e6ce4d9d4aa3686ad73dda8babffd9ac5b7097073538498"
const openapiVersion = "28.8.0"

export function inspectBffToolDisplayContract(document) {
  assert.equal(document.info.version, openapiVersion, "BFF tool display version drift")
  const schemas = document.components.schemas
  const tool = schemas.RunToolActivity
  const subagent = schemas.RunSubagentActivity
  assert.equal(tool.additionalProperties, false, "BFF tool activity must be closed")
  assert.deepEqual(tool.required, ["activity", "activity_id", "segment_id", "status", "display_code"])
  assert.deepEqual(Object.keys(tool.properties), [...tool.required, "display_detail"])
  assert.deepEqual(tool.properties.activity, { const: "tool" })
  assert.deepEqual(tool.properties.display_code, {
    type: "string",
    enum: ["tool.execution", "tool.file.read", "tool.mcp.discover", "tool.mcp.describe", "tool.mcp.call", "tool.web.search", "tool.web.fetch", "tool.file.write", "tool.file.deliver"],
  }, "BFF tool display closed set drift")
  assert.equal(subagent.additionalProperties, false)
  assert.deepEqual(subagent.properties.activity, { const: "subagent" })
  assert.deepEqual(subagent.properties.display_code, { const: "subagent.execution" }, "BFF subagent display branch drift")
  assert.deepEqual(schemas.RunProcessActivity.oneOf, [
    { $ref: "#/components/schemas/RunToolActivity" },
    { $ref: "#/components/schemas/RunSubagentActivity" },
    { $ref: "#/components/schemas/RunSkillActivity" },
  ])
  const target = tool.properties.display_detail
  assert.equal(target.type, "object")
  assert.equal(target.additionalProperties, false, "Tool targets must be closed")
  assert.deepEqual(target.required, ["kind", "name"])
  assert.deepEqual(Object.keys(target.properties), target.required)
  assert.deepEqual(target.properties.kind, { type: "string", enum: ["file", "mcp_tool"] })
  const name = target.properties.name
  assert.deepEqual(Object.keys(name), ["type", "minLength", "maxLength", "x-kokoro-utf8-byte-limit", "x-kokoro-unicode-domain"])
  assert.equal(name.type, "string")
  for (const limit of [name.minLength, name.maxLength, name["x-kokoro-utf8-byte-limit"]]) assert.ok(Number.isSafeInteger(limit) && limit > 0)
  const unicode = name["x-kokoro-unicode-domain"].match(/^(NFC) Unicode scalars; no (Cc), (Cf) or (Cs)$/u)
  assert.ok(unicode, "Unsupported tool target Unicode domain")
  assert.equal(tool.allOf.length, target.properties.kind.enum.length)
  const codesByKind = {}
  let fileNamePattern
  for (const branch of tool.allOf) {
    assert.deepEqual(Object.keys(branch), ["if", "then"])
    const kind = branch.if.properties.display_detail.properties.kind.const
    assert.ok(target.properties.kind.enum.includes(kind) && !codesByKind[kind], "Unknown/duplicate target conditional")
    assert.deepEqual(branch.if, { required: ["display_detail"], properties: { display_detail: { properties: { kind: { const: kind } } } } })
    assert.deepEqual(Object.keys(branch.then), ["properties"])
    assert.deepEqual(Object.keys(branch.then.properties), kind === "file" ? ["display_code", "display_detail"] : ["display_code"])
    const codes = branch.then.properties.display_code.enum
    assert.deepEqual(branch.then.properties.display_code, { enum: codes })
    assert.ok(Array.isArray(codes) && codes.length > 0 && new Set(codes).size === codes.length && codes.every((code) => tool.properties.display_code.enum.includes(code)))
    codesByKind[kind] = codes
    if (kind === "file") {
      fileNamePattern = branch.then.properties.display_detail.properties.name.pattern
      assert.ok(typeof fileNamePattern === "string" && fileNamePattern.length > 0, "Missing canonical file basename pattern")
      assert.deepEqual(branch.then.properties.display_detail, { properties: { name: { pattern: fileNamePattern } } })
      new RegExp(fileNamePattern, "u")
    }
  }
  assert.deepEqual(schemas.SessionSnapshotResponse.properties.data.properties.execution_process, { type: "null" }, "Shared process must be null")
  assert.equal(schemas.SessionSnapshotResponse.example.data.execution_process, null)
  return { codes: tool.properties.display_code.enum, detail: {
    kinds: target.properties.kind.enum,
    nameMinScalars: name.minLength,
    nameMaxScalars: name.maxLength,
    nameMaxUtf8Bytes: name["x-kokoro-utf8-byte-limit"],
    normalization: unicode[1],
    forbiddenUnicodeCategories: unicode.slice(2),
    fileNamePattern,
    codesByKind,
  } }
}

export function renderBffToolDisplayArtifact({ codes, detail }) {
  return `// Generated by scripts/generate-bff-tool-display.mjs. Do not edit.\n\nexport const BFF_TOOL_DISPLAY_PROVENANCE = ${JSON.stringify({ ownerCommit, sourceSha256, openapiVersion }, null, 2)} as const\n\nexport const BFF_TOOL_DISPLAY_CODES = ${JSON.stringify(codes, null, 2)} as const\n\nexport const BFF_TOOL_DISPLAY_DETAIL_PROFILE = ${JSON.stringify(detail, null, 2)} as const\n\nexport type BffToolDisplayCode = (typeof BFF_TOOL_DISPLAY_CODES)[number]\n`
}

async function main() {
  const mode = process.argv[2]
  assert.ok(mode === "--write" || mode === "--check", "expected --write or --check")
  const bytes = await readFile(sourcePath)
  assert.equal(createHash("sha256").update(bytes).digest("hex"), sourceSha256, "BFF public OpenAPI owner digest drift")
  const rendered = renderBffToolDisplayArtifact(inspectBffToolDisplayContract(YAML.parse(bytes.toString("utf8"))))
  if (mode === "--write") await writeFile(outputPath, rendered)
  else assert.equal(await readFile(outputPath, "utf8"), rendered, "generated BFF tool display artifact drift")
  process.stdout.write(`BFF tool display artifact ${mode.slice(2)} passed (owner SHA-256 ${sourceSha256})\n`)
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) await main()
