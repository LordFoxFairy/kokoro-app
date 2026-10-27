import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { KokoroProjectWorkspace } from "@/features/app/kokoro-project-workspace"
import { useAppFrameProject, type AppFrameProjectOptions } from "@/components/blocks/app-frame/use-app-frame-project"
import { LocaleProvider } from "@/i18n/context"

const capabilities = { instructions: true, resources: true, connectors: true, skills: true, projectConversations: true }
const project = { id: "project_context", name: "Context", slug: "context", description: "", instruction: "owner instruction", created_at: "now", updated_at: "now" }
beforeEach(() => { localStorage.setItem("kokoro.locale", "zh"); history.replaceState(null, "", "/app/project/project_context?conversation=conversation_one") })
afterEach(() => { cleanup(); vi.restoreAllMocks(); history.replaceState(null, "", "/app") })

it("one persistent Project host renders Task content without root history/grid and keeps the context editor across presentation close", () => {
  const props = { preview: true, onPrompt: vi.fn(), workspaceCapabilities: capabilities, composer: <div data-testid="composer">one composer</div>,
    projectConversationContent: <div data-testid="timeline">actual task timeline</div>, projectContextVisible: true }
  const view = render(<LocaleProvider><KokoroProjectWorkspace {...props} /></LocaleProvider>)
  expect(screen.getByTestId("timeline")).toBeVisible()
  expect(screen.queryByRole("region", { name: /最近|项目会话/ })).not.toBeInTheDocument()
  expect(screen.queryByTestId("composer")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "新增指令" }))
  fireEvent.change(screen.getByRole("textbox", { name: "项目指令" }), { target: { value: "unsaved document-local instruction" } })
  view.rerender(<LocaleProvider><KokoroProjectWorkspace {...props} projectContextVisible={false} /></LocaleProvider>)
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  view.rerender(<LocaleProvider><KokoroProjectWorkspace {...props} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "新增指令" }))
  expect(screen.getByRole("textbox", { name: "项目指令" })).toHaveValue("unsaved document-local instruction")
  expect(screen.getAllByTestId("timeline")).toHaveLength(1)
  expect(location.search).toBe("?conversation=conversation_one")
})

it("current Project instruction handoff preserves Task URL and is invalid after actual route retirement", () => {
  const options: AppFrameProjectOptions = { projectRef: project.id, projectWorkspace: true, preview: false, mounted: true, draft: "", updateDraft: vi.fn(), clearDraft: vi.fn(),
    projectDetail: { status: "ready", data: project }, instructionHistory: { status: "ready", data: [] }, instructionContext: {}, instructionsEnabled: true,
    refreshProject: vi.fn(), renameBoundary: { admitted: true, subject: "actor", generation: 1 } }
  const view = renderHook(() => useAppFrameProject(options), { wrapper: LocaleProvider })
  act(() => view.result.current.requestProjectInstructions(project.id, null))
  expect(location.href).toContain("?conversation=conversation_one")
  const request = view.result.current.projectInstructionRequest
  expect(request?.isCurrent()).toBe(true)
  act(() => { history.pushState(null, "", "/app/project/project_context?conversation=conversation_two"); window.dispatchEvent(new Event("kokoro:surface-navigation")) })
  expect(request?.isCurrent()).toBe(false)
})


it.each(["actor", "project"])("Project context retained callback is retired by %s replacement", change => {
  const options: AppFrameProjectOptions = { projectRef: project.id, projectWorkspace: true, preview: false, mounted: true, draft: "", updateDraft: vi.fn(), clearDraft: vi.fn(),
    projectDetail: { status: "ready", data: project }, instructionHistory: { status: "ready", data: [] }, instructionContext: {}, instructionsEnabled: true, contextEnabled: true,
    refreshProject: vi.fn(), renameBoundary: { admitted: true, subject: "actor", generation: 1 } }
  const view = renderHook((props: AppFrameProjectOptions) => useAppFrameProject(props), { initialProps: options, wrapper: LocaleProvider })
  const retained = view.result.current.projectContext.onOpen
  const request = view.result.current.requestProjectInstructions
  view.rerender(change === "actor" ? { ...options, renameBoundary: { admitted: true, subject: "other", generation: 2 } } : { ...options, projectRef: "other_project", projectDetail: { status: "ready", data: { ...project, id: "other_project" } } })
  act(() => { retained(null); request(project.id, null) })
  expect(view.result.current.projectContext.open).toBe(false)
  expect(view.result.current.projectInstructionRequest).toBeUndefined()
})

it("a pristine context opens the newly admitted owner instruction rather than the initial loading placeholder", () => {
  const props = { preview: false, projectRef: project.id, onPrompt: vi.fn(), workspaceCapabilities: { ...capabilities, resources: false, connectors: false, skills: false },
    projectReadBoundary: { admitted: true, subject: "actor", generation: 1 }, projectConversationContent: <div>task</div>, projectContextVisible: true }
  const view = render(<LocaleProvider><KokoroProjectWorkspace {...props} projectDetail={{ status: "loading" }} projectInstructions="" /></LocaleProvider>)
  view.rerender(<LocaleProvider><KokoroProjectWorkspace {...props} projectDetail={{ status: "ready", data: project }} projectInstructions={project.instruction} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "新增指令" }))
  expect(screen.getByRole("textbox", { name: "项目指令" })).toHaveValue(project.instruction)
  fireEvent.change(screen.getByRole("textbox", { name: "项目指令" }), { target: { value: "already edited local body" } })
  view.rerender(<LocaleProvider><KokoroProjectWorkspace {...props} projectDetail={{ status: "ready", data: project }} projectInstructions="later owner read" /></LocaleProvider>)
  expect(screen.getByRole("textbox", { name: "项目指令" })).toHaveValue("already edited local body")
})

it.each(["current", "hide-reopen", "actor", "route"])("queued Upload chooser is retired by %s before the animation frame", change => {
  let id = 0
  const frames = new Map<number, FrameRequestCallback>()
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { frames.set(++id, callback); return id })
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(key => { frames.delete(key) })
  const chooser = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined)
  const props = { preview: false, projectRef: project.id, onPrompt: vi.fn(), workspaceCapabilities: { ...capabilities, instructions: false, skills: false, connectors: false },
    projectReadBoundary: { admitted: true, subject: "actor", generation: 1 }, projectDetail: { status: "ready" as const, data: project },
    onListProjectResources: vi.fn().mockResolvedValue({ items: [], nextCursor: null }), projectConversationContent: <div>Task timeline</div>, projectContextVisible: true }
  const view = render(<LocaleProvider><KokoroProjectWorkspace {...props} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "上传" }))
  expect(screen.getByRole("dialog", { name: "文件和资源" })).toBeInTheDocument()
  if (change === "hide-reopen") {
    view.rerender(<LocaleProvider><KokoroProjectWorkspace {...props} projectContextVisible={false} /></LocaleProvider>)
    view.rerender(<LocaleProvider><KokoroProjectWorkspace {...props} /></LocaleProvider>)
  } else if (change === "actor") {
    view.rerender(<LocaleProvider><KokoroProjectWorkspace {...props} projectReadBoundary={{ admitted: true, subject: "other", generation: 2 }} /></LocaleProvider>)
  } else if (change === "route") {
    act(() => { history.pushState(null, "", "/app/project/project_context?conversation=other-task"); window.dispatchEvent(new Event("kokoro:surface-navigation")) })
  }
  // Opening the ordinary resource dialog is not permission to resume an old chooser request.
  if (!screen.queryByRole("dialog", { name: "文件和资源" })) fireEvent.click(screen.getByRole("button", { name: /文件和资源/ }))
  act(() => { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(performance.now()) })
  expect(chooser).toHaveBeenCalledTimes(change === "current" ? 1 : 0)
})

it.each(["loading", "error"] as const)("history %s is quiet and not a fake empty history or an unavailable instruction body", status => {
  const props = { preview: false, projectRef: project.id, onPrompt: vi.fn(), workspaceCapabilities: { ...capabilities, resources: false, skills: false, connectors: false },
    projectReadBoundary: { admitted: true, subject: "actor", generation: 1 }, projectDetail: { status: "ready" as const, data: project },
    projectHistoryStatus: status, projectHistoryRetryable: true, onRetryProjectRead: vi.fn(), projectInstructions: project.instruction,
    projectConversationContent: <div>Task timeline</div>, projectContextVisible: true }
  const view = render(<LocaleProvider><KokoroProjectWorkspace {...props} /></LocaleProvider>)
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "新增指令" }))
  expect(screen.getByRole("textbox", { name: "项目指令" })).toHaveValue(project.instruction)
  expect(screen.getByRole("button", { name: "历史记录" })).toBeDisabled()
  view.rerender(<LocaleProvider><KokoroProjectWorkspace {...props} projectDetail={{ status: "error", retryable: true }} /></LocaleProvider>)
  expect(screen.getByRole("button", { name: "新增指令" })).toBeDisabled()
})


it("a hidden context DOM action cannot refresh resources before its presentation guard", async () => {
  const list = vi.fn().mockResolvedValue({ items: [], nextCursor: null })
  const props = { preview: false, projectRef: project.id, onPrompt: vi.fn(), workspaceCapabilities: { ...capabilities, instructions: false, skills: false, connectors: false },
    projectReadBoundary: { admitted: true, subject: "actor", generation: 1 }, projectDetail: { status: "ready" as const, data: project },
    onListProjectResources: list, projectConversationContent: <div>Task timeline</div>, projectContextVisible: true }
  const view = render(<LocaleProvider><KokoroProjectWorkspace {...props} /></LocaleProvider>)
  const opener = screen.getByRole("button", { name: /文件和资源/ })
  fireEvent.click(opener)
  const dialog = screen.getByRole("dialog", { name: "文件和资源" })
  await waitFor(() => expect(dialog).toHaveAttribute("aria-busy", "false"))
  expect(list).toHaveBeenCalledTimes(1)
  fireEvent.keyDown(dialog, { key: "Escape" })
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  view.rerender(<LocaleProvider><KokoroProjectWorkspace {...props} projectContextVisible={false} /></LocaleProvider>)
  fireEvent.click(opener)
  await act(async () => { await Promise.resolve() })
  expect(list).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
})
