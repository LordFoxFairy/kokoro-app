import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { renderMcpPrepareReceipt } from "../../scripts/generate-bff-mcp-prepare-receipt.mjs";
import { renderMcpPrepareOutcomes } from "../../scripts/generate-bff-mcp-prepare-outcomes.mjs";
import { MCP_PREPARE_OUTCOME_POLICY, MCP_PREPARE_OUTCOME_PROVENANCE, mcpPrepareOutcome } from "@/generated/bff-mcp-prepare-outcomes";
import { mcpPreparePostErrorAllowed, mcpPrepareReceiptErrorAllowed } from "@/hub/mcp-prepare-receipt.schema";
import { mcpConnectorErrorAllowed } from "@/hub/mcp-connector.schema";
const file = (path: string) => readFileSync(path);
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const bytes = file("src/generated/bff-mcp-prepare-outcomes.json");
const provenance = JSON.parse(file("contract/bff-mcp-prepare-outcomes-source.json").toString());
it("pins formal BFF394a independently from Native owner_featuref294 and deterministically generates the exact standalone profile", () => {
 expect(provenance).toMatchObject({owner_commit:"394ae559cd2018206c32d5ca3014de248effa203",source_sha256:"5169cbf5e431cc71a23e2717bda9b51c77f08bed82cae149667532511b3afe72",profile_version:"1.0.0",candidate:false});
 expect(digest(bytes)).toBe(provenance.source_sha256); expect(MCP_PREPARE_OUTCOME_PROVENANCE).toEqual(provenance);
 expect(MCP_PREPARE_OUTCOME_POLICY.owner_feature.commit).toBe("f29428f6e6d23e9f35642fe3de5463472bc1f873");
 expect(renderMcpPrepareOutcomes(bytes,provenance)).toBe(file("src/generated/bff-mcp-prepare-outcomes.ts").toString());
 expect(renderMcpPrepareOutcomes(bytes,provenance)).toBe(renderMcpPrepareOutcomes(bytes,provenance));
 expect(() => renderMcpPrepareOutcomes(Buffer.concat([bytes,Buffer.from("\n")]),provenance)).toThrow();
});
it.each(["post5","new_key","retry","automatic_retirement","fenced_failure","wrong_owner","extra"])("rejects semantic outcome %s even with a recomputed test-only digest", risk => {
 const value=JSON.parse(bytes.toString());
 if(risk==="post5") value.operations.prepareServer.push("execution_fenced");
 else if(risk==="new_key") value.new_command_authorized=true;
 else if(risk==="retry") value.faults.rejected.retryable=true;
 else if(risk==="automatic_retirement") value.faults.execution_fenced.automatic_intent_retirement_authorized=true;
 else if(risk==="fenced_failure") value.faults.execution_fenced.outcome="definite_rejection";
 else if(risk==="wrong_owner") value.owner_feature.commit=provenance.owner_commit;
 else value.automatic_reconnect=true;
 const changed=Buffer.from(JSON.stringify(value));expect(() => renderMcpPrepareOutcomes(changed,{...provenance,source_sha256:digest(changed)})).toThrow();
});
it.each(["negative_scope","completed_scope","reference","allowed_faults"])("binds lookup1.1 %s to its standalone published source", field => {
 const original=file("src/generated/bff-mcp-prepare-receipt.json"), pin=JSON.parse(file("contract/bff-mcp-prepare-receipt-source.json").toString());
 expect(digest(original)).toBe("97ac49936f7107ba5f25b9237997642069693b1e6d0b6dd38034718636ee6112");expect(() => renderMcpPrepareReceipt(original,pin)).not.toThrow();
 const value=JSON.parse(original.toString()),policy=value["x-kokoro-lookup-policy"];
 if(field==="negative_scope")policy.negative_ack_scope="all_errors";
 else if(field==="completed_scope")policy.completed_only_scope="all_responses";
 else if(field==="reference")policy.outcomes_source.sha256="b".repeat(64);
 else policy.allowed_faults=["rejected"];
 const changed=Buffer.from(JSON.stringify(value));expect(() => renderMcpPrepareReceipt(changed,{...pin,source_sha256:digest(changed)})).toThrow();
});
it.each([[412,"mcp_personal_prepare_rejected",false,true,true],[409,"mcp_personal_prepare_execution_fenced",false,false,true],[412,"mcp_personal_prepare_rejected",true,false,false],[409,"mcp_personal_prepare_rejected",false,false,false]] as const)("admits exact method tuple %i/%s/%s only",(status,code,retryable,post,get)=>{
 const value={error:{code,message:"QA public error",retryable}};
 expect(mcpPreparePostErrorAllowed(status,value)).toBe(post);expect(mcpPrepareReceiptErrorAllowed(status,value)).toBe(get);
 expect(mcpConnectorErrorAllowed("updateServer",status,value)).toBe(false);
 expect(mcpPrepareOutcome("prepareServer",status,code,retryable)!==null).toBe(post);
});
