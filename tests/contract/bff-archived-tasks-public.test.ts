import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {it,expect} from "vitest";
import YAML from "yaml";
import * as sdk from "@/generated/bff-archived-tasks/sdk.gen";
import {restorePublic153} from "./bff-archived-tasks-parent";
it("pins formal16.0/146 and restores all previous15.3 bytes before old semantic gates",async()=>{
 const bytes=await readFile("src/generated/bff-public-openapi.yaml");const spec=YAML.parse(bytes.toString());expect(spec.info.version).toBe("16.0.0");expect(Object.values(spec.paths).flatMap(p=>Object.keys(p as object).filter(k=>["get","post","put","patch","delete","head","options"].includes(k)))).toHaveLength(146);
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
