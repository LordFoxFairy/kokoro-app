import {restoreClosureParent} from "./bff-closure-parent";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {it,expect} from "vitest";
import YAML from "yaml";
import * as sdk from "@/generated/bff-archived-tasks/sdk.gen";
import {restorePublic153} from "./bff-archived-tasks-parent";
it("pins formal19.0/165 and restores all previous15.3 bytes before old semantic gates",async()=>{
 const bytes=await readFile("src/generated/bff-public-openapi.yaml");const spec=YAML.parse(bytes.toString());expect(spec.info.version).toBe("21.1.1");expect(Object.values(spec.paths).flatMap(p=>Object.keys(p as object).filter(k=>["get","post","put","patch","delete","head","options"].includes(k)))).toHaveLength(175);
 expect(Object.keys(sdk).sort()).toEqual(["archiveSession","getSessionArchiveState","listOwnedArchivedTasks","restoreSession"]);
 expect(spec.paths["/v1/mcp/servers"].post).toBeUndefined();
 for(const path of ["/v1/mcp/servers/{name}/enable","/v1/mcp/servers/{name}/disable","/v1/mcp/servers/{name}"])expect(spec.paths[path]).toBeUndefined();
 for(const name of ["McpServer","McpServerRequest","McpServerResponse"])expect(spec.components.schemas[name]).toBeUndefined();
 expect(spec.components.parameters.McpServerName).toBeUndefined();
 expect(createHash("sha256").update(restorePublic153(bytes)).digest("hex")).toBe("694251d4f4c1bcc9a79ae4fd2d4c050c87a0a8af39bea0a9f0bed3a4dcae5ad5");
 for(const text of [bytes.toString().replace("listOwnedArchivedTasks","changed"),bytes.toString().replace("    ArchivedTaskItem:","    ArchiveExtra:"),bytes.toString()+"\n"])expect(()=>restorePublic153(Buffer.from(text))).toThrow();
 expect(spec.paths["/v1/sessions/{session_id}/archive"].post["x-kokoro-permission"]).toBe("chat.write");
 expect(spec.paths["/v1/sessions/{session_id}/archive"].get["x-kokoro-permission"]).toBe("chat.read");
});

it("restores both complete public16 parent publications and rejects changed current bytes",async()=>{
 const bytes=await readFile("src/generated/bff-public-openapi.yaml");
 const main=restoreClosureParent(bytes,"main"),local=restoreClosureParent(bytes,"local");
 expect(createHash("sha256").update(main).digest("hex")).toBe("b4e91483e425fdcc9547eac8bcda554273cbee0863ccb0ddfb185fae18e4e267");
 expect(createHash("sha256").update(local).digest("hex")).toBe("e15758fa80a62c4375e7d9b93784a1591b350f214f63c8483c2df27fc4800bd6");
 const inventory=(value:Uint8Array)=>{const spec=YAML.parse(Buffer.from(value).toString());return Object.entries(spec.paths).flatMap(([path,item])=>Object.entries(item as Record<string,unknown>).filter(([method])=>["get","post","put","patch","delete","head","options"].includes(method)).map(([method,op])=>[method,path,(op as {operationId:string}).operationId]))};
 expect(inventory(main)).toHaveLength(146);expect(inventory(local)).toHaveLength(146);
 for(const label of ["main","local"] as const)expect(()=>restoreClosureParent(Buffer.concat([bytes,Buffer.from("\n")]),label)).toThrow();
});
