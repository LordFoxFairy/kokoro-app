import { z } from "zod"

import { createSkillInstallationClient, hasHubNoStoreDirective, type HubClient } from "@/hub/client"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { retireResources } from "@/lib/query/resource-store"
import { skillResourceKey, SKILLS_KEY, SKILLS_CATALOG_KEY } from "./skills-resource-cache"
import { catalogPackageResponseSchema, catalogPackageErrorSchema, CATALOG_PACKAGE_ERRORS, catalogPackageMatches, catalogPackagePrivatePath, type CatalogPackageData, manuscriptReadErrorSchema, MANUSCRIPT_READ_ERRORS, manuscriptHubSkillSchema, manuscriptHubPageSchema, manuscriptListSchema, manuscriptDetailSchema, manuscriptDownloadSchema, type CatalogSkillCategory, type SkillCard, type SkillCatalog, type SkillCatalogCard } from "@/hub/schemas"

// Catalog consumers share the v1 resource namespace. Callers can append their
// own view parameters, while an owner mutation invalidates this prefix once.
export const SKILL_CATALOG_RESOURCE_KEY = "hub/skills/catalog"

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
export type ManusSkillHubClient = Omit<HubClient, "listSkillCatalog"> & {
  listSkillCatalog: (
    input?: NonNullable<Parameters<HubClient["listSkillCatalog"]>[0]> & { category?: CatalogSkillCategory; pageSize?: number; shuffle?: boolean; signal?: AbortSignal },
  ) => Promise<SkillCatalog>
}

// Every Skills entry point shares one adapter for the current verified actor
// and admission generation, never a tab-global cross-actor query identity.
type ClientLifetime = { key: string; client: ManusSkillHubClient; controller: AbortController; leases: number }
const clients = new WeakMap<HubClient, ClientLifetime>()
const lifetimes = new WeakMap<ManusSkillHubClient, ClientLifetime>()

/** The admitted shell owns this lease, not an individual Settings tab. Defer
 * last release so StrictMode's effect replay can retain the same live client. */
export function retainManusSkillHubClient(client: ManusSkillHubClient): () => void {
  const lifetime = lifetimes.get(client)
  if (lifetime === undefined || lifetime.controller.signal.aborted) throw new Error("skill_read_retired")
  lifetime.leases++
  let released = false
  return () => {
    if (released) return
    released = true
    lifetime.leases--
    queueMicrotask(() => { if (lifetime.leases === 0) lifetime.controller.abort() })
  }
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

function sourceKind(skill: HubSkill): "official" | "third_party" | "unknown" {
  if (skill.publisherType === "SKILL_HUB_PUBLISHER_TYPE_MANUS_OFFICIAL") return "official"
  if (skill.publisherType === "SKILL_HUB_PUBLISHER_TYPE_COMMUNITY") return "third_party"
  return "unknown"
}

function toCard(skill: HubSkill, added: ReadonlyMap<string, Readonly<{ installed: boolean; enabled: boolean; installationId?: string; sourceRef?: string }>>): SkillCatalogCard {
  const createdAt = skill.createdAt === undefined ? undefined : Date.parse(skill.createdAt)
  return {
    name: skill.displayName ?? skill.originalName ?? skill.skillId,
    description: skill.userDescription ?? "",
    // `content_hash` remains a legacy consumer field. The actual series key is
    // carried separately as `skill_id`; no display or command infers identity
    // from a title.
    content_hash: skill.currentVersion?.checksum ?? skill.skillId,
    skill_id: skill.skillId,
    ...(skill.currentVersion?.versionUid === undefined ? {} : { source_ref: `skill:${skill.currentVersion.versionUid}` }),
    ...(skill.currentVersion?.versionUid === undefined ? {} : { revision_skill_id: skill.currentVersion.versionUid }),
    scope: sourceKind(skill),
    installed: added.get(skill.skillId)?.installed === true,
    enabled: added.get(skill.skillId)?.enabled === true,
    ...(added.get(skill.skillId)?.installationId === undefined ? {} : { installation_id: added.get(skill.skillId)?.installationId }),
    ...(added.get(skill.skillId)?.sourceRef === undefined ? {} : { installed_source_ref: added.get(skill.skillId)?.sourceRef }),
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

async function installedCards(lifetimeSignal: AbortSignal, assertCurrent: () => void): Promise<SkillCard[]> {
  assertCurrent()
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), 10_000)
  const signal = AbortSignal.any([lifetimeSignal, deadline.signal])
  const installations = createSkillInstallationClient()
  const cards: SkillCard[] = []
  const ids = new Set<string>(), series = new Set<string>(), cursors = new Set<string>()
  let cursor: string | undefined
  try {
    for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
      assertCurrent(); signal.throwIfAborted()
      const page = await installations.list({ installed: true, limit: 100, ...(cursor === undefined ? {} : { cursor }) }, signal)
      assertCurrent(); signal.throwIfAborted()
      for (const item of page.data) {
        if (!item.installed || ids.has(item.installation_id) || series.has(item.series_id)) throw new Error("skill_response_invalid")
        ids.add(item.installation_id); series.add(item.series_id)
        cards.push({
          skill_id: item.series_id, installation_id: item.installation_id,
          source_ref: item.source_ref, installed_source_ref: item.source_ref, revision_skill_id: item.source_ref.slice(6),
          ...(item.available_update === undefined ? {} : { available_update: item.available_update }),
          name: item.display_name, description: item.summary, content_hash: item.series_id,
          scope: item.product.source_kind ?? "unknown", enabled: item.enabled, source_status: item.source_status,
          updated_at: Math.floor(Date.parse(item.skill_updated_at) / 1000),
        })
      }
      cursor = page.meta?.next_cursor
      if (cursor === undefined) return cards
      if (cursors.has(cursor)) throw new Error("skill_response_invalid")
      cursors.add(cursor)
    }
    throw new Error("skill_list_capacity_exceeded")
  } finally { clearTimeout(timer) }
}

/**
 * Keeps the existing page component while replacing its retired flattened
 * catalog transport with the Manus-compatible BFF methods. The adapter is a
 * read projection only; mutations remain on the typed installation boundary.
 */
export function createManusSkillHubClient(base: HubClient, boundary: ProjectReadBoundary): ManusSkillHubClient {
  const key = JSON.stringify([boundary.admitted, boundary.subject, boundary.generation])
  const existing = clients.get(base)
  if (existing?.key === key && !existing.controller.signal.aborted) return existing.client
  existing?.controller.abort()
  const controller = new AbortController()
  const admitted = boundary.admitted && boundary.subject !== null
  const assertCurrent = () => {
    controller.signal.throwIfAborted()
    if (!admitted || clients.get(base)?.client !== client) throw new Error("skill_read_retired")
  }
  const client: ManusSkillHubClient = {
    ...base,
    // The Manus-compatible owner projection deliberately has no quota read.
    // Returning an explicit absence keeps the installed Skills surface from
    // issuing the retired `/self/skills/quota` request (and its visible 404)
    // just to render a catalog that does not expose quota facts.
    skillQuota: async () => null,
    listSkillPool: () => installedCards(controller.signal, assertCurrent),
    setSkillEnabled: async (...args) => { assertCurrent(); const result = await base.setSkillEnabled(...args); assertCurrent(); return result },
    ...(base.installSkill === undefined ? {} : { installSkill: async (...args: Parameters<NonNullable<HubClient["installSkill"]>>) => {
      assertCurrent(); const result = await base.installSkill!(...args); assertCurrent(); return result
    } }),
    listSkillCatalog: async (input = {}): Promise<SkillCatalog> => {
      assertCurrent()
      const tag = input.category === undefined ? undefined : Object.entries(categories).find(([, category]) => category === input.category)?.[0]
      if (input.category !== undefined && tag === undefined) throw new Error("skill_category_invalid")
      const signal = input.signal === undefined ? controller.signal : AbortSignal.any([controller.signal, input.signal])
      const [hub, installed] = await Promise.all([
        post("ListHubSkills", {
          pageSize: input.pageSize ?? 9,
          includeOfficialSkills: true,
          ...(input.shuffle === undefined ? {} : { shuffle: input.shuffle }),
          ...(input.query?.trim() ? { query: input.query.trim() } : {}),
          ...(tag === undefined ? {} : { tag }),
          ...(input.cursor ? { pageToken: input.cursor } : {}),
        }, manuscriptHubPageSchema, signal),
        post("ListSkills", {}, manuscriptListSchema, signal),
      ])
      assertCurrent()
      const added = new Map<string, Readonly<{ installed: boolean; enabled: boolean; installationId?: string; sourceRef?: string }>>()
      for (const skill of installed.userAddedSkills) {
        if (added.has(skill.id) || skill.added === false) throw new Error("skill_response_invalid")
        added.set(skill.id, {
          installed: true,
          enabled: skill.enabled === true,
          ...(skill.installationId === undefined ? {} : { installationId: skill.installationId }),
          ...(skill.version === undefined ? {} : { sourceRef: `skill:${skill.version}` }),
        })
      }
      const seenOfficial = new Set<string>()
      for (const skill of installed.officialSkills) {
        if (seenOfficial.has(skill.id) || skill.added === false && added.has(skill.id)) throw new Error("skill_response_invalid")
        seenOfficial.add(skill.id)
        if (!added.has(skill.id) && skill.added === true)
          added.set(skill.id, {
            installed: true,
            enabled: skill.enabled === true,
            ...(skill.installationId === undefined ? {} : { installationId: skill.installationId }),
            ...(skill.version === undefined ? {} : { sourceRef: `skill:${skill.version}` }),
          })
      }
      const skills = hub.skills
        .filter((skill) => input.scope === undefined || sourceKind(skill) === input.scope)
        .map((skill) => toCard(skill, added))
      return { skills, next_cursor: hub.nextPageToken ?? null }
    },
  }
  const lifetime = { key, client, controller, leases: 0 }
  clients.set(base, lifetime)
  lifetimes.set(client, lifetime)
  controller.signal.addEventListener("abort", () => {
    // Factory replacement can happen during render. Notify cache subscribers
    // only after that render, without retaining retired actor data or closures.
    queueMicrotask(() => {
      retireResources(skillResourceKey(SKILLS_KEY, client))
      retireResources(skillResourceKey(SKILLS_CATALOG_KEY, client))
    })
  }, { once: true })
  return client
}


export type ManusSkillDetail = z.infer<typeof manuscriptDetailSchema>
export type ManusSkillDownload = z.infer<typeof manuscriptDownloadSchema>

export function ownerCoverPath(cover: string, revision: string | undefined): string {
  if (!revision || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(revision)
    || cover !== `/api/v1/skills/${encodeURIComponent(revision)}/cover`) throw new Error("skill_response_invalid")
  return `/api/hub/skills/${encodeURIComponent(revision)}/cover`
}
function detailForSeries<T extends ManusSkillDetail>(raw: T, skillId: string): T {
  if (raw.skill.id !== skillId) throw new Error("skill_response_invalid")
  return raw.skill.coverImage === undefined ? raw : { ...raw, skill: { ...raw.skill, coverImage: ownerCoverPath(raw.skill.coverImage, raw.skill.version) } }
}
export async function getManusSkillDetail(skillId: string, signal?: AbortSignal): Promise<ManusSkillDetail> {
  return detailForSeries(await post("GetSkill", { skillId }, manuscriptDetailSchema, signal), skillId)
}

/** Uses the distinct Manus service operation instead of treating a GetSkill
 * response as a permanent download authority. */
export async function downloadManusSkill(skillId: string, expectedRevisionSkillId: string, signal?: AbortSignal): Promise<ManusSkillDownload> {
  const result = detailForSeries(await post("DownloadSkill", { skillId }, manuscriptDownloadSchema, signal), skillId)
  if (result.skill.version !== expectedRevisionSkillId) throw new Error("skill_response_invalid")
  return result
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
