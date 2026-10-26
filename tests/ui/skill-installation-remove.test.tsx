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
