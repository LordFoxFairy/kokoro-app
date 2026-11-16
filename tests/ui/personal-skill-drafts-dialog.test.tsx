import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { createHubClient } from "@/hub/client"
import type { ManagedPersonalSkill, UpdateSkillDraftRequest } from "@/hub/schemas"
import { LocaleProvider } from "@/i18n/context"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { SkillsContent } from "@/ui/skills/skills-panel"

const headers = { "content-type": "application/json", "cache-control": "private, no-store", "x-request-id": "h01-ui-fixture" }
const listPath = "/api/hub/self/skills/managed?status=draft&limit=50"
const detailPath = "/api/hub/self/skills/managed/h01-draft"
const updatePath = "/api/hub/self/skills/h01-draft/draft"
const savedMessage = "草稿已保存并重新读取。"
const initialBoundary: ProjectReadBoundary = { admitted: true, subject: "h01-owner", tenant: "h01-tenant", generation: 1 }

function draft(): ManagedPersonalSkill {
  return {
    skill_id: "h01-draft", source_ref: "skill:h01-draft", series_id: "h01-series", revision: "1",
    name: "Fresh owner draft", summary: "Fresh summary", status: "draft",
    tags: ["one,comma", "second"], example_prompts: ["  多行\n第二行  ", "重复", "重复"],
    category_keys: ["programming", "data"], skill_updated_at: "2026-11-15T00:00:00Z",
    product: { state_version: "9007199254740993", publication_audience: "owner" },
  }
}

function response(data: unknown) { return new Response(JSON.stringify({ data }), { headers }) }
function managedResponse(data: unknown) { return new Response(JSON.stringify({ data, meta: { request_id: headers["x-request-id"] } }), { headers }) }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}

/** Only HTTP is replaced: the host, publish client, parsers and dialog are real. */
function transport() {
  const requests: { url: string; init: RequestInit | undefined }[] = []
  let current = draft()
  let detailReads = 0
  const api = {
    requests,
    detail: (read: number): Response | Promise<Response> => { void read; return managedResponse(current) },
    patch: (body: UpdateSkillDraftRequest): Response | Promise<Response> => {
      current = { ...current, name: body.metadata.display_name, summary: body.metadata.summary,
        tags: body.metadata.tags, example_prompts: body.metadata.example_prompts ?? current.example_prompts,
        category_keys: body.metadata.category_keys ?? current.category_keys,
        product: { ...current.product, state_version: "9007199254740998" } }
      return response({ skill: { ...current, package_phase: "valid" }, event_id: "h01-metadata-event", replayed: false })
    },
  }
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    requests.push({ url, init })
    if (url === "/api/hub/self/skills/pool") return response({ skills: [] })
    if (url === "/api/hub/self/skills/quota") return response({ namespace: "personal", package_count: 1, package_bytes: 3, max_packages: 10, max_bytes: 1024 })
    if (url === listPath) return managedResponse({ skills: [{ ...draft(), name: "Stale list draft", product: { ...draft().product, state_version: "9007199254740992" } }], next_cursor: null })
    if (url === detailPath && init?.method === "GET") return api.detail(++detailReads)
    if (url === updatePath && init?.method === "PATCH") return api.patch(JSON.parse(String(init.body)) as UpdateSkillDraftRequest)
    throw Error(`Unexpected draft UI request: ${init?.method ?? "GET"} ${url}`)
  }))
  return api
}
type Transport = ReturnType<typeof transport>
function writes(api: Transport) { return api.requests.filter(({ init }) => init?.method === "PATCH") }
function detailReads(api: Transport) { return api.requests.filter(({ url }) => url === detailPath) }
function host() {
  const client = createHubClient()
  const content = (boundary: ProjectReadBoundary) => <LocaleProvider><SkillsContent readBoundary={boundary} client={client} pinned={[]} onTogglePin={() => {}} embedded /></LocaleProvider>
  const view = render(content(initialBoundary))
  return { ...view, boundary: (boundary: ProjectReadBoundary) => view.rerender(content(boundary)) }
}
async function openDrafts() {
  await screen.findByRole("button", { name: "探索技能" })
  fireEvent.keyDown(screen.getByRole("button", { name: "添加" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "草稿" }))
  return screen.findByRole("dialog", { name: "编辑技能草稿" })
}
async function editDraft() {
  const dialog = await openDrafts()
  fireEvent.click(await within(dialog).findByRole("button", { name: "编辑草稿" }))
  await waitFor(() => expect(within(dialog).getByLabelText("技能名称")).toHaveValue("Fresh owner draft"))
  return dialog
}
function rename(dialog: HTMLElement, value = "Edited owner draft") {
  fireEvent.change(within(dialog).getByLabelText("技能名称"), { target: { value } })
}

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem("kokoro.locale", "zh")
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it("opens live Settings drafts and reads the selected revision fresh before admitting edits; cancel writes nothing", async () => {
  const api = transport(), pending = deferred<Response>()
  api.detail = () => pending.promise
  host()
  const dialog = await openDrafts()
  expect(api.requests.some(({ url }) => url === listPath)).toBe(true)
  fireEvent.click(await within(dialog).findByRole("button", { name: "编辑草稿" }))
  await waitFor(() => expect(detailReads(api)).toHaveLength(1))
  expect(within(dialog).queryByDisplayValue("Stale list draft")).toBeNull()
  const save = within(dialog).queryByRole("button", { name: "保存修改" })
  if (save) expect(save).toBeDisabled()
  await act(async () => { pending.resolve(managedResponse(draft())) })
  expect(within(dialog).getByLabelText("技能名称")).toHaveValue("Fresh owner draft")
  rename(dialog)
  fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }))
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "编辑技能草稿" })).toBeNull())
  expect(writes(api)).toHaveLength(0)
})

it("preserves array items, multiline and duplicate examples and signed64 CAS, and waits for fresh GET after the full ACK", async () => {
  const api = transport(), fresh = deferred<Response>()
  api.detail = read => read === 1 ? managedResponse(draft()) : fresh.promise
  host()
  const dialog = await editDraft()
  expect(within(dialog).getByLabelText("标签 1")).toHaveValue("one,comma")
  expect(within(dialog).getByLabelText("示例问题 1")).toHaveValue("  多行\n第二行  ")
  expect(within(dialog).getByRole("checkbox", { name: "编程" })).toBeChecked()
  expect(within(dialog).getByRole("checkbox", { name: "数据" })).toBeChecked()
  rename(dialog)
  fireEvent.change(within(dialog).getByLabelText("简介"), { target: { value: "Edited summary\nwith a second line" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存修改" }))
  await waitFor(() => expect(detailReads(api)).toHaveLength(2))
  expect(writes(api)).toHaveLength(1)
  expect(JSON.parse(String(writes(api)[0]!.init?.body))).toEqual({
    expected_state_version: "9007199254740993",
    metadata: { display_name: "Edited owner draft", summary: "Edited summary\nwith a second line",
      tags: draft().tags, example_prompts: draft().example_prompts, category_keys: draft().category_keys },
  })
  expect(new Headers(writes(api)[0]!.init?.headers).get("idempotency-key")).toBeTruthy()
  expect(within(dialog).queryByText(savedMessage)).toBeNull()
  const latest = { ...draft(), name: "Edited owner draft", summary: "Edited summary\nwith a second line", product: { ...draft().product, state_version: "9007199254740998" } }
  await act(async () => { fresh.resolve(managedResponse(latest)) })
  expect(await within(dialog).findByText(savedMessage)).toBeInTheDocument()
  expect(within(dialog).getByLabelText("技能名称")).toHaveValue("Edited owner draft")
})

it("recovers an acknowledged save whose refresh failed with GET only, never a second PATCH", async () => {
  const api = transport()
  const getCurrent = api.detail
  api.detail = read => {
    if (read === 2) throw new TypeError("Controlled ACK refresh failure")
    return getCurrent(read)
  }
  host()
  const dialog = await editDraft()
  rename(dialog)
  fireEvent.click(within(dialog).getByRole("button", { name: "保存修改" }))
  const reload = await within(dialog).findByRole("button", { name: "重新载入当前草稿" })
  expect(within(dialog).queryByText(savedMessage)).toBeNull()
  expect(writes(api)).toHaveLength(1)
  fireEvent.click(reload)
  expect(await within(dialog).findByText(savedMessage)).toBeInTheDocument()
  expect(detailReads(api)).toHaveLength(3)
  expect(writes(api)).toHaveLength(1)
})

it("keeps an unknown save's original key, bytes and CAS across a same-actor recheck before explicit retry", async () => {
  const api = transport(), acknowledge = api.patch
  const getCurrent = api.detail
  api.detail = read => read === 2
    ? managedResponse({ ...draft(), name: "Changed on server", product: { ...draft().product, state_version: "9007199254740996" } })
    : getCurrent(read)
  let attempts = 0
  api.patch = body => { if (++attempts === 1) throw new TypeError("Controlled lost ACK"); return acknowledge(body) }
  const view = host(), dialog = await editDraft()
  rename(dialog)
  fireEvent.click(within(dialog).getByRole("button", { name: "保存修改" }))
  await within(dialog).findByRole("button", { name: "重试原保存命令" })
  const original = writes(api)[0]!.init!
  view.boundary({ ...initialBoundary, admitted: false, generation: 2 })
  expect(writes(api)).toHaveLength(1)
  view.boundary({ ...initialBoundary, generation: 2 })
  const retry = await screen.findByRole("button", { name: "重试原保存命令" })
  await waitFor(() => expect(retry).toBeEnabled())
  fireEvent.click(retry)
  expect(await screen.findByText(savedMessage)).toBeInTheDocument()
  expect(writes(api)).toHaveLength(2)
  const retried = writes(api)[1]!.init!
  expect(retried.body).toBe(original.body)
  expect(new Headers(retried.headers).get("idempotency-key")).toBe(new Headers(original.headers).get("idempotency-key"))
  expect(JSON.parse(String(retried.body)).expected_state_version).toBe("9007199254740993")
})

it("retires a pending selected-draft read on close and rejects its late private content", async () => {
  const api = transport(), late = deferred<Response>()
  api.detail = () => late.promise
  host()
  const dialog = await openDrafts()
  fireEvent.click(await within(dialog).findByRole("button", { name: "编辑草稿" }))
  await waitFor(() => expect(detailReads(api)).toHaveLength(1))
  const signal = detailReads(api)[0]!.init?.signal
  fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }))
  await waitFor(() => expect(signal?.aborted).toBe(true))
  await act(async () => { late.resolve(managedResponse({ ...draft(), name: "Retired private draft" })) })
  expect(screen.queryByRole("dialog", { name: "编辑技能草稿" })).toBeNull()
  expect(screen.queryByDisplayValue("Retired private draft")).toBeNull()
  expect(writes(api)).toHaveLength(0)
})

it.each(["close", "subject", "tenant"] as const)("retires a pending save on %s without late ACK success or refresh", async key => {
  const api = transport(), late = deferred<Response>(), acknowledge = api.patch
  api.patch = () => late.promise
  const view = host(), dialog = await editDraft()
  rename(dialog)
  fireEvent.click(within(dialog).getByRole("button", { name: "保存修改" }))
  await waitFor(() => expect(writes(api)).toHaveLength(1))
  const command = writes(api)[0]!, signal = command.init?.signal
  if (key === "close") fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }))
  else view.boundary({ ...initialBoundary, [key]: "another-owner", generation: 2 })
  await waitFor(() => expect(signal?.aborted).toBe(true))
  const ack = await acknowledge(JSON.parse(String(command.init?.body)) as UpdateSkillDraftRequest)
  await act(async () => { late.resolve(ack) })
  expect(screen.queryByRole("dialog", { name: "编辑技能草稿" })).toBeNull()
  expect(screen.queryByText(savedMessage)).toBeNull()
  expect(screen.queryByDisplayValue("Edited owner draft")).toBeNull()
  expect(detailReads(api)).toHaveLength(1)
  expect(writes(api)).toHaveLength(1)
})
