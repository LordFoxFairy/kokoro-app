import { z } from "zod"

import type { HubClient } from "@/hub/client"
import type { SkillCatalog, SkillCatalogCard } from "@/hub/schemas"

const tagKey = z.enum(["SKILL_HUB_TAG_CODING", "SKILL_HUB_TAG_DATA", "SKILL_HUB_TAG_AUTOMATION", "SKILL_HUB_TAG_BUSINESS", "SKILL_HUB_TAG_DESIGN", "SKILL_HUB_TAG_MEDIA", "SKILL_HUB_TAG_CONTENT"])
const hubSkillSchema = z.object({
  skillId: z.string().min(1),
  displayName: z.string().min(1).optional(),
  originalName: z.string().min(1).optional(),
  userDescription: z.string().optional(),
  usageCount: z.string().regex(/^(0|[1-9][0-9]*)$/u).optional(),
  tags: z.object({ values: z.array(tagKey).optional() }).strict().optional(),
  createdAt: z.string().optional(),
  publisherType: z.string().optional(),
  currentVersion: z.object({ checksum: z.string().optional() }).strict().optional(),
  coverImage: z.string().min(1).optional(),
  exampleQuestions: z.array(z.string().min(1)).optional(),
}).strict()

const hubPageSchema = z.object({
  skills: z.array(hubSkillSchema),
  nextPageToken: z.string().min(1).optional(),
}).strict()

const listSkillsSchema = z.object({
  userAddedSkills: z.array(z.object({ id: z.string().min(1), enabled: z.boolean().optional() }).passthrough()),
  officialSkills: z.array(z.object({ id: z.string().min(1), added: z.boolean().optional() }).passthrough()),
}).strict()

const categories = {
  SKILL_HUB_TAG_CODING: "coding",
  SKILL_HUB_TAG_DATA: "data",
  SKILL_HUB_TAG_AUTOMATION: "automation",
  SKILL_HUB_TAG_BUSINESS: "business",
  SKILL_HUB_TAG_DESIGN: "design",
  SKILL_HUB_TAG_MEDIA: "media",
  SKILL_HUB_TAG_CONTENT: "content",
} as const

type HubSkill = z.infer<typeof hubSkillSchema>

async function post<T extends z.ZodTypeAny>(operation: "ListSkills" | "ListHubSkills" | "GetSkill", body: unknown, schema: T): Promise<z.infer<T>> {
  const response = await fetch(`/api/skill.v1.SkillOptionalService/${operation}`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const raw: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const code = typeof raw === "object" && raw !== null && "error" in raw ? String((raw as { error?: { code?: unknown } }).error?.code ?? "skill_hub_request_failed") : "skill_hub_request_failed"
    throw new Error(code)
  }
  return schema.parse(raw)
}

function sourceKind(skill: HubSkill): "official" | "third_party" {
  return skill.publisherType === "SKILL_HUB_PUBLISHER_TYPE_MANUS_OFFICIAL" ? "official" : "third_party"
}

function toCard(skill: HubSkill, added: ReadonlyMap<string, boolean>): SkillCatalogCard {
  const createdAt = skill.createdAt === undefined ? undefined : Date.parse(skill.createdAt)
  return {
    name: skill.displayName ?? skill.originalName ?? skill.skillId,
    description: skill.userDescription ?? "",
    // `content_hash` remains a legacy consumer field. The actual series key is
    // carried separately as `skill_id`; no display or command infers identity
    // from a title.
    content_hash: skill.currentVersion?.checksum ?? skill.skillId,
    skill_id: skill.skillId,
    scope: sourceKind(skill),
    installed: added.get(skill.skillId) === true,
    enabled: added.get(skill.skillId) === true,
    categories: (skill.tags?.values ?? []).map((value) => categories[value]),
    ...(Number.isFinite(createdAt) ? { updated_at: Math.floor(createdAt! / 1000) } : {}),
    ...(skill.usageCount === undefined ? {} : { usage_count: skill.usageCount }),
    ...(skill.coverImage === undefined ? {} : { cover_image: skill.coverImage }),
    ...(skill.exampleQuestions === undefined ? {} : { example_questions: skill.exampleQuestions }),
    ...(skill.publisherType === undefined ? {} : { publisher_type: skill.publisherType }),
  }
}

/**
 * Keeps the existing page component while replacing its retired flattened
 * catalog transport with the Manus-compatible BFF methods. The adapter is a
 * read projection only; mutations remain on the typed installation boundary.
 */
export function createManusSkillHubClient(base: HubClient): HubClient {
  return {
    ...base,
    listSkillCatalog: async (input = {}): Promise<SkillCatalog> => {
      const [hub, installed] = await Promise.all([
        post("ListHubSkills", {
          pageSize: 30,
          includeOfficialSkills: true,
          ...(input.query?.trim() ? { query: input.query.trim() } : {}),
          ...(input.cursor ? { pageToken: input.cursor } : {}),
        }, hubPageSchema),
        post("ListSkills", {}, listSkillsSchema),
      ])
      const added = new Map<string, boolean>()
      for (const skill of installed.userAddedSkills) added.set(skill.id, skill.enabled !== false)
      for (const skill of installed.officialSkills) if (skill.added === true) added.set(skill.id, true)
      const skills = hub.skills
        .filter((skill) => input.scope === undefined || sourceKind(skill) === input.scope)
        .map((skill) => toCard(skill, added))
      return { skills, next_cursor: hub.nextPageToken ?? null }
    },
  }
}


const skillDetailSchema = z.object({
  skill: z.object({
    id: z.string().min(1),
    displayName: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    userDescription: z.string().optional(),
    description: z.string().optional(),
    updatedAt: z.string().optional(),
    coverImage: z.string().min(1).optional(),
    exampleQuestions: z.array(z.string().min(1)).optional(),
    tags: z.object({ values: z.array(z.string()).optional() }).strict().optional(),
    added: z.boolean().optional(),
  }).strict(),
  downloadInfo: z.object({ downloadUrl: z.string().min(1), filename: z.string().min(1), expiresAt: z.string().min(1) }).strict(),
}).strict()

export type ManusSkillDetail = z.infer<typeof skillDetailSchema>

export async function getManusSkillDetail(skillId: string): Promise<ManusSkillDetail> {
  return post("GetSkill", { skillId }, skillDetailSchema)
}
