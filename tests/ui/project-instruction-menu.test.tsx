import { useSyncExternalStore, type ReactNode } from "react"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { AppFrame } from "@/components/blocks/app-frame/app-frame"
import { useAppFrameProject, type AppFrameProjectOptions } from "@/components/blocks/app-frame/use-app-frame-project"
import { KokoroProjectWorkspace } from "@/features/app/kokoro-project-workspace"
import { LocaleProvider } from "@/i18n/context"
import { ThemeProvider } from "@/ui/theme/theme-context"
import { createSessionEngine, type SessionEngine } from "@/engine/machine"
import { createFakeClient, createMemoryStorage } from "../engine/fakes"
import * as pageClients from "@/ui/shell/page-clients"
import type { ConversationStore } from "@/core/conversations"

const projectA = { id: "project_11111111-1111-1111-1111-111111111111", name: "项目甲", slug: "a", description: "", instruction: "甲的原指令", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }
const projectB = { ...projectA, id: "project_22222222-2222-2222-2222-222222222222", name: "项目乙", slug: "b", instruction: "乙的原指令" }
const capabilities = { instructions: true, connectors: false, resources: false, skills: false, projectConversations: false }
const initialBoundary = { admitted: true, subject: "reader-A", generation: 1 }
let engine: SessionEngine

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem("kokoro.locale", "zh")
  window.history.replaceState(null, "", `/app/project/${projectA.id}`)
})
afterEach(() => {
  cleanup()
  engine?.dispose()
  vi.restoreAllMocks()
  window.history.replaceState(null, "", "/app")
})

function subscribeRoute(notify: () => void) {
  window.addEventListener("kokoro:surface-navigation", notify)
  window.addEventListener("popstate", notify)
  return () => { window.removeEventListener("kokoro:surface-navigation", notify); window.removeEventListener("popstate", notify) }
}

function mountProjectMenu(respond?: (path: string, init?: RequestInit) => Promise<Response | undefined>) {
  let projects = [{ ...projectA }, { ...projectB }]
  const writes: Array<{ path: string; body: unknown }> = []
  const fakeClient = createFakeClient()
  engine = createSessionEngine({ client: fakeClient, storage: createMemoryStorage<ConversationStore>(null), now: () => 1_000 })
  vi.spyOn(pageClients, "browserListClient").mockReturnValue(fakeClient)
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname
    if (init?.method === "PATCH") writes.push({ path, body: JSON.parse(String(init.body)) as unknown })
    const response = await respond?.(path, init)
    if (response) return response
    if (path === "/api/hub/projects") return Response.json({ data: { projects }, meta: { request_id: "req_list" } })
    if (path.endsWith("/instruction-revisions")) return Response.json({ data: { items: [] }, meta: { request_id: "req_history" } })
    const project = projects.find((item) => path === `/api/hub/projects/${item.id}`)
    if (project) {
      if (init?.method === "PATCH") {
        const { instruction } = JSON.parse(String(init.body)) as { instruction: string }
        projects = projects.map((item) => item.id === project.id ? { ...item, instruction } : item)
      }
      return Response.json({ data: { project: projects.find((item) => item.id === project.id) }, meta: { request_id: "req_project" } })
    }
    return Response.json({}, { status: 503 })
  })
  function Frame({ boundary = initialBoundary, enabled = true, implicit = false, previewMode = false }: { boundary?: typeof initialBoundary; enabled?: boolean; implicit?: boolean; previewMode?: boolean }) {
    const path = useSyncExternalStore(subscribeRoute, () => window.location.pathname)
    const projectRef = path.split("/").at(-1)
    return <ThemeProvider><LocaleProvider><AppFrame engine={engine} preview={previewMode} chatHref="/app" projectWorkspace
      {...(projectRef === undefined ? {} : { projectRef })} emptyState={KokoroProjectWorkspace} projectReadBoundary={boundary}
      {...(implicit ? {} : { workspaceCapabilities: { ...capabilities, instructions: enabled } })} /></LocaleProvider></ThemeProvider>
  }
  const view = render(<Frame />)
  return { ...view, writes, Frame }
}

async function headerMenu() {
  await screen.findByRole("heading", { name: projectA.name })
  const header = document.querySelector<HTMLElement>('[data-slot="workspace-header"]')!
  const trigger = within(header).getByRole("button", { name: "更多设置分区" })
  trigger.focus()
  fireEvent.keyDown(trigger, { key: "ArrowDown" })
  return { trigger, menu: await screen.findByRole("menu") }
}

it("顶部菜单键盘打开同一项目指令 editor，取消零写入并回到原按钮", async () => {
  const view = mountProjectMenu()
  const { trigger, menu } = await headerMenu()
  fireEvent.click(within(menu).getByRole("menuitem", { name: "编辑指令" }))
  const dialog = await screen.findByRole("dialog", { name: "项目指令" })
  await waitFor(() => expect(within(dialog).getByRole("textbox", { name: "项目指令" })).toHaveFocus())
  expect(within(dialog).getByRole("textbox", { name: "项目指令" })).toHaveValue(projectA.instruction)
  fireEvent.change(within(dialog).getByRole("textbox", { name: "项目指令" }), { target: { value: "不保存的编辑" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "项目指令" })).not.toBeInTheDocument())
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(view.writes).toEqual([])
})

it("顶部编辑保存使用现 PATCH 并以 owner 回读作为重开内容", async () => {
  const view = mountProjectMenu()
  const { menu } = await headerMenu()
  fireEvent.click(within(menu).getByRole("menuitem", { name: "编辑指令" }))
  const dialog = await screen.findByRole("dialog", { name: "项目指令" })
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "甲的正式更新" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "项目指令" })).not.toBeInTheDocument())
  expect(view.writes).toEqual([{ path: `/api/hub/projects/${projectA.id}`, body: { instruction: "甲的正式更新" } }])
  const reopened = await headerMenu()
  fireEvent.click(within(reopened.menu).getByRole("menuitem", { name: "编辑指令" }))
  expect(await screen.findByRole("textbox", { name: "项目指令" })).toHaveValue("甲的正式更新")
})

it("侧栏键盘入口切到指定项目再复用 editor，取消回到同一个项目菜单按钮", async () => {
  const view = mountProjectMenu()
  await screen.findByRole("heading", { name: projectA.name })
  const row = screen.getByRole("button", { name: projectB.name }).closest("[data-project-id]") as HTMLElement
  const trigger = within(row).getByRole("button", { name: "项目选项" })
  trigger.focus()
  fireEvent.keyDown(trigger, { key: "ArrowDown" })
  const menu = await screen.findByRole("menu", { name: "项目选项" })
  fireEvent.click(within(menu).getByRole("menuitem", { name: "编辑指令" }))
  const dialog = await screen.findByRole("dialog", { name: "项目指令" })
  expect(window.location.pathname).toBe(`/app/project/${projectB.id}`)
  expect(within(dialog).getByRole("textbox")).toHaveValue(projectB.instruction)
  fireEvent.keyDown(within(dialog).getByRole("textbox"), { key: "Escape" })
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "项目指令" })).not.toBeInTheDocument())
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(view.writes).toEqual([])
})

it.each([403, 500])("PATCH %s 保持编辑原文并呈现失败，不报保存成功", async (status) => {
  const view = mountProjectMenu(async (_path, init) => init?.method === "PATCH" ? Response.json({}, { status }) : undefined)
  const { menu } = await headerMenu()
  fireEvent.click(within(menu).getByRole("menuitem", { name: "编辑指令" }))
  const dialog = await screen.findByRole("dialog", { name: "项目指令" })
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "保留失败原文" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(status === 500 ? "操作结果尚未确认" : "无权执行此操作")
  expect(within(dialog).getByRole("textbox")).toBeDisabled()
  expect(within(dialog).getByRole("textbox")).toHaveValue("保留失败原文")
  expect(view.writes).toHaveLength(1)
})

it("reverification 关闭旧 editor，actor 更换后不恢复旧请求或旧焦点", async () => {
  const view = mountProjectMenu()
  const { trigger, menu } = await headerMenu()
  fireEvent.click(within(menu).getByRole("menuitem", { name: "编辑指令" }))
  const editor = await screen.findByRole("textbox", { name: "项目指令" })
  fireEvent.change(editor, { target: { value: "旧身份草稿" } })
  view.rerender(<view.Frame boundary={{ admitted: false, subject: "reader-A", generation: 2 }} />)
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "项目指令" })).not.toBeInTheDocument())
  expect(trigger).not.toHaveFocus()
  view.rerender(<view.Frame boundary={{ admitted: true, subject: "reader-B", generation: 3 }} />)
  await screen.findByRole("heading", { name: projectA.name })
  expect(screen.queryByRole("dialog", { name: "项目指令" })).not.toBeInTheDocument()
  const reopened = await headerMenu()
  fireEvent.click(within(reopened.menu).getByRole("menuitem", { name: "编辑指令" }))
  expect(await screen.findByRole("textbox", { name: "项目指令" })).toHaveValue(projectA.instruction)
  expect(view.writes).toEqual([])
})

it("未发布指令能力时顶部和侧栏菜单均不暴露该入口", async () => {
  const view = mountProjectMenu()
  view.rerender(<view.Frame enabled={false} />)
  const { menu } = await headerMenu()
  expect(within(menu).queryByRole("menuitem", { name: "编辑指令" })).not.toBeInTheDocument()
  fireEvent.keyDown(menu, { key: "Escape" })
  const row = screen.getByRole("button", { name: projectB.name }).closest("[data-project-id]") as HTMLElement
  fireEvent.keyDown(within(row).getByRole("button", { name: "项目选项" }), { key: "ArrowDown" })
  expect(within(await screen.findByRole("menu", { name: "项目选项" })).queryByRole("menuitem", { name: "编辑指令" })).not.toBeInTheDocument()
})

it("保存待决时锁定 editor 和关闭动作，重复点击不发第二次 PATCH", async () => {
  let finish: (() => void) | undefined
  const pending = new Promise<Response>((resolve) => { finish = () => resolve(Response.json({ data: { project: projectA }, meta: { request_id: "req_pending" } })) })
  const view = mountProjectMenu(async (_path, init) => init?.method === "PATCH" ? pending : undefined)
  const { menu } = await headerMenu()
  fireEvent.click(within(menu).getByRole("menuitem", { name: "编辑指令" }))
  const dialog = await screen.findByRole("dialog", { name: "项目指令" })
  const save = within(dialog).getByRole("button", { name: "保存" })
  fireEvent.click(save)
  fireEvent.click(save)
  expect(within(dialog).getByRole("textbox")).toBeDisabled()
  expect(within(dialog).getByRole("button", { name: "取消" })).toBeDisabled()
  fireEvent.keyDown(within(dialog).getByRole("textbox"), { key: "Escape" })
  expect(screen.getByRole("dialog", { name: "项目指令" })).toBeInTheDocument()
  await waitFor(() => expect(view.writes).toHaveLength(1))
  await act(async () => finish?.())
})

it("移动侧栏关闭后 editor 仍可编辑，取消返回仍可见的顶部菜单按钮", async () => {
  const oldMatchMedia = window.matchMedia
  const oldWidth = window.innerWidth
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 })
  window.matchMedia = vi.fn((query: string) => ({ matches: /width/u.test(query), media: query, onchange: null,
    addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined,
    removeEventListener: () => undefined, dispatchEvent: () => false }))
  try {
    mountProjectMenu()
    await screen.findByRole("heading", { name: projectA.name })
    const header = document.querySelector<HTMLElement>('[data-slot="workspace-header"]')!
    const fallback = within(header).getByRole("button", { name: "更多设置分区" })
    const navigationTrigger = header.querySelector<HTMLButtonElement>('[data-web-navigation-trigger="true"]')!
    fireEvent.click(navigationTrigger)
    const row = (await screen.findByRole("button", { name: projectB.name })).closest("[data-project-id]") as HTMLElement
    fireEvent.keyDown(within(row).getByRole("button", { name: "项目选项" }), { key: "ArrowDown" })
    fireEvent.click(within(await screen.findByRole("menu", { name: "项目选项" })).getByRole("menuitem", { name: "编辑指令" }))
    const dialog = await screen.findByRole("dialog", { name: "项目指令" })
    expect(within(dialog).getByRole("textbox")).toHaveValue(projectB.instruction)
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
    await waitFor(() => expect(fallback).toHaveFocus())
  } finally {
    window.matchMedia = oldMatchMedia
    Object.defineProperty(window, "innerWidth", { configurable: true, value: oldWidth })
  }
})


it("跨项目请求等到 exact target 的 owner GET ready；error/错误身份投影均不打开当前项目", () => {
  const context = {}
  const options: AppFrameProjectOptions = {
    projectRef: projectA.id, projectWorkspace: true, preview: false, mounted: true, draft: "",
    updateDraft: vi.fn(), clearDraft: vi.fn(), projectDetail: { status: "ready", data: projectA },
    instructionHistory: { status: "ready", data: [] }, instructionContext: context, instructionsEnabled: true,
    refreshProject: vi.fn(), renameBoundary: initialBoundary,
  }
  const view = renderHook((props: AppFrameProjectOptions) => useAppFrameProject(props), { initialProps: options, wrapper: ({ children }: { children: ReactNode }) => <LocaleProvider>{children}</LocaleProvider> })
  act(() => view.result.current.requestProjectInstructions(projectB.id, null))
  expect(view.result.current.projectInstructionRequest).toBeUndefined()
  expect(window.location.pathname).toBe(`/app/project/${projectB.id}`)
  for (const projectDetail of [{ status: "loading" }, { status: "error", retryable: false }, { status: "ready", data: projectA }] as const) {
    view.rerender({ ...options, projectRef: projectB.id, projectDetail })
    expect(view.result.current.projectInstructionRequest).toBeUndefined()
    expect(view.result.current.projectInstruction.available).toBe(false)
  }
  view.rerender({ ...options, projectRef: projectB.id, projectDetail: { status: "ready", data: projectB } })
  expect(view.result.current.projectInstructionRequest?.projectRef).toBe(projectB.id)
  expect(view.result.current.projectInstructions).toBe(projectB.instruction)
})

it("未决菜单请求在离开目标路由或换actor后退休，A→B→A不复活", () => {
  const options: AppFrameProjectOptions = {
    projectRef: projectA.id, projectWorkspace: true, preview: false, mounted: true, draft: "",
    updateDraft: vi.fn(), clearDraft: vi.fn(), projectDetail: { status: "loading" },
    instructionHistory: { status: "loading" }, instructionContext: {}, instructionsEnabled: true,
    refreshProject: vi.fn(), renameBoundary: initialBoundary,
  }
  const view = renderHook((props: AppFrameProjectOptions) => useAppFrameProject(props), { initialProps: options, wrapper: ({ children }: { children: ReactNode }) => <LocaleProvider>{children}</LocaleProvider> })
  act(() => view.result.current.requestProjectInstructions(projectB.id, null))
  act(() => { window.history.pushState(null, "", "/app"); window.dispatchEvent(new Event("kokoro:surface-navigation")) })
  act(() => { window.history.pushState(null, "", `/app/project/${projectB.id}`); window.dispatchEvent(new Event("kokoro:surface-navigation")) })
  view.rerender({ ...options, projectRef: projectB.id, projectDetail: { status: "ready", data: projectB } })
  expect(view.result.current.projectInstructionRequest).toBeUndefined()
  act(() => view.result.current.requestProjectInstructions(projectB.id, null))
  const old = view.result.current.projectInstructionRequest
  expect(old?.isCurrent()).toBe(true)
  view.rerender({ ...options, projectRef: projectB.id, projectDetail: { status: "ready", data: projectB },
    renameBoundary: { admitted: true, subject: "reader-B", generation: 2 } })
  expect(view.result.current.projectInstructionRequest).toBeUndefined()
  expect(old?.isCurrent()).toBe(false)
  view.rerender({ ...options, projectRef: projectB.id, projectDetail: { status: "ready", data: projectB } })
  expect(view.result.current.projectInstructionRequest).toBeUndefined()
})


it("正式壳默认能力与 workspace 使用同一投影，未显式传 capabilities 也保留指令入口", async () => {
  const view = mountProjectMenu()
  view.rerender(<view.Frame implicit />)
  const { menu } = await headerMenu()
  expect(within(menu).getByRole("menuitem", { name: "编辑指令" })).toBeInTheDocument()
})


it("preview 路由快捷项目仍把实际 projectRef 交给 editor，不把 href 当业务身份", async () => {
  const view = mountProjectMenu()
  window.localStorage.setItem(`kokoro.preview.project.${projectA.id}.instructions`, "本地原项目指令")
  view.rerender(<view.Frame previewMode />)
  const row = await screen.findByRole("button", { name: "当前项目" })
  const trigger = within(row.closest("[data-project-id]") as HTMLElement).getByRole("button", { name: "项目选项" })
  fireEvent.keyDown(trigger, { key: "ArrowDown" })
  fireEvent.click(within(await screen.findByRole("menu", { name: "项目选项" })).getByRole("menuitem", { name: "编辑指令" }))
  expect(window.location.pathname).toBe(`/app/project/${projectA.id}`)
  expect(await screen.findByRole("textbox", { name: "项目指令" })).toHaveValue("本地原项目指令")
})


it("指令 PATCH 回执丢失后冻结原文，关闭重开只显式重试原 key/body", async () => {
  const submitted: Array<{ key: string | null; body: string }> = []
  const view = mountProjectMenu(async (_path, init) => {
    if (init?.method !== "PATCH") return undefined
    submitted.push({ key: new Headers(init.headers).get("Idempotency-Key"), body: String(init.body) })
    if (submitted.length === 1) throw new TypeError("ACK lost after owner commit")
    return undefined
  })
  const { menu } = await headerMenu()
  fireEvent.click(within(menu).getByRole("menuitem", { name: "编辑指令" }))
  let dialog = await screen.findByRole("dialog", { name: "项目指令" })
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "冻结的未知指令" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("操作结果尚未确认")
  expect(within(dialog).getByRole("textbox")).toBeDisabled()
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
  const reopen = await headerMenu()
  fireEvent.click(within(reopen.menu).getByRole("menuitem", { name: "编辑指令" }))
  dialog = await screen.findByRole("dialog", { name: "项目指令" })
  expect(within(dialog).getByRole("textbox")).toHaveValue("冻结的未知指令")
  expect(within(dialog).getByRole("textbox")).toBeDisabled()
  expect(view.writes).toHaveLength(1)
  fireEvent.click(within(dialog).getByRole("button", { name: "重试原操作" }))
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "项目指令" })).not.toBeInTheDocument())
  expect(submitted).toHaveLength(2)
  expect(submitted[1]).toEqual(submitted[0])
})

it("指令 PATCH 已 ACK 后权威回读失败保持锁定，恢复仅 GET 不再 PATCH", async () => {
  let acknowledged = false
  let failRead = true
  const view = mountProjectMenu(async (path, init) => {
    if (init?.method === "PATCH") {
      acknowledged = true
      return Response.json({ data: { project: { ...projectA, instruction: "ACK 指令" } }, meta: { request_id: "req_ack" } })
    }
    if (acknowledged && path === `/api/hub/projects/${projectA.id}`) {
      if (failRead) return Response.json({}, { status: 503 })
      return Response.json({ data: { project: { ...projectA, instruction: "ACK 指令" } }, meta: { request_id: "req_fresh" } })
    }
    return undefined
  })
  const { menu } = await headerMenu()
  fireEvent.click(within(menu).getByRole("menuitem", { name: "编辑指令" }))
  const dialog = await screen.findByRole("dialog", { name: "项目指令" })
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "ACK 指令" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("操作已确认，但读取失败")
  expect(within(dialog).getByRole("textbox")).toBeDisabled()
  expect(view.writes).toHaveLength(1)
  failRead = false
  fireEvent.click(within(dialog).getByRole("button", { name: "重新读取" }))
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "项目指令" })).not.toBeInTheDocument())
  expect(view.writes).toHaveLength(1)
})


it.each([400, 404])("指令确定拒绝 %s 解锁编辑，后续保存是新的明确意图", async (status) => {
  const keys: Array<string | null> = []
  const view = mountProjectMenu(async (_path, init) => {
    if (init?.method !== "PATCH") return undefined
    keys.push(new Headers(init.headers).get("Idempotency-Key"))
    return keys.length === 1 ? Response.json({}, { status }) : undefined
  })
  const { menu } = await headerMenu()
  fireEvent.click(within(menu).getByRole("menuitem", { name: "编辑指令" }))
  const dialog = await screen.findByRole("dialog", { name: "项目指令" })
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "被拒绝的指令" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("保存失败")
  expect(within(dialog).getByRole("textbox")).toBeEnabled()
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "新的明确指令" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "项目指令" })).not.toBeInTheDocument())
  expect(view.writes).toHaveLength(2)
  expect(keys[1]).not.toEqual(keys[0])
  expect(view.writes[1]?.body).toEqual({ instruction: "新的明确指令" })
})

it("指令未知意图在换项目后退休，迟到 ACK 不为新项目读取或关闭 editor", async () => {
  let settle: ((value: Response) => void) | undefined
  const response = new Promise<Response>((resolve) => { settle = resolve })
  const reads: string[] = []
  const view = mountProjectMenu(async (path, init) => {
    if (init?.method === "PATCH") return response
    reads.push(path)
    return undefined
  })
  const { menu } = await headerMenu()
  fireEvent.click(within(menu).getByRole("menuitem", { name: "编辑指令" }))
  const dialog = await screen.findByRole("dialog", { name: "项目指令" })
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "旧项目保存" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  await waitFor(() => expect(view.writes).toHaveLength(1))
  act(() => { window.history.pushState(null, "", `/app/project/${projectB.id}`); window.dispatchEvent(new Event("kokoro:surface-navigation")) })
  await screen.findByRole("heading", { name: projectB.name })
  const header = document.querySelector<HTMLElement>('[data-slot="workspace-header"]')!
  fireEvent.keyDown(within(header).getByRole("button", { name: "更多设置分区" }), { key: "ArrowDown" })
  fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "编辑指令" }))
  const next = await screen.findByRole("dialog", { name: "项目指令" })
  const readCount = reads.length
  await act(async () => { settle?.(Response.json({ data: { project: { ...projectA, instruction: "旧项目保存" } }, meta: { request_id: "req_late" } })); await Promise.resolve() })
  expect(reads).toHaveLength(readCount)
  expect(next).toBeInTheDocument()
  expect(within(next).getByRole("textbox")).toHaveValue(projectB.instruction)
  expect(within(next).getByRole("textbox")).toBeEnabled()
})


it("指令 unknown 在实际路由退休后清退 editor，返回同 Project 不复活旧意图", async () => {
  const submitted: Array<string | null> = []
  mountProjectMenu(async (_path, init) => {
    if (init?.method !== "PATCH") return undefined
    submitted.push(new Headers(init.headers).get("Idempotency-Key"))
    if (submitted.length === 1) throw new TypeError("lost ACK")
    return undefined
  })
  const { menu } = await headerMenu()
  fireEvent.click(within(menu).getByRole("menuitem", { name: "编辑指令" }))
  let dialog = await screen.findByRole("dialog", { name: "项目指令" })
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "旧路由意图" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("操作结果尚未确认")
  act(() => { window.history.pushState(null, "", `${window.location.pathname}#other`); window.dispatchEvent(new Event("kokoro:surface-navigation")) })
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "项目指令" })).not.toBeInTheDocument())
  act(() => { window.history.pushState(null, "", `/app/project/${projectA.id}`); window.dispatchEvent(new Event("kokoro:surface-navigation")) })
  const reopened = await headerMenu()
  fireEvent.click(within(reopened.menu).getByRole("menuitem", { name: "编辑指令" }))
  dialog = await screen.findByRole("dialog", { name: "项目指令" })
  expect(within(dialog).getByRole("textbox")).toHaveValue(projectA.instruction)
  expect(within(dialog).getByRole("textbox")).toBeEnabled()
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "返回后新的明确意图" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "项目指令" })).not.toBeInTheDocument())
  expect(submitted).toHaveLength(2)
  expect(submitted[1]).not.toEqual(submitted[0])
})


it.each([409, 429, 503, "invalid_ack"] as const)("指令 %s 不推断未写入，恢复沿原 key/body", async (failure) => {
  const submitted: Array<{ key: string | null; body: string }> = []
  mountProjectMenu(async (_path, init) => {
    if (init?.method !== "PATCH") return undefined
    submitted.push({ key: new Headers(init.headers).get("Idempotency-Key"), body: String(init.body) })
    if (submitted.length === 1) return failure === "invalid_ack" ? Response.json({ invalid: true })
      : Response.json({ error: { code: failure === 409 ? "idempotency_in_progress" : "service_unavailable" } }, { status: failure })
    return undefined
  })
  const { menu } = await headerMenu()
  fireEvent.click(within(menu).getByRole("menuitem", { name: "编辑指令" }))
  const dialog = await screen.findByRole("dialog", { name: "项目指令" })
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "不确定的指令" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("操作结果尚未确认")
  expect(within(dialog).getByRole("textbox")).toBeDisabled()
  fireEvent.click(within(dialog).getByRole("button", { name: "重试原操作" }))
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "项目指令" })).not.toBeInTheDocument())
  expect(submitted).toHaveLength(2)
  expect(submitted[1]).toEqual(submitted[0])
})
