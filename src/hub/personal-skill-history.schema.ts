import { z } from "zod"

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u)
const decimal = z.string().regex(/^[1-9][0-9]*$/u)
const utc = z.string().datetime().regex(/Z$/u)
export const personalSkillHistoryVersionSchema = z.object({
  skill_id: id, revision: decimal.refine(value => value.length <= 10 && BigInt(value) <= BigInt("2147483647")),
  name: z.string().max(255), summary: z.string().max(65535), status: z.enum(["active", "disabled", "withdrawn", "quarantined"]),
  archive_size: decimal, file_count: z.number().int().min(1), created_at: utc, is_current: z.boolean(),
}).strict()
export const personalSkillHistoryPageSchema = z.object({
  series_id: id,
  publication: z.object({current_version_id: id, state_version: decimal, withdrawn_at: utc.nullable()}).strict().nullable(),
  versions: z.array(personalSkillHistoryVersionSchema).max(100), next_cursor: z.string().min(1).max(2048).nullable(),
}).strict().refine(page => {
  if (page.publication === null) return page.versions.length === 0 && page.next_cursor === null
  const ids = new Set<string>(); let previous: bigint | undefined
  for (const item of page.versions) {
    const revision = BigInt(item.revision)
    if (ids.has(item.skill_id) || previous !== undefined && revision >= previous || item.is_current !== (item.skill_id === page.publication.current_version_id)) return false
    ids.add(item.skill_id); previous = revision
  }
  return page.next_cursor === null || page.versions.length > 0
})
export const personalSkillHistoryResponseSchema = z.object({data:personalSkillHistoryPageSchema,meta:z.object({request_id:z.string().min(1).max(128)}).strict()}).strict()
export type PersonalSkillHistoryPage = z.infer<typeof personalSkillHistoryPageSchema>
export type PersonalSkillHistoryVersion = z.infer<typeof personalSkillHistoryVersionSchema>
export const personalSkillHistoryErrorSchema=z.object({error:z.object({code:z.string(),message:z.string().min(1)}).strict(),meta:z.object({request_id:z.string().min(1).max(128)}).strict()}).strict()
export function personalSkillHistoryErrorAllowed(status:number,code:string):boolean {
  const pairs:Readonly<Record<number,readonly string[]>>={400:["invalid_skill_request"],401:["session_authentication_required","session_invalid"],403:["service_auth_failed","session_forbidden","product_tenant_forbidden"],404:["skill_not_found"],429:["session_rate_limited"],502:["skill_response_invalid"],503:["product_tenant_not_configured","iam_admission_unavailable","skill_dependency_unavailable"]}
  return pairs[status]?.includes(code) ?? false
}
export function personalSkillHistoryPath(skillId:string):string{return `/api/hub/self/skills/managed/${encodeURIComponent(id.parse(skillId))}/versions`}

/** Check decoded key uniqueness before the history wire schemas consume JSON. */
export function parsePersonalSkillHistoryJson(text:string):unknown {
  const value:unknown=JSON.parse(text)
  const tokens=text.match(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\]:,]|[^\s{}\[\]:,]+/gu) ?? []
  let cursor=0
  const visit=(depth:number):void=>{
    if(depth>32)throw new SyntaxError("History JSON nesting limit")
    const token=tokens[cursor++]
    if(token==="{"){
      const keys=new Set<string>()
      if(tokens[cursor]==="}"){cursor++;return}
      do {const key=JSON.parse(tokens[cursor++]!) as string;if(keys.has(key))throw new SyntaxError("Duplicate history key");keys.add(key);cursor++;visit(depth+1)}while(tokens[cursor++]===",")
    }else if(token==="["){
      if(tokens[cursor]==="]"){cursor++;return}
      do{visit(depth+1)}while(tokens[cursor++]===",")
    }
  }
  visit(0);return value
}
