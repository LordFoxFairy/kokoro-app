import { afterEach, expect, it, vi } from "vitest"

import { createHubClient } from "@/hub/client"
import { createManusSkillHubClient, retainManusSkillHubClient } from "@/ui/skills/manus-skill-client"
import { skillResourceKey, SKILLS_KEY } from "@/ui/skills/skills-resource-cache"
import { skillSourceScope } from "@/ui/skills/skills-pool-model"
import { getResourceSnapshot, subscribeResource, __resetResourceStore } from "@/lib/query/resource-store"

const boundary = { admitted: true, subject: "reader-a", generation: 1 }

function item(id: string, source?: "personal" | "official" | "third_party") {
  return {
    installation_id: `installation-${id}`, series_id: `series-${id}`,
    source_ref: `skill:version-${id}`, revision: "17", installed: true,
    enabled: source !== "third_party", display_name: "Same display name", summary: "Exact installed revision",
    source_status: "active", tags: [], example_prompts: [], category_keys: [],
    installed_at: "2026-10-15T10:00:00.000Z", updated_at: "2026-10-15T11:00:00.000Z",
    skill_updated_at: "2026-10-14T09:00:00.000Z",
    product: { publication_audience: "catalog", state_version: "3", ...(source === undefined ? {} : { source_kind: source }) },
  }
}

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    "content-type": "application/json", "cache-control": "no-store", "x-request-id": "request-pool",
  } })
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); __resetResourceStore() })

it.each([["personal", "personal"], ["official", "official"], ["third_party", "thirdParty"], ["unknown", "unknown"], ["third-party", "unknown"], ["future", "unknown"]])(
  "only canonical source %s belongs to filter %s", (source, filter) => { expect(skillSourceScope(source)).toBe(filter) },
)

it("installed pool consumes exact owner sources across every page, including disabled and unknown entries", async () => {
  const rows = [item("own", "personal"), item("builtin", "official"), item("github", "third_party"), item("unclassified")]
  const calls: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input); calls.push(url)
    // The removed ListSkills projection exposes ownership, not source provenance.
    if (url.endsWith("ListSkills")) return response({ userAddedSkills: rows.map(row => ({
      id: row.series_id, name: row.display_name, version: row.source_ref.slice(6), ownerType: "personal", enabled: row.enabled,
    })), officialSkills: [] })
    return response(url.includes("cursor=") ? { data: rows.slice(2) } : { data: rows.slice(0, 2), meta: { next_cursor: "next +/=" } })
  }))
  const cards = await createManusSkillHubClient(createHubClient(), boundary).listSkillPool()
  expect(cards.map(card => card.scope)).toEqual(["personal", "official", "third_party", "unknown"])
  expect(cards.map(card => card.skill_id)).toEqual(rows.map(row => row.series_id))
  expect(cards[2]).toMatchObject({ installation_id: "installation-github", source_ref: "skill:version-github", revision_skill_id: "version-github", enabled: false })
  expect(cards).toHaveLength(4)
  expect(calls).toEqual([
    "/api/hub/self/skill-installations?installed=true&limit=100",
    "/api/hub/self/skill-installations?installed=true&limit=100&cursor=next+%2B%2F%3D",
  ])
})

it.each(["cursor-cycle", "duplicate-installation", "duplicate-series", "removed", "later-error", "bad-source"] as const)(
  "installed pool rejects %s instead of publishing a partial or fabricated collection", async scenario => {
    let calls = 0
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls++
      if (calls === 1) return response({ data: [item("first", "personal")], meta: { next_cursor: "next" } })
      if (scenario === "later-error") return response({ error: { code: "skill_cursor_invalid", message: "Invalid cursor", retryable: false } }, 400)
      const row = item("second", "third_party")
      if (scenario === "duplicate-installation") row.installation_id = "installation-first"
      if (scenario === "duplicate-series") row.series_id = "series-first"
      return response({ data: [{ ...row,
        ...(scenario === "removed" ? { installed: false, enabled: false, removed_at: row.updated_at } : {}),
        ...(scenario === "bad-source" ? { product: { ...row.product, source_kind: "invented" } } : {}),
      }], ...(scenario === "cursor-cycle" ? { meta: { next_cursor: "next" } } : {}) })
    }))
    await expect(createManusSkillHubClient(createHubClient(), boundary).listSkillPool()).rejects.toBeInstanceOf(Error)
    expect(calls).toBe(2)
  },
)

it("installed pool bounds empty advancing pages rather than looping indefinitely", async () => {
  let calls = 0
  vi.stubGlobal("fetch", vi.fn(async () => response({ data: [], meta: { next_cursor: `page-${++calls}` } })))
  await expect(createManusSkillHubClient(createHubClient(), boundary).listSkillPool()).rejects.toBeInstanceOf(Error)
  expect(calls).toBe(10)
})

it("one pool budget covers all pages and settles even when a later fetch ignores abort", async () => {
  vi.useFakeTimers()
  let calls = 0
  let completeFirst!: (value: Response) => void
  vi.stubGlobal("fetch", vi.fn(async () => {
    if (++calls === 1) return new Promise<Response>(resolve => { completeFirst = resolve })
    return new Promise<Response>(() => {})
  }))
  const result = createManusSkillHubClient(createHubClient(), boundary).listSkillPool().catch(error => error)
  let settled = false
  void result.then(() => { settled = true })
  await vi.advanceTimersByTimeAsync(7_000)
  completeFirst(response({ data: [item("first", "personal")], meta: { next_cursor: "next" } }))
  await vi.advanceTimersByTimeAsync(2_999)
  expect(calls).toBe(2)
  expect(settled).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(settled).toBe(true)
  expect(await result).toBeInstanceOf(Error)
  expect(calls).toBe(2)
})

it("an exact thousand installed facts can finish on the final allowed page without losing disabled entries", async () => {
  let page = 0
  vi.stubGlobal("fetch", vi.fn(async () => {
    const current = page++
    return response({ data: Array.from({ length: 100 }, (_, index) => item(`${current}-${index}`, "third_party")),
      ...(page === 10 ? {} : { meta: { next_cursor: `page-${page}` } }),
    })
  }))
  const cards = await createManusSkillHubClient(createHubClient(), boundary).listSkillPool()
  expect(cards).toHaveLength(1000)
  expect(cards.every(card => card.enabled === false && card.scope === "third_party")).toBe(true)
  expect(page).toBe(10)
})

it("equivalent verified boundaries share one client; identity and generation changes never reuse its resource key", () => {
  const base = createHubClient()
  const first = createManusSkillHubClient(base, boundary)
  expect(createManusSkillHubClient(base, { ...boundary })).toBe(first)
  const next = createManusSkillHubClient(base, { ...boundary, generation: 2 })
  const other = createManusSkillHubClient(base, { ...boundary, subject: "reader-b" })
  expect(new Set([first, next, other]).size).toBe(3)
  expect(new Set([first, next, other].map(client => skillResourceKey(SKILLS_KEY, client))).size).toBe(3)
})

it.each([{ admitted: false, subject: "reader-a", generation: 2 }, { admitted: true, subject: null, generation: 2 }])(
  "unadmitted Skills clients dispatch no pool, catalog or mutation I/O", async blocked => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock)
    const client = createManusSkillHubClient(createHubClient(), blocked)
    await expect(client.listSkillPool()).rejects.toBeInstanceOf(Error)
    await expect(client.listSkillCatalog()).rejects.toBeInstanceOf(Error)
    await expect(client.setSkillEnabled("installation", false)).rejects.toBeInstanceOf(Error)
    await expect(client.installSkill!("skill:version")).rejects.toBeInstanceOf(Error)
    expect(fetchMock).not.toHaveBeenCalled()
  },
)

it("retiring an actor rejects its late page and prevents any next-page or mutation dispatch", async () => {
  let complete!: (value: Response) => void
  const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve }))
    .mockImplementation(async () => response({ data: [item("new", "personal")] }))
  vi.stubGlobal("fetch", fetchMock)
  const base = createHubClient()
  const old = createManusSkillHubClient(base, boundary)
  const pending = old.listSkillPool().catch(error => error)
  const current = createManusSkillHubClient(base, { ...boundary, subject: "reader-b" })
  complete(response({ data: [item("old", "personal")], meta: { next_cursor: "old-next" } }))
  expect(await pending).toBeInstanceOf(Error)
  await expect(old.setSkillEnabled("installation-old", false)).rejects.toBeInstanceOf(Error)
  await expect(old.installSkill!("skill:old")).rejects.toBeInstanceOf(Error)
  expect((await current.listSkillPool()).map(card => card.skill_id)).toEqual(["series-new"])
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it("warm-client release survives StrictMode replay but retires after the actual last release", async () => {
  const fetchMock = vi.fn(async () => response({ data: [] })); vi.stubGlobal("fetch", fetchMock)
  const client = createManusSkillHubClient(createHubClient(), boundary)
  const first = retainManusSkillHubClient(client)
  first()
  const replay = retainManusSkillHubClient(client)
  await Promise.resolve()
  await expect(client.listSkillPool()).resolves.toEqual([])
  replay()
  await Promise.resolve()
  await expect(client.listSkillPool()).rejects.toBeInstanceOf(Error)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it("retired identity forgets its confirmed pool projection instead of retaining old account data", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => response({ data: [item("old", "personal")] })))
  const base = createHubClient()
  const old = createManusSkillHubClient(base, boundary)
  const key = skillResourceKey(SKILLS_KEY, old)
  const loaded = old.listSkillPool()
  const unsubscribe = subscribeResource(key, () => loaded, () => {})
  await loaded
  await Promise.resolve()
  expect(getResourceSnapshot<unknown>(key).data).toBeDefined()
  unsubscribe()
  createManusSkillHubClient(base, { ...boundary, admitted: false, generation: 2 })
  await Promise.resolve()
  expect(getResourceSnapshot<unknown>(key).data).toBeUndefined()
})


it("preserves only the owner-declared update target, without changing the current installed pin", async () => {
  const available_update = { source_ref: "skill:version-new", revision: "18" };
  vi.stubGlobal("fetch", vi.fn(async () => response({ data: [{ ...item("old", "personal"), available_update }] })));
  const [card] = await createManusSkillHubClient(createHubClient(), boundary).listSkillPool();
  expect(card).toMatchObject({ source_ref: "skill:version-old", installed_source_ref: "skill:version-old", available_update });
});

it("installed package and download bind source and decimal revision without series lookup", async () => {
  const { inspectInstallationPackage, downloadInstallationPackage } = await import("@/hub/skill-installation-content")
  const target = { installation_id: "pin-install", source_ref: "skill:pin-A", revision: "7" }
  const directory = { source_ref: target.source_ref, revision: "7", files: [{ path: "SKILL.md", size_bytes: "3" }], selected_file: null }
  const ack = { source_ref: target.source_ref, revision: "7", download_info: { download_url: `/skill-downloads/${"a".repeat(43)}`, filename: "A.zip", expires_at: "2999-01-01T00:00:00Z" } }
  const fetcher = vi.fn().mockResolvedValueOnce(response({ data: directory })).mockResolvedValueOnce(response({ data: { ...directory, selected_file: { path: "SKILL.md", text: "ABC" } } })).mockResolvedValueOnce(response({ data: ack }))
  vi.stubGlobal("fetch", fetcher)
  await expect(inspectInstallationPackage(target)).resolves.toEqual(directory)
  await expect(inspectInstallationPackage(target, "SKILL.md", undefined, directory)).resolves.toMatchObject({ selected_file: { text: "ABC" } })
  await expect(downloadInstallationPackage(target)).resolves.toEqual(ack)
  expect(fetcher.mock.calls.map(call => call[0])).toEqual(["/api/hub/skill-installations/pin-install/package", "/api/hub/skill-installations/pin-install/package?file_path=SKILL.md", "/api/hub/skill-installations/pin-install/download"])
  expect(fetcher.mock.calls[2]?.[1]).toMatchObject({ method: "POST", credentials: "same-origin", redirect: "error", cache: "no-store" })
  expect(fetcher.mock.calls[2]?.[1].body).toBeUndefined()
  expect(fetcher.mock.calls[2]?.[1].headers).not.toHaveProperty("idempotency-key")
})

it.each(["package", "download"] as const)("installed %s rejects a changed pin, numeric revision, directory or download locator", async operation => {
  const { inspectInstallationPackage, downloadInstallationPackage } = await import("@/hub/skill-installation-content")
  const target = { installation_id: "pin-install", source_ref: "skill:pin-A", revision: "7" }
  const valid = operation === "package" ? { source_ref: target.source_ref, revision: "7", files: [], selected_file: null } : { source_ref: target.source_ref, revision: "7", download_info: { download_url: `/skill-downloads/${"b".repeat(43)}`, filename: "A.zip", expires_at: "2999-01-01T00:00:00Z" } }
  for (const data of [{ ...valid, source_ref: "skill:pin-B" }, { ...valid, revision: "8" }, { ...valid, extra: true }, ...(operation === "download" ? [{ ...valid, download_info: { download_url: "https://objects.example/A.zip", filename: "A.zip", expires_at: "2999-01-01T00:00:00Z" } }] : [{ ...valid, selected_file: { path: "SKILL.md", text: "unexpected" } }])]) {
    const fetcher = vi.fn().mockResolvedValue(response({ data })); vi.stubGlobal("fetch", fetcher)
    await expect(operation === "package" ? inspectInstallationPackage(target) : downloadInstallationPackage(target)).rejects.toMatchObject({ reason: "parse" })
    expect(fetcher).toHaveBeenCalledTimes(1)
  }
})

it.each(["package", "download"] as const)("installed %s independently enforces denial, ten-second deadline, caller abort and late-body cleanup", async operation => {
  const { inspectInstallationPackage, downloadInstallationPackage } = await import("@/hub/skill-installation-content")
  const target = { installation_id: "pin-install", source_ref: "skill:pin-A", revision: "7" }
  const run = (signal?: AbortSignal) => operation === "package" ? inspectInstallationPackage(target, undefined, signal) : downloadInstallationPackage(target, signal)
  const code = operation === "package" ? "skill_package_not_found" : "skill_download_forbidden"
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: { code, message: "Denied", retryable: false } }, operation === "package" ? 404 : 403)))
  await expect(run()).rejects.toMatchObject({ reason: "http", code })
  vi.useFakeTimers()
  let finish!: (value: Response) => void
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
  const timed = run().catch(error => error)
  await vi.advanceTimersByTimeAsync(10_000)
  expect(await timed).toMatchObject({ reason: "network" })
  const cancel = vi.fn(); finish(new Response(new ReadableStream({ cancel })))
  await Promise.resolve(); await Promise.resolve()
  expect(cancel).toHaveBeenCalledOnce()
  const controller = new AbortController(), aborted = run(controller.signal).catch(error => error)
  controller.abort()
  expect(await aborted).toMatchObject({ reason: "aborted" })
  finish(new Response(null)); await Promise.resolve()
  expect(vi.getTimerCount()).toBe(0)
})
