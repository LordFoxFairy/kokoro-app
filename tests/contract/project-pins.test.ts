import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import YAML from "yaml"

it("consumes the formal complete Public28.7 pin artifact", () => {
  const bytes = readFileSync("src/generated/bff-public-openapi.yaml")
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("9e6a8dddea847ecfd2905f378f4f76022b6cc49a1a4352a2e7abb4e73b3f1328")
  const spec = YAML.parse(bytes.toString("utf8"))
  expect(spec.info.version).toBe("28.10.0")
  expect(spec.paths["/v1/self/project-pins"].get.operationId).toBe("listSelfProjectPins")
  expect(spec.paths["/v1/projects/{projectId}/pin"].put["x-kokoro-idempotency"]).toBe("natural")
})

it("the exact inverse restores every Public28.4 byte and rejects unrelated drift",async()=>{
 const {restorePublic284ProjectPinsContract:restore}=await import("./bff-project-pins-parent")
 const raw=readFileSync("src/generated/bff-public-openapi.yaml","utf8")
 expect(createHash("sha256").update(restore(raw)).digest("hex")).toBe("48aa9638d133223c9f78655e9398ddbb44159963f92a2db891a09212f3aa2726")
 for(const changed of [raw+"\n",raw.replace("listTeamMembers","differentOperation"),raw.replace("listSelfProjectPins","differentPin")])expect(()=>restore(changed)).toThrow(/drift/)
})
it("derived wire rejects extra/mixed query and the bool/null conditional, and binds pages",async()=>{
 const p=await import("@/generated/bff-project-pins")
 for(const input of [null,{is_pinned:true,actor:"x"},{is_pinned:"true"}])expect(p.setProjectPinRequestSchema.safeParse(input).success).toBe(false)
 for(const query of [{project_id:"p",limit:50},{cursor:""},{limit:0},{limit:101},{actor:"x"}])expect(p.projectPinQuerySchema.safeParse(query).success).toBe(false)
 for(const value of [{project_id:"p",is_pinned:true,pinned_at:null},{project_id:"p",is_pinned:false,pinned_at:"2026-10-27T00:00:00Z"}])expect(p.projectPinResponseSchema.safeParse({data:value}).success).toBe(false)
 expect(()=>p.parseProjectPinList({data:{items:[{project_id:"p",pinned_at:"2026-10-27T00:00:00Z"},{project_id:"p",pinned_at:"2026-10-27T00:00:00Z"}],next_cursor:null}},{})).toThrow()
})
