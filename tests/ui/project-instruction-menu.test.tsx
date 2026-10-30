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
import { openCanvas, readCanvasState, resetCanvasStore } from "@/ui/canvas/canvas-store"
import { addConversation, type ConversationStore } from "@/core/conversations"

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

function mountProjectMenu(respond?: (path: string, init?: RequestInit) => Promise<Response | undefined>, listSessions?: ReturnType<typeof createFakeClient>["listSessions"]) {
  let projects = [{ ...projectA }, { ...projectB }]
  const writes: Array<{ path: string; body: unknown }> = []
  const fakeClient = createFakeClient()
  if (listSessions) fakeClient.listSessions = listSessions
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
  function Frame({ boundary = initialBoundary, enabled = true, implicit = false, previewMode = false, conversations = false, scopedEngines = false }: { scopedEngines?: boolean; conversations?: boolean; boundary?: typeof initialBoundary; enabled?: boolean; implicit?: boolean; previewMode?: boolean }) {
    const path = useSyncExternalStore(subscribeRoute, () => window.location.pathname)
    const projectRef = path.split("/").at(-1)
    return <ThemeProvider><LocaleProvider><AppFrame {...(scopedEngines ? {} : { engine })} preview={previewMode} chatHref="/app" projectWorkspace
      {...(projectRef === undefined ? {} : { projectRef })} emptyState={KokoroProjectWorkspace} projectReadBoundary={boundary}
      {...(implicit ? { featureFlags: [{ key: "workspace.instructions", enabled }] } : { workspaceCapabilities: { ...capabilities, instructions: enabled, projectConversations: conversations } })} /></LocaleProvider></ThemeProvider>
  }
  const view = render(<Frame />)
  return { ...view, writes, Frame }
}

async function headerMenu(project = projectA) {
  await screen.findByRole("heading", { name: project.name })
  const header = document.querySelector<HTMLElement>('[data-slot="workspace-header"]')!
  const trigger = within(header).getByRole("button", { name: "项目选项" })
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

it("侧栏查看指定项目后复用顶部指令 editor，取消回到同一个顶部菜单按钮", async () => {
  const view = mountProjectMenu()
  await screen.findByRole("heading", { name: projectA.name })
  const row = screen.getByRole("button", { name: projectB.name }).closest("[data-project-id]") as HTMLElement
  const trigger = within(row).getByRole("button", { name: "项目选项" })
  trigger.focus()
  fireEvent.keyDown(trigger, { key: "ArrowDown" })
  const menu = await screen.findByRole("menu", { name: "项目选项" })
  expect(within(menu).queryByRole("menuitem", { name: "编辑指令" })).not.toBeInTheDocument()
  fireEvent.click(within(menu).getByRole("menuitem", { name: "查看项目" }))
  const header = await headerMenu(projectB)
  fireEvent.click(within(header.menu).getByRole("menuitem", { name: "编辑指令" }))
  const dialog = await screen.findByRole("dialog", { name: "项目指令" })
  expect(window.location.pathname).toBe(`/app/project/${projectB.id}`)
  expect(within(dialog).getByRole("textbox")).toHaveValue(projectB.instruction)
  fireEvent.keyDown(within(dialog).getByRole("textbox"), { key: "Escape" })
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "项目指令" })).not.toBeInTheDocument())
  await waitFor(() => expect(header.trigger).toHaveFocus())
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
    const fallback = within(header).getByRole("button", { name: "项目选项" })
    const navigationTrigger = header.querySelector<HTMLButtonElement>('[data-web-navigation-trigger="true"]')!
    fireEvent.click(navigationTrigger)
    const row = (await screen.findByRole("button", { name: projectB.name })).closest("[data-project-id]") as HTMLElement
    fireEvent.keyDown(within(row).getByRole("button", { name: "项目选项" }), { key: "ArrowDown" })
    fireEvent.click(within(await screen.findByRole("menu", { name: "项目选项" })).getByRole("menuitem", { name: "查看项目" }))
    const targetHeader = await headerMenu(projectB)
    fireEvent.click(within(targetHeader.menu).getByRole("menuitem", { name: "编辑指令" }))
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


it("正式壳消费已解析 workspace.instructions 能力，未显式传 capabilities 也保留指令入口", async () => {
  const view = mountProjectMenu()
  view.rerender(<view.Frame implicit />)
  const { menu } = await headerMenu()
  expect(within(menu).getByRole("menuitem", { name: "编辑指令" })).toBeInTheDocument()
})


it("preview 顶部指令入口仍使用实际 projectRef，不把 href 当业务身份", async () => {
  const view = mountProjectMenu()
  window.localStorage.setItem(`kokoro.preview.project.${projectA.id}.instructions`, "本地原项目指令")
  view.rerender(<view.Frame previewMode />)
  const header = document.querySelector<HTMLElement>('[data-slot="workspace-header"]')!
  fireEvent.keyDown(within(header).getByRole("button", { name: "项目选项" }), { key: "ArrowDown" })
  fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "编辑指令" }))
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
  fireEvent.keyDown(within(header).getByRole("button", { name: "项目选项" }), { key: "ArrowDown" })
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


it("真实Frame的Project root到Task只有一个context/composer，设置不跳URL且Canvas草稿视图保挂载", async () => {
  let resolveTasks!: (page: Awaited<ReturnType<ReturnType<typeof createFakeClient>["listSessions"]>>) => void
  const tasks = new Promise<Awaited<ReturnType<ReturnType<typeof createFakeClient>["listSessions"]>>>(resolve => { resolveTasks = resolve })
  const view = mountProjectMenu(undefined, (_cursor, scope) => scope?.kind === "project" ? tasks : Promise.resolve({ sessions: [], next_cursor: null }))
  view.rerender(<view.Frame conversations />)
  await screen.findByRole("heading", { name: projectA.name })
  const context = document.querySelector('[data-project-context="true"]')
  await act(async () => { engine.submit("project task for context") })
  const activeId = engine.getSnapshot().store?.activeId
  expect(activeId).toBeTruthy()
  act(() => { history.pushState(null, "", `/app/project/${projectA.id}?conversation=${activeId}`); window.dispatchEvent(new Event("kokoro:surface-navigation")) })
  await waitFor(() => expect(document.querySelector('[data-slot="conversation-timeline"]')).not.toBeNull())
  expect(document.querySelector('[data-project-context="true"]')).toBe(context)
  expect(document.querySelectorAll('[data-project-context="true"]')).toHaveLength(1)
  expect(document.querySelectorAll('[data-slot="composer-wrap"]')).toHaveLength(1)
  const url = location.href
  act(() => { openCanvas(activeId!, { kind: "node", title: "Canvas draft", node: <input aria-label="Canvas unsaved field" defaultValue="initial" /> }) })
  const field = await screen.findByRole("textbox", { name: "Canvas unsaved field" })
  fireEvent.change(field, { target: { value: "retained unsaved Canvas view" } })
  const canvasState = readCanvasState()
  const trigger = within(document.querySelector<HTMLElement>('[data-slot="workspace-header"]')!).getByRole("button", { name: "项目选项" })
  fireEvent.keyDown(trigger, { key: "ArrowDown" })
  fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "项目设置" }))
  expect(await screen.findByRole("heading", { name: "项目设置" })).toBeVisible()
  expect(field).toBeInTheDocument()
  expect(field).not.toBeVisible()
  expect(readCanvasState()).toBe(canvasState)
  fireEvent.click(screen.getByRole("button", { name: "新增指令" }))
  const dialog = await screen.findByRole("dialog", { name: "项目指令" })
  fireEvent.keyDown(dialog, { key: "Escape" })
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(screen.getByRole("heading", { name: "项目设置" })).toBeVisible()
  expect(readCanvasState()).toBe(canvasState)
  fireEvent.click(screen.getByRole("button", { name: "关闭项目设置" }))
  await waitFor(() => expect(field).toBeVisible())
  expect(screen.getByRole("textbox", { name: "Canvas unsaved field" })).toBe(field)
  expect(field).toHaveValue("retained unsaved Canvas view")
  expect(readCanvasState()).toBe(canvasState)
  expect(location.href).toBe(url)
  expect(view.writes).toEqual([])
  act(() => resetCanvasStore())
  await act(async () => { resolveTasks({ sessions: [{ session_id: activeId!, title: "Retained context task", updated_at: "2026-10-01T00:00:00Z" }], next_cursor: null }) })
  for (let round = 0; round < 2; round++) {
    // The public Root link retains the engine's old activeId. The rail action
    // returns via syncConversationUrl, which intentionally emits no surface event.
    fireEvent.click(await screen.findByRole("link", { name: `新对话 · ${projectA.name}` }), { button: 0 })
    await waitFor(() => expect(location.search).toBe(""))
    expect(engine.getSnapshot().store?.activeId).toBe(activeId)
    const projectRail = screen.getByRole("navigation", { name: "项目会话" })
    fireEvent.click(await within(projectRail).findByRole("button", { name: "Retained context task" }))
    await waitFor(() => expect(location.href).toBe(url))
    expect(engine.getSnapshot().store?.activeId).toBe(activeId)
    const currentTrigger = within(document.querySelector<HTMLElement>('[data-slot="workspace-header"]')!).getByRole("button", { name: "项目选项" })
    fireEvent.keyDown(currentTrigger, { key: "ArrowDown" })
    fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "项目设置" }))
    expect(await screen.findByRole("heading", { name: "项目设置" })).toBeVisible()
    expect(document.querySelector('[data-project-context="true"]')).toBe(context)
    expect(document.querySelectorAll('[data-project-context="true"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-slot="composer-wrap"]')).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "关闭项目设置" }))
  }
  act(() => resetCanvasStore())
})


it("Task上下文中的未知指令关闭整个设置后仍原body/key，显式重试不改变会话URL", async () => {
  const submitted: Array<{ key: string | null; body: string }> = []
  mountProjectMenu(async (_path, init) => {
    if (init?.method !== "PATCH") return undefined
    submitted.push({ key: new Headers(init.headers).get("Idempotency-Key"), body: String(init.body) })
    if (submitted.length === 1) throw new TypeError("ACK lost")
    return undefined
  })
  await screen.findByRole("heading", { name: projectA.name })
  await act(async () => { engine.submit("another project task") })
  const id = engine.getSnapshot().store?.activeId
  act(() => { history.pushState(null, "", `/app/project/${projectA.id}?conversation=${id}`); window.dispatchEvent(new Event("kokoro:surface-navigation")) })
  await waitFor(() => expect(document.querySelector('[data-slot="conversation-timeline"]')).not.toBeNull())
  const url = location.href
  const edit = async () => {
    const trigger = within(document.querySelector<HTMLElement>('[data-slot="workspace-header"]')!).getByRole("button", { name: "项目选项" })
    fireEvent.keyDown(trigger, { key: "ArrowDown" })
    fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "编辑指令" }))
    return screen.findByRole("dialog", { name: "项目指令" })
  }
  let dialog = await edit()
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Task unknown instruction" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("操作结果尚未确认")
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
  fireEvent.click(screen.getByRole("button", { name: "关闭项目设置" }))
  dialog = await edit()
  expect(within(dialog).getByRole("textbox")).toHaveValue("Task unknown instruction")
  expect(within(dialog).getByRole("textbox")).toBeDisabled()
  expect(submitted).toHaveLength(1)
  fireEvent.click(within(dialog).getByRole("button", { name: "重试原操作" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(submitted).toHaveLength(2)
  expect(submitted[1]).toEqual(submitted[0])
  expect(location.href).toBe(url)
})

it("real Frame Root → retained Task retires the Root instruction intent without a synthetic navigation event", async () => {
  let resolveTasks!: (page: Awaited<ReturnType<ReturnType<typeof createFakeClient>["listSessions"]>>) => void
  const tasks = new Promise<Awaited<ReturnType<ReturnType<typeof createFakeClient>["listSessions"]>>>(resolve => { resolveTasks = resolve })
  const submitted: string[] = []
  const view = mountProjectMenu(async (_path, init) => {
    if (init?.method !== "PATCH") return undefined
    submitted.push(String(init.body))
    throw new TypeError("unknown Root write")
  }, (_cursor, scope) => scope?.kind === "project" ? tasks : Promise.resolve({ sessions: [], next_cursor: null }))
  view.rerender(<view.Frame conversations />)
  await screen.findByRole("heading", { name: projectA.name })
  await act(async () => { engine.submit("retained task") })
  const id = engine.getSnapshot().store!.activeId!
  await act(async () => { resolveTasks({ sessions: [{ session_id: id, title: "Root-return task", updated_at: "2026-10-01T00:00:00Z" }], next_cursor: null }) })
  fireEvent.click(await screen.findByRole("link", { name: `新对话 · ${projectA.name}` }), { button: 0 })
  await waitFor(() => expect(location.search).toBe(""))
  const { menu } = await headerMenu()
  fireEvent.click(within(menu).getByRole("menuitem", { name: "编辑指令" }))
  const dialog = await screen.findByRole("dialog", { name: "项目指令" })
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Root-only unknown body" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("操作结果尚未确认")
  fireEvent.keyDown(dialog, { key: "Escape" })
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  fireEvent.click(within(screen.getByRole("navigation", { name: "项目会话" })).getByRole("button", { name: "Root-return task" }))
  await waitFor(() => expect(location.search).toBe(`?conversation=${id}`))
  expect(engine.getSnapshot().store?.activeId).toBe(id)
  const trigger = within(document.querySelector<HTMLElement>('[data-slot="workspace-header"]')!).getByRole("button", { name: "项目选项" })
  fireEvent.keyDown(trigger, { key: "ArrowDown" })
  fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "编辑指令" }))
  const taskDialog = await screen.findByRole("dialog", { name: "项目指令" })
  expect(within(taskDialog).getByRole("textbox")).toBeEnabled()
  expect(within(taskDialog).getByRole("textbox")).toHaveValue(projectA.instruction)
  expect(submitted).toHaveLength(1)
})

it.each(["?conversation=task-b", "?conversation=task-a&view=other", "?conversation=task-a#other"])("an old instruction menu callback is retired by rendered full route %s without a surface event", destination => {
  const base = `/app/project/${projectA.id}`
  history.replaceState(null, "", `${base}?conversation=task-a`)
  const options: AppFrameProjectOptions = { projectRef: projectA.id, projectWorkspace: true, preview: false, mounted: true,
    draft: "", updateDraft: vi.fn(), clearDraft: vi.fn(), projectDetail: { status: "ready", data: projectA },
    instructionHistory: { status: "ready", data: [] }, instructionContext: {}, instructionsEnabled: true,
    refreshProject: vi.fn(), renameBoundary: initialBoundary, renameRouteKey: location.pathname + location.search + location.hash }
  const view = renderHook((props: AppFrameProjectOptions) => useAppFrameProject(props), { initialProps: options, wrapper: LocaleProvider })
  const old = view.result.current.requestProjectInstructions
  history.pushState(null, "", base + destination)
  act(() => old(projectA.id, null))
  expect(view.result.current.projectInstructionRequest).toBeUndefined()
  view.rerender({ ...options, renameRouteKey: location.pathname + location.search + location.hash })
  act(() => old(projectA.id, null))
  expect(view.result.current.projectInstructionRequest).toBeUndefined()
  act(() => view.result.current.requestProjectInstructions(projectA.id, null))
  expect(view.result.current.projectInstructionRequest?.isCurrent()).toBe(true)
})

it("侧栏真实右键删除B只在目标页打开现确认框，取消零DELETE并回到同一行按钮", async () => {
  const deleted: string[] = []
  mountProjectMenu(async (path, init) => { if (init?.method === "DELETE") deleted.push(path); return undefined })
  await screen.findByRole("heading", { name: projectA.name })
  const rowButton = screen.getByRole("button", { name: projectB.name })
  const row = rowButton.closest("[data-project-id]") as HTMLElement
  const trigger = within(row).getByRole("button", { name: "项目选项" })
  fireEvent.contextMenu(rowButton, { clientX: 120, clientY: 160 })
  fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "删除" }))
  const dialog = await screen.findByRole("dialog", { name: "删除项目" })
  expect(window.location.pathname).toBe(`/app/project/${projectB.id}`)
  expect(dialog).toHaveTextContent(projectB.name)
  expect(dialog).not.toHaveTextContent(projectA.name)
  expect(deleted).toEqual([])
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "删除项目" })).not.toBeInTheDocument())
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(deleted).toEqual([])
})

it("侧栏编辑项目复用B名称单字段表单，取消不改项目或指令并返回原行", async () => {
  const view = mountProjectMenu()
  await screen.findByRole("heading", { name: projectA.name })
  const row = screen.getByRole("button", { name: projectB.name }).closest("[data-project-id]") as HTMLElement
  const trigger = within(row).getByRole("button", { name: "项目选项" })
  fireEvent.keyDown(trigger, { key: "ArrowDown" })
  fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "编辑项目" }))
  const dialog = await screen.findByRole("dialog", { name: "重命名项目" })
  const input = within(dialog).getByRole("textbox", { name: "项目名称" })
  expect(input).toHaveValue(projectB.name)
  expect(within(dialog).getAllByRole("textbox")).toHaveLength(1)
  fireEvent.change(input, { target: { value: "未保存名称" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(view.writes).toEqual([])
  expect(screen.getByRole("heading", { name: projectB.name })).toBeInTheDocument()
})

it("652移动侧栏跨项目编辑取消后，首个返回A删除请求仍打开A确认且取消零写", async () => {
  const oldMatchMedia = window.matchMedia
  const oldWidth = window.innerWidth
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 652 })
  window.matchMedia = vi.fn((query: string) => ({ matches: /width/u.test(query), media: query, onchange: null,
    addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined,
    removeEventListener: () => undefined, dispatchEvent: () => false }))
  const deleted: string[] = []
  // Real per-project leases hydrate a remembered task after the target route first renders.
  const retainedA = createSessionEngine({ client: createFakeClient(), storage: createMemoryStorage<ConversationStore>(addConversation(null, "retained-a", 1000)), scope: { kind: "project", projectRef: projectA.id } })
  const retainedB = createSessionEngine({ client: createFakeClient(), storage: createMemoryStorage<ConversationStore>(addConversation(null, "retained-b", 1000)), scope: { kind: "project", projectRef: projectB.id } })
  try {
    vi.spyOn(pageClients, "browserEngine").mockImplementation(({ scope } = {}) => scope?.kind === "project" && scope.projectRef === projectB.id ? retainedB : retainedA)
    vi.spyOn(pageClients, "retainBrowserEngine").mockReturnValue(() => {})
    window.localStorage.setItem("kokoro.web.auth-index-subject", initialBoundary.subject)
    const view = mountProjectMenu(async (path, init) => { if (init?.method === "DELETE") deleted.push(path); return undefined })
    view.rerender(<view.Frame scopedEngines />)
    await screen.findByRole("heading", { name: projectA.name })
    const openSidebar = () => {
      const header = document.querySelector<HTMLElement>('[data-slot="workspace-header"]')!
      fireEvent.click(header.querySelector<HTMLButtonElement>('[data-web-navigation-trigger="true"]')!)
    }
    openSidebar()
    fireEvent.contextMenu(await screen.findByRole("button", { name: projectB.name }), { clientX: 140, clientY: 280 })
    fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "编辑项目" }))
    const rename = await screen.findByRole("dialog", { name: "重命名项目" })
    expect(window.location.pathname).toBe(`/app/project/${projectB.id}`)
    expect(window.location.hash).toBe("#rename")
    expect(within(rename).getByRole("textbox", { name: "项目名称" })).toHaveValue(projectB.name)
    fireEvent.click(within(rename).getByRole("button", { name: "取消" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "重命名项目" })).not.toBeInTheDocument())
    expect(window.location.hash).toBe("")
    expect(screen.getByRole("heading", { name: projectB.name })).toBeInTheDocument()
    const header = document.querySelector<HTMLElement>('[data-slot="workspace-header"]')!
    await waitFor(() => expect(within(header).getByRole("button", { name: "项目选项" })).toHaveFocus())
    openSidebar()
    fireEvent.contextMenu(await screen.findByRole("button", { name: projectA.name }), { clientX: 140, clientY: 240 })
    fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "删除" }))
    expect(window.location.pathname).toBe(`/app/project/${projectA.id}`)
    expect(window.location.search + window.location.hash).toBe("")
    const deletion = await screen.findByRole("dialog", { name: "删除项目" })
    expect(deletion).toHaveTextContent(projectA.name)
    expect(deletion).not.toHaveTextContent(projectB.name)
    expect(deleted).toEqual([])
    fireEvent.click(within(deletion).getByRole("button", { name: "取消" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "删除项目" })).not.toBeInTheDocument())
    expect(view.writes).toEqual([])
    expect(deleted).toEqual([])
    view.unmount()
  } finally {
    retainedA.dispose()
    retainedB.dispose()
    window.matchMedia = oldMatchMedia
    Object.defineProperty(window, "innerWidth", { configurable: true, value: oldWidth })
  }
})
