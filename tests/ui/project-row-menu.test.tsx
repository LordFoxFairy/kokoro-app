import type { ReactNode } from "react"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { WorkspaceRail } from "@/components/blocks/workspace-rail/workspace-rail"
import { useAppFrameProject, type AppFrameProjectOptions } from "@/components/blocks/app-frame/use-app-frame-project"
import { LocaleProvider } from "@/i18n/context"
import { ThemeProvider } from "@/ui/theme/theme-context"

const a = {
  id: "project_11111111-1111-1111-1111-111111111111",
  name: "项目甲",
  slug: "a",
  description: "",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
}
const b = { ...a, id: "project_22222222-2222-2222-2222-222222222222", name: "项目乙", slug: "b" }
beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh")
  window.history.replaceState(null, "", `/app/project/${a.id}`)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, "", "/app")
})
function rail() {
  const rename = vi.fn(),
    remove = vi.fn(),
    create = vi.fn()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <WorkspaceRail
          collapsed={false}
          onToggleCollapse={() => {}}
          onNewChat={create}
          chatHref="/app"
          projects={[a, b].map((p) => ({ id: p.id, name: p.name, href: `/app/project/${p.id}` }))}
          projectListStatus="ready"
          onRequestProjectRename={rename}
          onRequestProjectDelete={remove}
          conversations={[]}
          activeId={null}
          awaitingIds={new Set()}
          onSelectConversation={() => {}}
          onDeleteConversation={async () => true}
          onRenameConversation={() => {}}
          onOpenSettings={() => {}}
          onOpenNotifications={() => {}}
          listLoading={false}
          listError={false}
          hasMore={false}
          onLoadMore={() => {}}
        />
      </LocaleProvider>
    </ThemeProvider>,
  )
  const rowButton = screen.getByRole("button", { name: b.name }),
    row = rowButton.closest("[data-project-id]") as HTMLElement
  return { rename, remove, create, row, rowButton }
}
it("真实右键和Shift+F10与ellipsis给出同一四项targeted菜单，不伪造pin或指令第六项", async () => {
  const c = rail()
  fireEvent.contextMenu(c.rowButton, { clientX: 80, clientY: 90 })
  let menu = await screen.findByRole("menu")
  const labels = () =>
    within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent)
  expect(labels()).toEqual(["编辑项目", "查看项目", "显示更少", "删除"])
  fireEvent.click(within(menu).getByRole("menuitem", { name: "删除" }))
  expect(c.remove).toHaveBeenCalledWith(b.id, expect.any(HTMLButtonElement))
  expect(c.rename).not.toHaveBeenCalled()
  c.rowButton.focus()
  fireEvent.keyDown(c.rowButton, { key: "F10", shiftKey: true })
  menu = await screen.findByRole("menu")
  expect(labels()).toEqual(["编辑项目", "查看项目", "显示更少", "删除"])
  fireEvent.keyDown(menu, { key: "Escape" })
  await waitFor(() => expect(c.rowButton).toHaveFocus())
  const trigger = within(c.row).getByRole("button", { name: "项目选项" })
  fireEvent.keyDown(trigger, { key: "ArrowDown" })
  menu = await screen.findByRole("menu")
  expect(labels()).toEqual(["编辑项目", "查看项目", "显示更少", "删除"])
  fireEvent.click(within(menu).getByRole("menuitem", { name: "编辑项目" }))
  expect(c.rename).toHaveBeenCalledWith(b.id, trigger)
})
it("显示更少只收起精确项目，查看只去原overview不创建任务", async () => {
  const c = rail()
  fireEvent.click(c.rowButton)
  expect(c.rowButton).toHaveAttribute("aria-expanded", "true")
  fireEvent.contextMenu(c.rowButton)
  fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "显示更少" }))
  expect(c.rowButton).toHaveAttribute("aria-expanded", "false")
  fireEvent.contextMenu(c.rowButton)
  fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "查看项目" }))
  expect(window.location.pathname).toBe(`/app/project/${b.id}`)
  expect(c.create).not.toHaveBeenCalled()
  expect(c.remove).not.toHaveBeenCalled()
})
function options(): AppFrameProjectOptions {
  return {
    projectRef: a.id,
    projectWorkspace: true,
    preview: false,
    mounted: true,
    draft: "original draft",
    updateDraft: vi.fn(),
    clearDraft: vi.fn(),
    projectDetail: { status: "ready", data: a },
    instructionHistory: { status: "ready", data: [] },
    instructionContext: {},
    refreshProject: vi.fn(),
    refreshRenamedProject: vi.fn(),
    renameBoundary: { admitted: true, subject: "reader-A", generation: 1 },
  }
}
const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider>{children}</LocaleProvider>
it("跨行删除只在B当前owner ready后开B确认，取消零写并返回原稳定行trigger", () => {
  const fetch = vi.spyOn(globalThis, "fetch")
  const opener = document.createElement("button")
  document.body.append(opener)
  const initial = options(),
    view = renderHook((p: AppFrameProjectOptions) => useAppFrameProject(p), { initialProps: initial, wrapper })
  const staleReturn = view.result.current.projectDelete.returnFocus
  act(() => view.result.current.requestProjectDeletion(b.id, opener))
  expect(window.location.pathname).toBe(`/app/project/${b.id}`)
  expect(view.result.current.projectDelete.open).toBe(false)
  view.rerender({ ...initial, projectRef: b.id, projectDetail: { status: "loading" } })
  expect(view.result.current.projectDelete.open).toBe(false)
  view.rerender({ ...initial, projectRef: b.id, projectDetail: { status: "ready", data: b } })
  expect(view.result.current.projectDelete.open).toBe(true)
  expect(view.result.current.projectDelete.targetName).toBe(b.name)
  expect(staleReturn?.()).toBe(false)
  act(() => view.result.current.projectDelete.onClose())
  expect(view.result.current.projectDelete.open).toBe(false)
  expect(view.result.current.projectDelete.returnFocus?.()).toBe(true)
  expect(opener).toHaveFocus()
  expect(fetch).not.toHaveBeenCalled()
  opener.remove()
})
it("target handoff在其它导航/换主体退休，迟到B和旧A handler不开当前项目确认", () => {
  const initial = options(),
    view = renderHook((p: AppFrameProjectOptions) => useAppFrameProject(p), { initialProps: initial, wrapper })
  const stale = view.result.current.requestProjectDeletion
  act(() => view.result.current.requestProjectDeletion(b.id, null))
  act(() => {
    window.history.pushState(null, "", "/app")
    window.dispatchEvent(new Event("kokoro:surface-navigation"))
  })
  view.rerender({
    ...initial,
    projectRef: b.id,
    projectDetail: { status: "ready", data: b },
    renameBoundary: { admitted: true, subject: "reader-B", generation: 2 },
  })
  expect(view.result.current.projectDelete.open).toBe(false)
  act(() => stale(b.id, null))
  expect(window.location.pathname).toBe("/app")
  expect(view.result.current.projectDelete.open).toBe(false)
})

it("跨行B确认只发B的原空DELETE；unknown重试保同key/body，202只退休B", async () => {
  const initial = options(),
    retire = vi.fn()
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValueOnce(new TypeError("ACK lost"))
    .mockResolvedValueOnce(
      Response.json(
        { data: { project_id: b.id, logical_release_state: "pending", physical_cleanup_state: "pending" } },
        { status: 202, headers: { "cache-control": "private, no-store, max-age=0" } },
      ),
    )
  const view = renderHook((p: AppFrameProjectOptions) => useAppFrameProject(p), { initialProps: { ...initial, retireProject: retire }, wrapper })
  act(() => view.result.current.requestProjectDeletion(b.id, null))
  view.rerender({ ...initial, retireProject: retire, projectRef: b.id, projectDetail: { status: "ready", data: b } })
  await act(async () => view.result.current.projectDelete.onConfirm())
  expect(view.result.current.projectDelete.problem).toBe("unknown")
  const first = fetch.mock.calls[0]
  expect(first?.[0]).toBe(`/api/hub/projects/${b.id}`)
  expect(first?.[1]?.method).toBe("DELETE")
  expect(Object.hasOwn(first?.[1] ?? {}, "body")).toBe(false)
  const key = new Headers(first?.[1]?.headers).get("idempotency-key")
  act(() => {
    view.result.current.projectDelete.onClose()
    view.result.current.projectDelete.onOpen()
  })
  expect(fetch).toHaveBeenCalledTimes(1)
  await act(async () => view.result.current.projectDelete.onRetry())
  expect(fetch.mock.calls[1]?.[0]).toBe(first?.[0])
  expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get("idempotency-key")).toBe(key)
  expect(retire).toHaveBeenCalledWith(b.id)
  expect(window.location.pathname).toBe("/app")
})
