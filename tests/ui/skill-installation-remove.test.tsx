import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { HubClientError } from "@/hub/client"
import type { InstallationReceipt, PersonalInstallation } from "@/hub/schemas"
import { LocaleProvider } from "@/i18n/context"
import { createPreviewHubClient } from "@/dev/preview-clients"
import { SkillsContent } from "@/ui/skills/skills-panel"
import { KokoroSkillsSurface } from "@/features/app/kokoro-skills-surface"
import { createSkillInstallationRemoveFlow } from "@/ui/skills/skill-installation-remove-flow"

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const boundary = { admitted: true, subject: "remove-reader", generation: 1 }
const installation: PersonalInstallation = {
  installation_id: "remove-installation", series_id: "remove-series", source_ref: "skill:remove-revision", revision: "2",
  installed: true, enabled: true, source_status: "active", display_name: "Removal sample", summary: "Exact installed sample",
  installed_at: "2026-10-26T00:00:00Z", updated_at: "2026-10-26T00:00:00Z", skill_updated_at: "2026-10-26T00:00:00Z",
  tags: [], category_keys: [], example_prompts: [], product: { publication_audience: "catalog", source_kind: "official", state_version: "5" },
}
const removed = { ...installation, installed: false, enabled: false, removed_at: "2026-10-26T00:00:00Z" }
const receipt: InstallationReceipt = { installation: removed, change: "removed", event_id: "remove-event", replayed: false }
function fixture() {
  const get = vi.fn(async () => installation)
  const remove = vi.fn<(id: string, key: string, signal?: AbortSignal) => Promise<InstallationReceipt>>(async () => receipt)
  const flow = createSkillInstallationRemoveFlow({ client: { get, remove }, boundary, key: () => "frozen-remove-key" })
  expect(flow.select(installation, boundary)).toBe(true)
  return { flow, get, remove }
}

it("requires the fresh exact installation before removal and cancellation performs no command", async () => {
  const { flow, get, remove } = fixture()
  await flow.confirm(boundary)
  expect(remove).not.toHaveBeenCalled()
  await flow.readCurrent(boundary)
  expect(flow.getSnapshot()).toMatchObject({ kind: "selected", current: installation })
  flow.cancel(boundary)
  expect(flow.reset(boundary)).toBe(true)
  expect(get).toHaveBeenCalledOnce()
  expect(remove).not.toHaveBeenCalled()
})

it.each(["installation_id", "series_id", "source_ref", "revision", "installed"] as const)("does not confirm removal after fresh %s changed", async field => {
  const { flow, get, remove } = fixture()
  get.mockResolvedValueOnce(field === "installed" ? removed : { ...installation, [field]: field === "source_ref" ? "skill:changed" : "changed" })
  await flow.readCurrent(boundary)
  await flow.confirm(boundary)
  expect(remove).not.toHaveBeenCalled()
  expect(flow.getSnapshot().kind).toBe("unavailable")
})

it("retains an unknown original removal across close and admission; an already-removed GET never becomes its ACK", async () => {
  const { flow, get, remove } = fixture()
  await flow.readCurrent(boundary)
  remove.mockRejectedValueOnce(new HubClientError("network", "lost ACK", null, null))
  await flow.confirm(boundary)
  expect(flow.getSnapshot()).toMatchObject({ kind: "unknown", acknowledged: false })
  flow.cancel(boundary)
  expect(flow.reset(boundary)).toBe(false)
  const next = { ...boundary, generation: 2 }
  flow.bind({ ...next, admitted: false }); flow.bind(next)
  get.mockResolvedValue(removed)
  await flow.readCurrent(next)
  expect(flow.getSnapshot()).toMatchObject({ kind: "unknown", acknowledged: false, current: removed })
  await flow.confirm(boundary)
  expect(remove).toHaveBeenCalledOnce()
  await flow.confirm(next)
  expect(remove).toHaveBeenCalledTimes(2)
  expect(remove.mock.calls.map(call => call.slice(0, 2))).toEqual([[installation.installation_id, "frozen-remove-key"], [installation.installation_id, "frozen-remove-key"]])
  expect(flow.getSnapshot()).toMatchObject({ kind: "completed", acknowledged: true, current: removed })
})

it("keeps ACK-known read failure recoverable using GET only, including after a close", async () => {
  const { flow, get, remove } = fixture()
  await flow.readCurrent(boundary)
  get.mockRejectedValueOnce(Error("read after ACK unavailable"))
  await flow.confirm(boundary)
  expect(flow.getSnapshot()).toMatchObject({ kind: "read_failed", acknowledged: true })
  flow.cancel(boundary)
  expect(flow.reset(boundary)).toBe(false)
  get.mockResolvedValue(removed)
  await flow.confirm(boundary)
  expect(remove).toHaveBeenCalledOnce()
  expect(flow.getSnapshot()).toMatchObject({ kind: "completed", current: removed })
  expect(flow.reset(boundary)).toBe(true)
})

it("does not gate an unknown original removal on GET404 or mislabel a later reinstall as still removed", async () => {
  const { flow, get, remove } = fixture()
  await flow.readCurrent(boundary)
  remove.mockRejectedValueOnce(Error("lost ACK"))
  await flow.confirm(boundary)
  get.mockRejectedValueOnce(new HubClientError("http", "not found", "skill_installation_not_found", 404))
  await flow.readCurrent(boundary)
  expect(flow.getSnapshot()).toMatchObject({ kind: "unknown", acknowledged: false })
  await flow.confirm(boundary)
  expect(remove).toHaveBeenCalledTimes(2)
  expect(flow.getSnapshot()).toMatchObject({ kind: "completed", acknowledged: true, current: { installed: true, enabled: true } })
})

it("survives the StrictMode retain replay but retires a real final lease and its old actions", async () => {
  const { flow, remove } = fixture()
  const release = flow.retain(boundary)
  await flow.readCurrent(boundary)
  release()
  const replayRelease = flow.retain(boundary)
  await Promise.resolve()
  expect(flow.matches(boundary)).toBe(true)
  expect(flow.getSnapshot().current).toBeUndefined()
  await flow.readCurrent(boundary)
  replayRelease()
  await Promise.resolve()
  await flow.confirm(boundary)
  expect(remove).not.toHaveBeenCalled()
  expect(flow.getSnapshot().kind).toBe("idle")
})

it.each(["close", "generation", "actor"] as const)("retires an active removal on %s without adopting a late ACK", async retirement => {
  const { flow, get, remove } = fixture()
  await flow.readCurrent(boundary)
  let finish!: (value: InstallationReceipt) => void
  remove.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const pending = flow.confirm(boundary)
  await flow.confirm(boundary)
  expect(remove).toHaveBeenCalledOnce()
  const signal = remove.mock.calls[0]?.[2] as AbortSignal
  if (retirement === "close") flow.cancel(boundary)
  else flow.bind({ ...boundary, generation: 2, ...(retirement === "actor" ? { subject: "another-reader" } : {}) })
  expect(signal.aborted).toBe(true)
  finish(receipt); await pending
  expect(flow.getSnapshot().acknowledged).toBe(false)
  expect(flow.getSnapshot().current).toBeUndefined()
  expect(flow.getSnapshot().kind).toBe(retirement === "actor" ? "idle" : "unknown")
  expect(get).toHaveBeenCalledOnce()
})

it("rejects a mismatched removal ACK without releasing its original intent", async () => {
  const { flow, remove } = fixture()
  await flow.readCurrent(boundary)
  remove.mockResolvedValueOnce({ ...receipt, installation: { ...removed, series_id: "other-series" } })
  await flow.confirm(boundary)
  expect(flow.getSnapshot()).toMatchObject({ kind: "unknown", acknowledged: false })
  expect(flow.reset(boundary)).toBe(false)
})

it("connects installed removal, cancel, owner refresh and normal same-revision catalog reinstallation without deleting the source", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  let current = installation
  const reads: string[] = [], writes: { path: string; method: string; body: BodyInit | null | undefined }[] = []
  const response = (data: unknown) => Response.json({ data }, { headers: { "cache-control": "no-store", "x-request-id": "removal-ui" } })
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input), method = init?.method ?? "GET"
    reads.push(path)
    if (method === "DELETE") { writes.push({ path, method, body: init?.body }); current = removed; return response(receipt) }
    if (path.endsWith("ListHubSkills")) return Response.json({ skills: [{ skillId: installation.series_id, displayName: installation.display_name, currentVersion: { versionUid: "remove-revision" } }], tagOptions: {} })
    if (path.endsWith("ListSkills")) return Response.json({ userAddedSkills: current.installed ? [{ id: current.series_id, version: "remove-revision", added: true, enabled: current.enabled }] : [], officialSkills: [] })
    if (method === "POST") {
      writes.push({ path, method, body: init?.body }); current = installation
      return response({ installation: current, change: "reinstalled", event_id: "reinstall-event", replayed: false })
    }
    return response(current)
  }))
  const client = { ...createPreviewHubClient(), listSkillPool: vi.fn(async () => current.installed ? [{
    installation_id: current.installation_id, skill_id: current.series_id, revision_skill_id: "remove-revision",
    source_ref: current.source_ref, installed_source_ref: current.source_ref, name: current.display_name, description: current.summary,
    content_hash: current.series_id, scope: "official" as const, enabled: current.enabled,
  }] : []) }
  const settings = () => <LocaleProvider><SkillsContent readBoundary={boundary} client={client} pinned={[]} onTogglePin={vi.fn()} embedded /></LocaleProvider>
  const view = render(settings())
  const openRemove = async () => {
    fireEvent.click(await screen.findByRole("button", { name: installation.display_name }))
    fireEvent.keyDown(await screen.findByRole("button", { name: "更多技能操作" }), { key: "ArrowDown" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "移除安装" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "移除安装" })).toBeEnabled())
  }
  await openRemove()
  expect(screen.getByText(/不会删除源技能及历史版本/u)).toBeVisible()
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
  expect(writes).toEqual([])
  await openRemove()
  fireEvent.click(screen.getByRole("button", { name: "移除安装" }))
  await screen.findByText("已移除")
  expect(writes).toEqual([{ path: `/api/hub/self/skill-installations/${installation.installation_id}`, method: "DELETE", body: undefined }])
  fireEvent.click(screen.getByRole("button", { name: "关闭" }))
  await waitFor(() => expect(screen.queryByRole("button", { name: installation.display_name })).toBeNull())
  view.rerender(<LocaleProvider><KokoroSkillsSurface preview={false} projectReadBoundary={boundary} onPrompt={vi.fn()} /></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: `添加 ${installation.display_name}` }))
  await waitFor(() => expect(writes).toHaveLength(2))
  expect(writes[1]).toEqual({ path: "/api/hub/self/skill-installations", method: "POST", body: JSON.stringify({ source_ref: installation.source_ref }) })
  view.rerender(settings())
  expect(await screen.findByRole("button", { name: installation.display_name })).toBeVisible()
  expect(screen.getByRole("switch", { name: `停用 ${installation.display_name}` })).toBeChecked()
  expect(reads.some(path => path.includes("/skills/managed/") || path.includes("/versions") || path.includes("/package"))).toBe(false)
})

it("keeps a closed unknown removal reachable and mutually locked, retries its original key after admission, then retires a late ACK on actor replacement", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const commands: { id: string; key: string; signal: AbortSignal }[] = []
  let finish!: (response: Response) => void
  const response = (data: unknown) => Response.json({ data }, { headers: { "cache-control": "no-store", "x-request-id": "unknown-remove-ui" } })
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "DELETE") {
      commands.push({ id: String(input), key: new Headers(init.headers).get("idempotency-key")!, signal: init.signal as AbortSignal })
      if (commands.length === 1) throw Error("lost removal ACK")
      return new Promise<Response>(resolve => { finish = resolve })
    }
    return response(installation)
  }))
  const client = { ...createPreviewHubClient(), listSkillPool: async () => [{ installation_id: installation.installation_id,
    skill_id: installation.series_id, revision_skill_id: "remove-revision", source_ref: installation.source_ref, installed_source_ref: installation.source_ref,
    name: installation.display_name, description: installation.summary, content_hash: installation.series_id, scope: "official" as const,
    enabled: true, available_update: { source_ref: "skill:next-revision", revision: "3" } }] }
  const content = (generation = 1, subject = boundary.subject) => <LocaleProvider><SkillsContent client={client}
    readBoundary={{ admitted: true, subject, generation }} pinned={[]} onTogglePin={vi.fn()} embedded /></LocaleProvider>
  const view = render(content())
  fireEvent.click(await screen.findByRole("button", { name: installation.display_name }))
  fireEvent.keyDown(await screen.findByRole("button", { name: "更多技能操作" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "移除安装" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "移除安装" })).toBeEnabled())
  fireEvent.click(screen.getByRole("button", { name: "移除安装" }))
  await screen.findByText("结果未知。重试将复用原请求，不会创建新操作。")
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
  expect(screen.getByRole("switch", { name: `停用 ${installation.display_name}` })).toBeDisabled()
  expect(screen.getByRole("button", { name: /更新至 v3/u })).toBeDisabled()
  view.rerender(content(2))
  fireEvent.click(await screen.findByRole("button", { name: "查看技能操作" }))
  fireEvent.click(await screen.findByRole("button", { name: "重试" }))
  await waitFor(() => expect(commands).toHaveLength(2))
  expect(commands[1]?.key).toBe(commands[0]?.key)
  expect(commands.map(command => command.id)).toEqual(Array(2).fill(`/api/hub/self/skill-installations/${installation.installation_id}`))
  view.rerender(content(3, "replacement-reader"))
  expect(commands[1]?.signal.aborted).toBe(true)
  await act(async () => { finish(response(receipt)) })
  expect(screen.queryByRole("button", { name: "查看技能操作" })).toBeNull()
  expect(screen.queryByText("已移除")).toBeNull()
  expect(screen.queryByText("结果未知。重试将复用原请求，不会创建新操作。")).toBeNull()
})

function deletedCardFixture() {
  let current: PersonalInstallation = { ...installation, enabled: false, source_status: "deleted", display_name: "Deleted source installation" }
  const toCard = (value: PersonalInstallation): import("@/hub/schemas").SkillCard => ({ installation_id: value.installation_id, skill_id: value.series_id, source_ref: value.source_ref, installed_source_ref: value.source_ref, revision_skill_id: value.source_ref.slice(6), name: value.display_name, description: value.summary, content_hash: value.series_id, scope: "official", source_status: value.source_status, enabled: value.enabled })
  let cards = [toCard(current)]
  const calls: { path: string; method: string; signal?: AbortSignal }[] = []
  const response = (data: unknown) => Response.json({ data }, { headers: { "cache-control": "no-store", "x-request-id": "deleted-card-cleanup" } })
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input), method = init?.method ?? "GET"
    calls.push({ path, method, ...(init?.signal ? { signal: init.signal } : {}) })
    if (method === "DELETE") {
      current = { ...current, installed: false, enabled: false, removed_at: current.updated_at }
      cards = []
      return response({ installation: current, change: "removed", event_id: "deleted-source-uninstall", replayed: false })
    }
    return response(current)
  })
  const client = { ...createPreviewHubClient(), listSkillPool: vi.fn(async () => cards) }
  const content = (next = boundary, embedded = true) => <LocaleProvider><SkillsContent client={client} readBoundary={next} pinned={[]} onTogglePin={vi.fn()} embedded={embedded} /></LocaleProvider>
  return { current, toCard, calls, fetcher, client, content, response, replaceCards: (next: typeof cards) => { cards = next } }
}
async function requestDeletedCardRemoval() {
  const trigger = await screen.findByRole("button", { name: "更多技能操作" })
  fireEvent.keyDown(trigger, { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "移除安装" }))
  return trigger
}

it("opens deleted-card cleanup through fresh installation reads and cancellation issues no command or source read", async () => {
  localStorage.setItem("kokoro.locale", "zh")
  const f = deletedCardFixture(); vi.stubGlobal("fetch", f.fetcher)
  render(f.content())
  expect(await screen.findByRole("button", { name: f.current.display_name })).toBeDisabled()
  const trigger = await requestDeletedCardRemoval()
  await waitFor(() => expect(screen.getByRole("button", { name: "移除安装" })).toBeEnabled())
  expect(f.calls.length).toBeGreaterThanOrEqual(2) // Target read, then the existing RemoveDialog fresh qualification.
  expect(f.calls.every(call => call.method === "GET" && call.path === `/api/hub/self/skill-installations/${f.current.installation_id}`)).toBe(true)
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(screen.getByRole("button", { name: f.current.display_name })).toBeDisabled()
  expect(f.calls.some(call => call.method === "DELETE")).toBe(false)
})

it("removes only the deleted-source installation after explicit confirmation and the original strict ACK flow", async () => {
  localStorage.setItem("kokoro.locale", "zh")
  const f = deletedCardFixture(); vi.stubGlobal("fetch", f.fetcher)
  render(f.content()); await screen.findByRole("button", { name: f.current.display_name })
  await requestDeletedCardRemoval()
  await waitFor(() => expect(screen.getByRole("button", { name: "移除安装" })).toBeEnabled())
  expect(f.calls.some(call => call.method === "DELETE")).toBe(false)
  fireEvent.click(screen.getByRole("button", { name: "移除安装" }))
  await screen.findByText("已移除")
  expect(f.calls.filter(call => call.method === "DELETE")).toEqual([{ path: `/api/hub/self/skill-installations/${f.current.installation_id}`, method: "DELETE", signal: expect.any(AbortSignal) }])
  expect(f.calls.every(call => call.path === `/api/hub/self/skill-installations/${f.current.installation_id}`)).toBe(true)
})

it.each(["actor", "generation", "target"] as const)("does not open an old cleanup confirmation after a pending card read and %s replacement", async replacement => {
  localStorage.setItem("kokoro.locale", "zh")
  const f = deletedCardFixture(); let finish!: (value: Response) => void, signal: AbortSignal | undefined
  const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => { signal = init?.signal ?? undefined; return new Promise<Response>(resolve => { finish = resolve }) })
  vi.stubGlobal("fetch", fetcher)
  const view = render(f.content()); await screen.findByRole("button", { name: f.current.display_name })
  await requestDeletedCardRemoval(); await waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
  if (replacement === "target") {
    const { invalidate } = await import("@/lib/query"), { skillResourceKey, SKILLS_KEY } = await import("@/ui/skills/skills-resource-cache")
    f.replaceCards([{ ...f.toCard(f.current), source_ref: "skill:replacement-revision", installed_source_ref: "skill:replacement-revision", revision_skill_id: "replacement-revision", description: "Replacement target is current" }])
    act(() => invalidate(skillResourceKey(SKILLS_KEY, f.client)))
    await screen.findByText("Replacement target is current")
  } else {
    view.rerender(f.content({ ...boundary, subject: replacement === "actor" ? "new-cleanup-actor" : boundary.subject, generation: 2 }))
    await waitFor(() => expect(signal?.aborted).toBe(true))
  }
  await act(async () => { finish(f.response(f.current)) })
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(screen.queryByRole("button", { name: "移除安装" })).toBeNull()
  expect(fetcher).toHaveBeenCalledOnce()
})

it("keeps other installation writes interlocked while the deleted card's target read is pending", async () => {
  localStorage.setItem("kokoro.locale", "zh")
  const f = deletedCardFixture(), other = { ...f.toCard(installation), installation_id: "other-installation", skill_id: "other-series", name: "Other active skill", available_update: { source_ref: "skill:new-version", revision: "3" } }
  f.replaceCards([f.toCard(f.current), other])
  let finish!: (value: Response) => void
  const fetcher = vi.fn(async () => new Promise<Response>(resolve => { finish = resolve })); vi.stubGlobal("fetch", fetcher)
  render(f.content()); await screen.findByRole("button", { name: f.current.display_name }); await requestDeletedCardRemoval()
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
  expect(screen.getByRole("switch", { name: "停用 Other active skill" })).toBeDisabled()
  expect(screen.getByRole("button", { name: /更新至 v3 Other active skill/u })).toBeDisabled()
  expect(screen.getByRole("button", { name: "更多技能操作" })).toBeDisabled()
  await act(async () => { finish(f.response(f.current)) })
})

it.each(["installation_id", "series_id", "source_ref"] as const)("rejects a changed fresh %s before opening deleted-card cleanup", async field => {
  localStorage.setItem("kokoro.locale", "zh")
  const f = deletedCardFixture(), fetcher = vi.fn(async () => f.response({ ...f.current, [field]: field === "source_ref" ? "skill:different-source" : "different-identity" }))
  vi.stubGlobal("fetch", fetcher)
  render(f.content()); await screen.findByRole("button", { name: f.current.display_name }); await requestDeletedCardRemoval()
  await screen.findByRole("alert")
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(screen.getByRole("button", { name: "更多技能操作" })).toBeEnabled()
  expect(fetcher).toHaveBeenCalledOnce()
})


it("keeps the same deleted-card cleanup reachable from the existing standalone pool without enabling details", async () => {
  localStorage.setItem("kokoro.locale", "zh")
  const f = deletedCardFixture(); vi.stubGlobal("fetch", f.fetcher)
  render(f.content(boundary, false))
  expect(await screen.findByRole("button", { name: f.current.display_name })).toBeDisabled()
  const trigger = await requestDeletedCardRemoval()
  await waitFor(() => expect(screen.getByRole("button", { name: "移除安装" })).toBeEnabled())
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(f.calls.every(call => call.method === "GET" && call.path === `/api/hub/self/skill-installations/${f.current.installation_id}`)).toBe(true)
})

it("keeps an explicit menu reread reachable after initial cleanup qualification fails, without issuing removal", async () => {
  localStorage.setItem("kokoro.locale", "zh")
  const f = deletedCardFixture(), fetcher = vi.fn().mockRejectedValueOnce(Error("qualification interrupted")).mockImplementation(f.fetcher)
  vi.stubGlobal("fetch", fetcher)
  render(f.content()); await screen.findByRole("button", { name: f.current.display_name })
  const trigger = await requestDeletedCardRemoval()
  await screen.findByRole("alert")
  expect(fetcher).toHaveBeenCalledOnce()
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(trigger).toBeEnabled()
  await requestDeletedCardRemoval()
  await waitFor(() => expect(screen.getByRole("button", { name: "移除安装" })).toBeEnabled())
  expect(fetcher).toHaveBeenCalledTimes(3) // Explicit reread plus unchanged dialog qualification, no automatic retry.
  expect(f.calls.every(call => call.method === "GET")).toBe(true)
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(screen.getByRole("button", { name: f.current.display_name })).toBeDisabled()
})

it("returns standalone cleanup focus to the selected first deleted card, not the last card's overflow", async () => {
  localStorage.setItem("kokoro.locale", "zh")
  const f = deletedCardFixture(), second: PersonalInstallation = { ...f.current, installation_id: "second-deleted-installation", series_id: "second-deleted-series", source_ref: "skill:second-deleted-revision", display_name: "Second deleted source" }
  f.replaceCards([f.toCard(f.current), f.toCard(second)])
  const fetcher = vi.fn(async (input: RequestInfo | URL) => f.response(String(input).endsWith(second.installation_id) ? second : f.current))
  vi.stubGlobal("fetch", fetcher)
  render(f.content(boundary, false)); await screen.findByRole("button", { name: second.display_name })
  const triggers = screen.getAllByRole("button", { name: "更多技能操作" }), firstTrigger = triggers[0]!, secondTrigger = triggers[1]!
  expect(triggers).toHaveLength(2)
  fireEvent.keyDown(firstTrigger, { key: "ArrowDown" }); fireEvent.click(await screen.findByRole("menuitem", { name: "移除安装" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "移除安装" })).toBeEnabled())
  expect(fetcher.mock.calls.every(([input]) => String(input).endsWith(f.current.installation_id))).toBe(true)
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
  await waitFor(() => expect(firstTrigger).toHaveFocus())
  expect(secondTrigger).not.toHaveFocus()
})

it("keeps pending removal qualification as a stable blank space with only off-screen status until real facts arrive", async () => {
  localStorage.setItem("kokoro.locale", "zh")
  const f = deletedCardFixture(); let finish!: (response: Response) => void, reads = 0
  const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.method ?? "GET").toBe("GET")
    if (++reads === 1) return f.response(f.current)
    return new Promise<Response>(resolve => { finish = resolve })
  })
  vi.stubGlobal("fetch", fetcher)
  render(f.content()); await screen.findByRole("button", { name: f.current.display_name }); await requestDeletedCardRemoval()
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  const dialog = screen.getByRole("dialog"), placeholder = dialog.querySelector<HTMLElement>(".h-16")!
  expect(dialog).toHaveAttribute("aria-busy", "true")
  expect(screen.queryByRole("button", { name: "移除安装" })).toBeNull()
  expect(placeholder).not.toBeNull()
  const { chromium } = await import("@playwright/test"), { createServer } = await import("vite")
  const vite = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true, hmr: false, watch: null } })
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    const result = await vite.transformRequest("/src/app/globals.css?inline"), json = result?.code.match(/export default ([\s\S]*?);?\s*$/u)?.[1]
    if (!json) throw Error("Remove qualification CSS compilation missing inline output")
    const css = JSON.parse(json.replace(/;\s*$/u, "")) as string
    browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 652, height: 767 } })
    await page.route("**/*", route => route.abort())
    await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body data-web-skin="kokoro">${dialog.outerHTML}</body></html>`)
    expect(await page.locator(".h-16").evaluate(element => { const style = getComputedStyle(element); return { height: element.getBoundingClientRect().height, background: style.backgroundColor, radius: style.borderRadius } })).toEqual({ height: 64, background: "rgba(0, 0, 0, 0)", radius: "0px" })
    await page.close()
  } finally { try { await browser?.close() } finally { await vite.close() } }
  expect(dialog.querySelector('[role="status"]')).toHaveClass("sr-only")
  await act(async () => { finish(f.response(f.current)) })
  await waitFor(() => expect(screen.getByRole("button", { name: "移除安装" })).toBeEnabled())
  expect(dialog).toHaveAttribute("aria-busy", "false")
  expect(dialog).toHaveTextContent(f.current.display_name)
  expect(fetcher).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
}, 20_000)
