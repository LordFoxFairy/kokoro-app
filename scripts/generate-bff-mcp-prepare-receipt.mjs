import { readFileSync } from "node:fs";
import { renderMcpPrepareOutcomes } from "./generate-bff-mcp-prepare-outcomes.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
function renderSchema(schema) {
  if ("const" in schema) return `z.literal(${JSON.stringify(schema.const)})`;
  const variants = schema.oneOf ?? schema.anyOf;
  if (variants) return variants.length === 1 ? renderSchema(variants[0]) : `z.union([${variants.map(renderSchema).join(", ")}])`;
  if (schema.enum) { assert.equal(schema.type, "string"); return `z.enum(${JSON.stringify(schema.enum)})`; }
  if (schema.type === "object") {
    if (!schema.properties && typeof schema.additionalProperties === "object") return `z.record(${renderSchema(schema.propertyNames ?? { type: "string" })}, ${renderSchema(schema.additionalProperties)})`;
    assert.equal(schema.additionalProperties, false, "lookup objects must stay closed");
    return `z.object({${Object.entries(schema.properties).map(([key, value]) => `${JSON.stringify(key)}: ${renderSchema(value)}${schema.required?.includes(key) ? "" : ".optional()"}`).join(", ")}}).strict()`;
  }
  if (schema.type === "array") return `z.array(${renderSchema(schema.items)})${schema.minItems === undefined ? "" : `.min(${schema.minItems})`}${schema.maxItems === undefined ? "" : `.max(${schema.maxItems})`}`;
  if (schema.type === "boolean") return "z.boolean()";
  if (schema.type === "integer") return `z.number().int()${schema.minimum === undefined ? "" : `.min(${schema.minimum})`}${schema.maximum === undefined ? "" : `.max(${schema.maximum})`}`;
  assert.equal(schema.type, "string");
  return `z.string()${schema.minLength === undefined ? "" : `.min(${schema.minLength})`}${schema.maxLength === undefined ? "" : `.max(${schema.maxLength})`}${schema.format === "date-time" ? ".datetime()" : ""}${schema.pattern ? `.regex(new RegExp(${JSON.stringify(schema.pattern)}, "u"))` : ""}`;
}
export function renderMcpPrepareReceipt(bytes, provenance) {
  assert.equal(provenance.owner, "kokoro-bff"); assert.equal(provenance.candidate, false);
  assert.match(provenance.owner_commit, /^[a-f0-9]{40}$/u);
  assert.equal(provenance.source_path, "contract/openapi/browser/v1/mcp-prepare-receipt.json");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), provenance.source_sha256, "Prepare receipt artifact digest drift");
  const spec = JSON.parse(bytes.toString("utf8")), policy = spec["x-kokoro-lookup-policy"];
  assert.equal(policy.profile, provenance.profile); assert.equal(policy.version, provenance.profile_version); assert.equal(spec.info.version, provenance.profile_version);
  assert.equal(policy.visibility, "browser-private"); assert.equal(policy.path, "/browser/v1/mcp/servers/{server_id}/prepare-receipt");
  assert.equal(policy.permission, "mcp_personal.read");
  assert.equal(policy.operation_id, "getMcpPrepareReceipt"); assert.equal(policy.lookup_only, true); assert.equal(policy.completed_only, true);
  assert.equal(policy.negative_ack, true);
  assert.equal(policy.completed_only_scope, "success_wrapper");
  assert.equal(policy.negative_ack_scope, "prepare_connection_rejected_typed_error_only");
  const outcomesBytes = readFileSync(resolve(process.cwd(), "src/generated/bff-mcp-prepare-outcomes.json"));
  const outcomesProvenance = JSON.parse(readFileSync(resolve(process.cwd(), "contract/bff-mcp-prepare-outcomes-source.json"), "utf8"));
  renderMcpPrepareOutcomes(outcomesBytes, outcomesProvenance);
  assert.equal(outcomesProvenance.owner_commit, provenance.owner_commit);
  const outcomes = JSON.parse(outcomesBytes);
  assert.equal(policy.outcomes_profile, outcomes.profile); assert.equal(policy.outcomes_version, outcomes.version);
  assert.deepEqual(policy.allowed_faults, outcomes.operations.getMcpPrepareReceipt);
  assert.deepEqual(policy.outcomes_source, { path: "../../../mcp-prepare-outcomes-v1.json", sha256: outcomesProvenance.source_sha256 }); assert.equal(policy.automatic_retries, false); assert.equal(policy.new_command_authorized, false); assert.equal(policy.prepare_authorized, false);
  assert.equal(policy.supersedes_prepare_inspection_recovery, true); assert.deepEqual(policy.same_command, { method: "GET", target: "original_lookup" });
  assert.deepEqual(Object.keys(spec.paths), [policy.path]); assert.deepEqual(Object.keys(spec.paths[policy.path]), ["get"]);
  const op = spec.paths[policy.path].get;
  assert.equal(op.operationId, policy.operation_id); assert.equal(op["x-kokoro-owner"], provenance.owner); assert.equal(op["x-kokoro-idempotency"], "lookup_only");
  assert.equal(op.requestBody, undefined);
  assert.deepEqual(op.parameters.map(({ in: where, name, required }) => [where, name, required]), [["path", "server_id", true], ["query", "expected_state_version", true], ["header", "Idempotency-Key", true]]);
  const wire = op.responses[200].content["application/json"].schema;
  assert.equal(wire.additionalProperties, false); assert.equal(wire.properties.data.additionalProperties, false);
  assert.deepEqual(wire.required, ["data"]); assert.deepEqual(wire.properties.data.required, ["completed"]);
  const completed = wire.properties.data.properties.completed;
  assert.deepEqual(completed.required, ["server", "connector", "declarations", "replayed"]);
  assert.equal(completed.additionalProperties, false); assert.equal(completed.properties.replayed.const, true);
  assert.deepEqual(completed.properties.server.properties.prepare_status.enum, ["ready", "needs_oauth"]);
  const errors = Object.entries(op.responses).filter(([status]) => status !== "200");
  const tuples = errors.flatMap(([status, value]) => value.content["application/json"].schema.oneOf.map(schema => ({ status: Number(status), code: schema.properties.error.properties.code.const, retryable: schema.properties.error.properties.retryable.const })));
  const sort = values => [...values].sort((a, b) => a.status - b.status || a.code.localeCompare(b.code));
  assert.deepEqual(sort(tuples), sort(policy.errors), "Prepare receipt error tuple drift");
  assert.equal(new Set(tuples.map(value => `${value.status}:${value.code}:${value.retryable}`)).size, tuples.length, "duplicate lookup error tuples");
  return `// Generated by scripts/generate-bff-mcp-prepare-receipt.mjs; do not edit.\nimport { z } from "zod";\nexport const MCP_PREPARE_RECEIPT_PROVENANCE = ${JSON.stringify(provenance, null, 2)} as const;\nexport const MCP_PREPARE_RECEIPT_POLICY = ${JSON.stringify(policy, null, 2)} as const;\nexport const mcpPrepareReceiptServerIdSchema = ${renderSchema(op.parameters[0].schema)};\nexport const mcpPrepareReceiptVersionSchema = ${renderSchema(op.parameters[1].schema)};\nexport const mcpPrepareReceiptKeySchema = ${renderSchema(op.parameters[2].schema)};\nexport const mcpPrepareReceiptWireSchema = ${renderSchema(wire)};\nexport const mcpPrepareReceiptErrors = {\n${errors.map(([status, value]) => `${JSON.stringify(status)}: ${renderSchema(value.content["application/json"].schema)}`).join(",\n")}\n} as const;\n`;
}
async function main() {
  const mode = process.argv[2]; assert.ok(mode === "--write" || mode === "--check");
  const provenance = JSON.parse(await readFile(new URL("contract/bff-mcp-prepare-receipt-source.json", root), "utf8"));
  const content = renderMcpPrepareReceipt(await readFile(new URL("src/generated/bff-mcp-prepare-receipt.json", root)), provenance);
  const output = new URL("src/generated/bff-mcp-prepare-receipt.ts", root);
  if (mode === "--write") await writeFile(output, content); else assert.equal(await readFile(output, "utf8"), content, "generated Prepare receipt drift");
  process.stdout.write(`Prepare receipt ${mode.slice(2)} passed\n`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
