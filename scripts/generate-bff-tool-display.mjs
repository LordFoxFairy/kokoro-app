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
const ownerCommit = "853ca9a5d8da3500b0c37543c72198a520e46225"
const sourceSha256 = "ea0031103488daa1fcc0cca45fdd13f4d4061546ac4525c745ec47105649f7e7"
const openapiVersion = "28.17.0"

export function inspectBffToolDisplayContract(document) {
  assert.equal(document.info.version, openapiVersion, "BFF tool display version drift")
  const currentSchemas = document.components.schemas
  const selection = currentSchemas.MessageCreateRequest.properties.selected_custom_api_profiles
  assert.deepEqual(selection, currentSchemas.PrivateSessionSnapshotResponse.properties.data.properties.composer_selection.properties.selected_custom_api_profiles, "BFF Custom API send/restore selection drift")
  assert.equal(createHash("sha256").update(JSON.stringify(selection)).digest("hex"), "d81839ddab4582f9356f99e0ba8926daeb9a17d7b224240c83a7c620b9b8b892", "BFF safe Custom API reference schema drift")
  assert.deepEqual(currentSchemas.RunDisplay.properties.final_answer, {"type": "object", "required": ["segment_id", "revision"], "additionalProperties": false, "description": "Private read-only legacy final proof bound to this owner's exact completed Message parts revision; never a historical write or an execution authority. Existing durable final identity takes precedence; unproven or conflicting bindings are omitted.", "properties": {"segment_id": {"type": "string", "pattern": "^msg_[0-9a-f]{32}(?![\\s\\S])"}, "revision": {"type": "string", "pattern": "^[1-9][0-9]{0,18}(?![\\s\\S])", "x-kokoro-int64-decimal": true}}}, "Private final display binding drift")
  assert.deepEqual(currentSchemas.RunToolActivity.properties.action_title, {"type":"string","minLength":1,"maxLength":256,"x-kokoro-utf8-byte-limit":256,"description":"Public intent of this exact model tool call, bound before approval edits. Not reasoning, capability documentation, execution status or authority. No surrounding whitespace, control/format/surrogate characters or private text. Omitted when absent or mismatched; never inferred from adjacent prose."}, "Action title schema drift")
  assert.deepEqual(currentSchemas.RunDisplay.properties.activity_details.items.properties.tool_description, {"type":"object","required":["text","truncated","redacted"],"properties":{"text":{"type":"string","minLength":1,"maxLength":1024,"x-kokoro-utf8-byte-limit":1024},"truncated":{"type":"boolean"},"redacted":{"type":"boolean"}},"additionalProperties":false,"description":"Provider capability documentation observed in this Run, matched by connection and selector. Not a per-call purpose, execution result, title or authorization. Missing or conflicting evidence is omitted; private display only."}, "Capability description schema drift")
  assert.deepEqual(currentSchemas.RunDisplay.properties.activity_details.items.allOf, [{"if":{"required":["tool_description"]},"then":{"required":["target"],"properties":{"tool_name":{"enum":["mcp_call","mcp_describe_tool"]},"target":{"properties":{"kind":{"const":"mcp_tool"}}}}}}], "Capability description condition drift")
  const priorDetails = structuredClone(currentSchemas.RunDisplay.properties.activity_details)
  delete priorDetails.items.properties.tool_description
  delete priorDetails.items.allOf
  const toolFacts = currentSchemas.RunDisplay.properties.tool_facts
  assert.deepEqual(currentSchemas.RunDisplay.required, ["run_id", "display_skills", "tool_paths", "tool_facts", "activity_details"])
  assert.equal(createHash("sha256").update(JSON.stringify(toolFacts)).digest("hex"), "11bec751d5cb557a2a314533f552166e06126c620877b844c424789e41053595", "BFF exact tool facts member drift")
  assert.equal(createHash("sha256").update(JSON.stringify(priorDetails)).digest("hex"), "e072544777f1574846108ef0762d26d6adbc34bbca2f5a0142ba9e9f57a19128", "BFF exact activity details drift")
  const priorSchemas = structuredClone(currentSchemas)
  delete priorSchemas.RunDisplay.properties.final_answer
  delete priorSchemas.RunToolActivity.properties.action_title
  delete priorSchemas.RunDisplay.properties.activity_details
  priorSchemas.RunDisplay.required = priorSchemas.RunDisplay.required.filter(key => key !== "activity_details")
  delete priorSchemas.RunDisplay.properties.tool_facts
  priorSchemas.RunDisplay.required = priorSchemas.RunDisplay.required.filter(key => key !== "tool_facts")
  const shapeKeys=["RunToolActivity","RunSubagentActivity","RunSkillActivity","RunDisplaySkill","RunDisplay","MessageFeedbackResponse","MessageRegenerationResponse","ErrorEnvelope","RequestMeta","ErrorDetail"]
  assert.equal(createHash("sha256").update(JSON.stringify(Object.fromEntries(shapeKeys.map(key=>[key,priorSchemas[key]])))).digest("hex"),"4a47c411569c988603feaada98718d4757dd266dd1135ecff36c8c82b91af98a","BFF answer/display full closed graph drift")
  const schemas = structuredClone(currentSchemas)
  delete schemas.RunToolActivity.properties.action_title
  delete schemas.RunToolActivity.properties.display_detail.properties.virtual_path
  delete schemas.RunToolActivity.allOf[1].then.properties.display_detail
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
  return { actions: currentSchemas, statuses:Object.fromEntries(["getMessageFeedback","setMessageFeedback","regenerateLatestAssistantMessage","getSessionRunDisplay"].map(id=>{const operation=Object.values(document.paths).flatMap(item=>Object.values(item)).find(op=>op.operationId===id);assert.ok(operation);return[id,Object.keys(operation.responses).map(Number)]})), codes: tool.properties.display_code.enum, detail: {
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

export function renderBffToolDisplayArtifact({ codes, detail,actions,statuses }) {
  return `// Generated by scripts/generate-bff-tool-display.mjs. Do not edit.\nimport {z} from "zod"\n\nexport const BFF_TOOL_DISPLAY_PROVENANCE = ${JSON.stringify({ ownerCommit, sourceSha256, openapiVersion }, null, 2)} as const\n\nexport const BFF_TOOL_DISPLAY_CODES = ${JSON.stringify(codes, null, 2)} as const\n\nexport const BFF_TOOL_DISPLAY_DETAIL_PROFILE = ${JSON.stringify(detail, null, 2)} as const\n\n${renderAnswerSchemas(actions,statuses)}\nexport type BffToolDisplayCode = (typeof BFF_TOOL_DISPLAY_CODES)[number]\n`
}


function schemaCode(schema,schemas) {
 if(schema.$ref) return schemaCode(schemas[schema.$ref.split("/").at(-1)],schemas)
 if(schema.const!==undefined)return `z.literal(${JSON.stringify(schema.const)})`
 if(schema.enum)return schema.enum.length===1?`z.literal(${JSON.stringify(schema.enum[0])})`:`z.union([${schema.enum.map(v=>`z.literal(${JSON.stringify(v)})`).join(",")}])`
 if(Array.isArray(schema.type))return `z.union([${schema.type.map(type=>schemaCode({...schema,type},schemas)).join(",")}])`
 if(schema.type==="null")return "z.null()"
 if(schema.type==="boolean")return "z.boolean()"
 if(schema.type==="object") {
  let code = `z.object({${Object.entries(schema.properties??{}).map(([key,value])=>`${JSON.stringify(key)}:${schemaCode(value,schemas)}${(schema.required??[]).includes(key)?"":".optional()"}`).join(",")}})${schema.additionalProperties===false?".strict()":""}`
  if (schema.allOf && schema.properties.tool_description) {
    assert.deepEqual(schema.allOf, [{"if":{"required":["tool_description"]},"then":{"required":["target"],"properties":{"tool_name":{"enum":["mcp_call","mcp_describe_tool"]},"target":{"properties":{"kind":{"const":"mcp_tool"}}}}}}], "Unsupported capability conditions")
    code += '.refine(v=>v.tool_description===undefined||((v.tool_name==="mcp_call"||v.tool_name==="mcp_describe_tool")&&v.target?.kind==="mcp_tool"))'
  } else if (schema.allOf) {
   const [file, mcp] = schema.allOf
   assert.deepEqual(schema.allOf, [
    { if: { properties: { kind: { const: "file" } } }, then: { properties: { name: { pattern: file.then.properties.name.pattern } } } },
    { if: { properties: { kind: { const: "mcp_tool" } } }, then: { not: { required: ["virtual_path"] } } },
   ], "Unsupported activity target conditions")
   code += `.refine(v=>v.kind===${JSON.stringify(file.if.properties.kind.const)}?new RegExp(${JSON.stringify(file.then.properties.name.pattern)},"u").test(v.name):v.kind!==${JSON.stringify(mcp.if.properties.kind.const)}||v.virtual_path===undefined)`
  }
  return code
 }
 if(schema.type==="array")return `z.array(${schemaCode(schema.items,schemas)})${schema.maxItems===undefined?"":`.max(${schema.maxItems})`}${schema.minItems===undefined?"":`.min(${schema.minItems})`}`
 if(schema.type==="integer") return `z.number().int().min(${schema.minimum}).max(${schema.maximum})`
 if(schema.type==="string"){
  let code="z.string()";if(schema.minLength!==undefined)code+=`.min(${schema.minLength})`;if(schema.pattern)code+=`.regex(new RegExp(${JSON.stringify(schema.pattern)},"u"))`;if(schema.maxLength!==undefined)code+=`.refine(v=>Array.from(v).length<=${schema.maxLength})`;
  if(schema["x-kokoro-utf8-byte-limit"])code+=`.refine(v=>new TextEncoder().encode(v).length<=${schema["x-kokoro-utf8-byte-limit"]})`;
  if(schema["x-kokoro-unicode-domain"])code+=`.refine(v=>v.normalize("NFC")===v&&!new RegExp(${JSON.stringify(String.raw`[\p{Cc}\p{Cf}\p{Cs}]`)},"u").test(v))`;
  if(schema["x-kokoro-int64-decimal"])code+=`.refine(v=>new RegExp(${JSON.stringify(schema.pattern)},"u").test(v)&&BigInt(v)<=BigInt("9223372036854775807"))`;return code
 }
 throw Error("unsupported answer schema")
}
function renderAnswerSchemas(s,statuses){
 const specs={customApiStateVersionWireSchema:s.MessageCreateRequest.properties.selected_custom_api_profiles.items.properties.expected_state_version,selectedCustomApiProfilesWireSchema:s.MessageCreateRequest.properties.selected_custom_api_profiles,actionTitleWireSchema:s.RunToolActivity.properties.action_title,answerFeedbackWireSchema:s.MessageFeedbackResponse.properties.data,answerRegenerationReceiptWireSchema:s.MessageRegenerationResponse.properties.data,runDisplaySkillWireSchema:s.RunDisplaySkill,runDisplayWireSchema:s.RunDisplay,runToolFactWireSchema:s.RunDisplay.properties.tool_facts.items,runActivityDetailWireSchema:s.RunDisplay.properties.activity_details.items,safeVirtualPathWireSchema:s.RunDisplaySkill.properties.virtual_path,answerActionErrorWireSchema:s.ErrorEnvelope}
 return Object.entries(specs).map(([name,schema])=>`export const ${name} = ${schemaCode(schema,s)}${name === "selectedCustomApiProfilesWireSchema" ? ".refine(values => new Set(values.map(value => value.profile_id)).size === values.length)" : ""}`).join("\n")+`\nexport const BFF_ANSWER_ACTION_STATUSES = ${JSON.stringify(statuses)} as const\n`
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
