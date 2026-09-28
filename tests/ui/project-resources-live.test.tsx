import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import type { ProjectResourceListPage } from "@/contract/project-resource"
import { KokoroProjectWorkspace } from "@/features/app/kokoro-project-workspace"
import { LocaleProvider } from "@/i18n/context"

const capabilities = { instructions: false, connectors: false, resources: true, skills: false, projectConversations: false }
const item = (assetId: string): ProjectResourceListPage["items"][number] => ({
  assetId, filename: `${assetId}.txt`, mimeType: "text/plain", sizeBytes: "3", createdAt: "2026-09-28T10:00:00.000Z",
})
const page = (items: ProjectResourceListPage["items"], nextCursor: string | null = null): ProjectResourceListPage => ({ items, nextCursor })
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}
const ui = (projectRef: string, onListProjectResources: (cursor: string | null, signal: AbortSignal) => Promise<ProjectResourceListPage>, onUploadProjectResource?: (file: File, key: string) => Promise<{ assetId: string; filename: string; mimeType: string; sizeBytes: string }>) => <LocaleProvider><KokoroProjectWorkspace
  projectRef={projectRef} preview={false} brandName="Kokoro" composer={<div>composer</div>} onPrompt={vi.fn()}
  workspaceCapabilities={capabilities} onListProjectResources={onListProjectResources}
  {...(onUploadProjectResource ? { onUploadProjectResource } : {})}
/></LocaleProvider>
function openResources(container: HTMLElement) {
  const card = container.querySelector('[data-context-kind="resources-skills"]') as HTMLElement
  fireEvent.click(within(card).getAllByRole("button", { name: /文件和资源/ })[0]!)
  return screen.getByRole("dialog", { name: "文件和资源" })
}
beforeEach(() => window.localStorage.setItem("kokoro.locale", "zh"))
afterEach(cleanup)

it("live 初载不显示预览假行，按 owner cursor 分页且只展示当前私有项目资源", async () => {
  const first = deferred<ProjectResourceListPage>()
  const list = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(page([item("private-2")]))
  const view = render(ui("private-project", list))
  const dialog = openResources(view.container)
  expect(within(dialog).getByRole("status")).toHaveTextContent("正在加载文件")
  expect(within(dialog).queryByText("研究简报.md")).not.toBeInTheDocument()
  first.resolve(page([item("private-1")], "opaque-next"))
  await waitFor(() => expect(within(dialog).getByText("private-1.txt")).toBeInTheDocument())
  expect(within(dialog).queryByText("研究简报.md")).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole("button", { name: "加载更多文件" }))
  await waitFor(() => expect(within(dialog).getByText("private-2.txt")).toBeInTheDocument())
  expect(list.mock.calls.map((call: unknown[]) => call[0])).toEqual([null, "opaque-next"])
  expect(within(dialog).queryByRole("button", { name: "加载更多文件" })).not.toBeInTheDocument()
})

it("GET 失败是错误而非空态；重试后 owner 空页才显示空态", async () => {
  const list = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(page([]))
  const view = render(ui("private-project", list))
  const dialog = openResources(view.container)
  await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("文件加载失败"))
  expect(within(dialog).queryByText("暂无文件和资源")).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole("button", { name: "重试" }))
  await waitFor(() => expect(within(dialog).getByText("暂无文件和资源。")).toBeInTheDocument())
  expect(list).toHaveBeenCalledTimes(2)
})

it("上传 200 后由 owner GET 确认列表，页面重新挂载仍从 GET 读到同一资源", async () => {
  const refreshed = deferred<ProjectResourceListPage>()
  const list = vi.fn().mockResolvedValueOnce(page([])).mockReturnValueOnce(refreshed.promise).mockResolvedValue(page([item("persisted")]))
  const upload = vi.fn(async (file: File) => ({ assetId: "persisted", filename: file.name, mimeType: file.type, sizeBytes: String(file.size) }))
  const view = render(ui("private-project", list, upload))
  const dialog = openResources(view.container)
  await waitFor(() => expect(within(dialog).getByText("暂无文件和资源。")).toBeInTheDocument())
  fireEvent.change(document.getElementById("project-resource-upload") as HTMLInputElement, { target: { files: [new File(["abc"], "persisted.txt", { type: "text/plain" })] } })
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  expect(within(dialog).queryByRole("list", { name: "文件和资源" })).not.toBeInTheDocument()
  refreshed.resolve(page([item("persisted")]))
  await waitFor(() => expect(within(dialog).getByText("persisted.txt")).toBeInTheDocument())
  view.unmount()
  const reloaded = render(ui("private-project", list, upload))
  const reloadDialog = openResources(reloaded.container)
  await waitFor(() => expect(within(reloadDialog).getByText("persisted.txt")).toBeInTheDocument())
  expect(list).toHaveBeenCalledTimes(3)
})

it("切换 A→B 取消旧 GET，迟到 A 页不能覆盖 B 的私有列表", async () => {
  const a = deferred<ProjectResourceListPage>()
  const signals: AbortSignal[] = []
  const listA = vi.fn((_cursor: string | null, signal: AbortSignal) => { signals.push(signal); return a.promise })
  const listB = vi.fn().mockResolvedValue(page([item("b-only")]))
  const view = render(ui("project-a", listA))
  const dialog = openResources(view.container)
  await waitFor(() => expect(listA).toHaveBeenCalledTimes(1))
  view.rerender(ui("project-b", listB))
  await waitFor(() => expect(within(dialog).getByText("b-only.txt")).toBeInTheDocument())
  expect(signals[0]?.aborted).toBe(true)
  a.resolve(page([item("a-secret")]))
  await waitFor(() => expect(within(dialog).queryByText("a-secret.txt")).not.toBeInTheDocument())
})
