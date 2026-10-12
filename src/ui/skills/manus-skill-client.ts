import { z } from "zod"

import { hasHubNoStoreDirective, type HubClient } from "@/hub/client"
import { catalogPackageResponseSchema, catalogPackageErrorSchema, CATALOG_PACKAGE_ERRORS, catalogPackageMatches, catalogPackagePrivatePath, type CatalogPackageData, manuscriptReadErrorSchema, MANUSCRIPT_READ_ERRORS, manuscriptHubSkillSchema, manuscriptHubPageSchema, manuscriptListSchema, manuscriptDetailSchema, type SkillCard, type SkillCatalog, type SkillCatalogCard } from "@/hub/schemas"

export const SKILL_CATALOG_RESOURCE_KEY = "hub/skills/standalone-catalog"

const categories = {
  SKILL_HUB_TAG_CODING: "coding",
  SKILL_HUB_TAG_DATA: "data",
  SKILL_HUB_TAG_AUTOMATION: "automation",
  SKILL_HUB_TAG_BUSINESS: "business",
  SKILL_HUB_TAG_DESIGN: "design",
  SKILL_HUB_TAG_MEDIA: "media",
  SKILL_HUB_TAG_CONTENT: "content",
  SKILL_HUB_TAG_APPS: "apps",
} as const

type HubSkill = z.infer<typeof manuscriptHubSkillSchema>
type InstalledSkill = z.infer<typeof manuscriptListSchema>["userAddedSkills"][number]
type ManusSkillHubClient = Omit<HubClient, "listSkillCatalog"> & {
  listSkillCatalog: (
    input?: NonNullable<Parameters<HubClient["listSkillCatalog"]>[0]> & { signal?: AbortSignal },
  ) => Promise<SkillCatalog>
}

async function post<T extends z.ZodTypeAny>(operation: "ListSkills" | "ListHubSkills" | "GetSkill" | "DownloadSkill", body: unknown, schema: T, signal?: AbortSignal): Promise<z.infer<T>> {
  const service = operation === "DownloadSkill" ? "SkillService" : "SkillOptionalService"
  const { response, raw } = await readJson(`/api/skill.v1.${service}/${operation}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, signal)
  if (response.status !== 200) throwReadError(operation, response.status, raw)
  return schema.parse(raw)
}

async function readJson(url: string, init: RequestInit, signal?: AbortSignal): Promise<{ response: Response; raw: unknown }> {
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), 10_000)
  const joined = signal === undefined ? deadline.signal : AbortSignal.any([signal, deadline.signal])
  let response: Response | undefined
  try {
    joined.throwIfAborted()
    response = await new Promise<Response>((resolve, reject) => {
      const abort = () => reject(joined.reason)
      joined.addEventListener("abort", abort, { once: true })
      void fetch(url, { ...init, cache: "no-store", redirect: "error", signal: joined }).then((value) => {
        if (joined.aborted) void value.body?.cancel().catch(() => undefined)
        resolve(value)
      }, reject).finally(() => joined.removeEventListener("abort", abort))
      if (joined.aborted) abort()
    })
    joined.throwIfAborted()
    const declared = response.headers.get("content-length")
    if (declared !== null && (!/^(0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > 1_048_576)
      || response.body === null) throw new Error("skill_response_invalid")
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    const cancel = () => { void reader.cancel().catch(() => undefined) }
    joined.addEventListener("abort", cancel, { once: true })
    try {
      for (;;) {
        joined.throwIfAborted()
        const part = await reader.read()
        joined.throwIfAborted()
        if (part.done) break
        size += part.value.byteLength
        if (size > 1_048_576) throw new Error("skill_response_invalid")
        chunks.push(part.value)
      }
    } finally {
      joined.removeEventListener("abort", cancel)
      void reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    let raw: unknown
    try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) }
    catch { throw new Error("skill_response_invalid") }
    joined.throwIfAborted()
    return { response, raw }
  } catch (error) {
    if (signal?.aborted) throw new Error("skill_read_aborted")
    if (joined.aborted) throw new Error("skill_read_timeout")
    throw error
  } finally { clearTimeout(timer); void response?.body?.cancel().catch(() => undefined) }
}

function sourceKind(skill: HubSkill): "official" | "third_party" {
  return skill.publisherType === "SKILL_HUB_PUBLISHER_TYPE_MANUS_OFFICIAL" ? "official" : "third_party"
}

function toCard(skill: HubSkill, added: ReadonlyMap<string, Readonly<{ installed: boolean; enabled: boolean }>>): SkillCatalogCard {
  const createdAt = skill.createdAt === undefined ? undefined : Date.parse(skill.createdAt)
  return {
    name: skill.displayName ?? skill.originalName ?? skill.skillId,
    description: skill.userDescription ?? "",
    // `content_hash` remains a legacy consumer field. The actual series key is
    // carried separately as `skill_id`; no display or command infers identity
    // from a title.
    content_hash: skill.currentVersion?.checksum ?? skill.skillId,
    skill_id: skill.skillId,
    ...(skill.currentVersion?.versionUid === undefined ? {} : { revision_skill_id: skill.currentVersion.versionUid }),
    scope: sourceKind(skill),
    installed: added.get(skill.skillId)?.installed === true,
    enabled: added.get(skill.skillId)?.enabled === true,
    categories: (skill.tags?.values ?? []).map((value) => {
      if (!(value in categories)) throw new Error("skill_response_invalid")
      return categories[value as keyof typeof categories]
    }),
    ...(Number.isFinite(createdAt) ? { updated_at: Math.floor(createdAt! / 1000) } : {}),
    ...(skill.usageCount === undefined ? {} : { usage_count: skill.usageCount }),
    ...(skill.coverImage === undefined ? {} : { cover_image: ownerCoverPath(skill.coverImage, skill.currentVersion?.versionUid) }),
    ...(skill.exampleQuestions === undefined ? {} : { example_questions: skill.exampleQuestions }),
    ...(skill.publisherType === undefined ? {} : { publisher_type: skill.publisherType }),
  }
}

function toInstalledCard(skill: InstalledSkill, scope: "official" | "personal"): SkillCard {
  const updatedAt = [skill.updatedAt, skill.addTime, skill.createdAt]
    .map((value) => value === undefined ? Number.NaN : Date.parse(value))
    .find(Number.isFinite)
  return {
    name: skill.displayName ?? skill.name ?? skill.id,
    description: skill.userDescription ?? skill.description ?? "",
    content_hash: skill.id,
    scope,
    enabled: skill.enabled ?? false,
    ...(updatedAt === undefined ? {} : { updated_at: Math.floor(updatedAt / 1000) }),
  }
}

/**
 * Keeps the existing page component while replacing its retired flattened
 * catalog transport with the Manus-compatible BFF methods. The adapter is a
 * read projection only; mutations remain on the typed installation boundary.
 */
export function createManusSkillHubClient(base: HubClient): ManusSkillHubClient {
  return {
    ...base,
    listSkillPool: async (): Promise<SkillCard[]> => {
      const installed = await post("ListSkills", {}, manuscriptListSchema)
      const cards = [
        ...installed.userAddedSkills.filter((skill) => skill.added !== false).map((skill) => toInstalledCard(skill, "personal")),
        ...installed.officialSkills.filter((skill) => skill.added === true).map((skill) => toInstalledCard(skill, "official")),
      ]
      const seen = new Set<string>()
      return cards.filter((skill) => {
        const key = `${skill.scope}/${skill.content_hash}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    },
    listSkillCatalog: async (input = {}): Promise<SkillCatalog> => {
      const [hub, installed] = await Promise.all([
        post("ListHubSkills", {
          pageSize: 30,
          includeOfficialSkills: true,
          ...(input.query?.trim() ? { query: input.query.trim() } : {}),
          ...(input.cursor ? { pageToken: input.cursor } : {}),
        }, manuscriptHubPageSchema, input.signal),
        post("ListSkills", {}, manuscriptListSchema, input.signal),
      ])
      const added = new Map<string, Readonly<{ installed: boolean; enabled: boolean }>>()
      for (const skill of installed.userAddedSkills) {
        if (added.has(skill.id) || skill.added === false) throw new Error("skill_response_invalid")
        added.set(skill.id, { installed: true, enabled: skill.enabled === true })
      }
      const seenOfficial = new Set<string>()
      for (const skill of installed.officialSkills) {
        if (seenOfficial.has(skill.id) || skill.added === false && added.has(skill.id)) throw new Error("skill_response_invalid")
        seenOfficial.add(skill.id)
        if (!added.has(skill.id) && skill.added === true) added.set(skill.id, { installed: true, enabled: skill.enabled === true })
      }
      const skills = hub.skills
        .filter((skill) => input.scope === undefined || sourceKind(skill) === input.scope)
        .map((skill) => toCard(skill, added))
      return { skills, next_cursor: hub.nextPageToken ?? null }
    },
  }
}


export type ManusSkillDetail = z.infer<typeof manuscriptDetailSchema>

export function ownerCoverPath(cover: string, revision: string | undefined): string {
  if (!revision || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(revision)
    || cover !== `/api/v1/skills/${encodeURIComponent(revision)}/cover`) throw new Error("skill_response_invalid")
  return `/api/hub/skills/${encodeURIComponent(revision)}/cover`
}
function detailForSeries(raw: ManusSkillDetail, skillId: string): ManusSkillDetail {
  if (raw.skill.id !== skillId) throw new Error("skill_response_invalid")
  return raw.skill.coverImage === undefined ? raw : { ...raw, skill: { ...raw.skill, coverImage: ownerCoverPath(raw.skill.coverImage, raw.skill.version) } }
}
export async function getManusSkillDetail(skillId: string, signal?: AbortSignal): Promise<ManusSkillDetail> {
  return detailForSeries(await post("GetSkill", { skillId }, manuscriptDetailSchema, signal), skillId)
}

/** Uses the distinct Manus service operation instead of treating a GetSkill
 * response as a permanent download authority. */
export async function downloadManusSkill(skillId: string, signal?: AbortSignal): Promise<ManusSkillDetail> {
  return detailForSeries(await post("DownloadSkill", { skillId }, manuscriptDetailSchema, signal), skillId)
}

function throwReadError(operation: "ListSkills" | "ListHubSkills" | "GetSkill" | "DownloadSkill", status: number, raw: unknown): never {
  const parsed = manuscriptReadErrorSchema.safeParse(raw)
  if (!parsed.success || !(MANUSCRIPT_READ_ERRORS[status]?.includes(parsed.data.error.code)
    || status === 410 && (operation === "GetSkill" || operation === "DownloadSkill") && parsed.data.error.code === "Gone")) throw new Error("skill_response_invalid")
  throw new Error(parsed.data.error.code)
}

export async function getManusSkillPackage(revisionSkillId: string, filePath?: string, signal?: AbortSignal, expectedDirectory?: CatalogPackageData): Promise<CatalogPackageData> {
  const { response, raw } = await readJson(catalogPackagePrivatePath(revisionSkillId, filePath), { method: "GET" }, signal)
  if (!hasHubNoStoreDirective(response.headers) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(response.headers.get("x-request-id") ?? "")
    || !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(response.headers.get("content-type") ?? "")) throw new Error("skill_response_invalid")
  if (response.status !== 200) {
    const error = catalogPackageErrorSchema.safeParse(raw)
    if (!error.success || !CATALOG_PACKAGE_ERRORS[response.status]?.includes(error.data.error.code)) throw new Error("skill_response_invalid")
    throw new Error(error.data.error.code)
  }
  const parsed = catalogPackageResponseSchema.safeParse(raw)
  if (!parsed.success || !catalogPackageMatches(parsed.data.data, revisionSkillId, filePath, expectedDirectory)) throw new Error("skill_response_invalid")
  return parsed.data.data
}
