import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { renderMcpReauthorization } from "../../scripts/generate-bff-mcp-reauthorization.mjs";
import { MCP_REAUTHORIZATION_PROVENANCE, MCP_REAUTHORIZATION_POLICY } from "@/generated/bff-mcp-reauthorization";
const bytes = readFileSync("src/generated/bff-mcp-reauthorization.json");
const provenance = JSON.parse(readFileSync("contract/bff-mcp-reauthorization-source.json", "utf8"));
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
it("consumes the exact committed private profile without moving the public or Prepare pins", () => {
  expect(provenance).toMatchObject({owner_commit:"e3b5fb759ee89523918ac06ebf3a738b4df4e346",source_sha256:"196ce32b86cd20492fb4b368bf59c4a8640c62a24afb3e630e81b90eb4234caa",candidate:false});
  expect(provenance.platform_owner.commit).toBe("2cf63945feecd49f5b79c3532bbd7cbc5b70a3f8");
  expect(sha(bytes)).toBe(provenance.source_sha256); expect(MCP_REAUTHORIZATION_PROVENANCE).toEqual(provenance);
  expect(MCP_REAUTHORIZATION_POLICY.same_command).toEqual({method:"POST",target:"original",body:"original_source_and_double_cas",key:"original"});
  expect(renderMcpReauthorization(bytes,provenance)).toBe(readFileSync("src/generated/bff-mcp-reauthorization.ts","utf8"));
});
it.each(["automatic_retries","new_command_authorized","prepare_authorized","connected","same_command","active","enabled","errors","open_wrapper"])("rejects semantic %s drift even with a recomputed digest", field => {
  const spec=JSON.parse(bytes.toString()); const p=spec["x-kokoro-reauthorization-policy"], op=spec.paths[p.path].post;
  if(["automatic_retries","new_command_authorized","prepare_authorized","connected"].includes(field)) p[field]=true;
  if(field==="same_command") p.same_command.method="GET";
  if(field==="active") op.responses[200].content["application/json"].schema.properties.data.properties.connector.properties.status.const="active";
  if(field==="enabled") op.responses[200].content["application/json"].schema.properties.data.properties.connector.properties.enabled.const=true;
  if(field==="errors") p.errors.pop();
  if(field==="open_wrapper") op.responses[200].content["application/json"].schema.additionalProperties=true;
  const raw=Buffer.from(JSON.stringify(spec)); expect(()=>renderMcpReauthorization(raw,{...provenance,source_sha256:sha(raw)})).toThrow();
});
