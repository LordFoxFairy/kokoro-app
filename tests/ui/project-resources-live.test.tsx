import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
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


// AppGate keeps the authenticated workbench mounted when a session probe pauses
// admission. Its project key stays unchanged until the actual route changes.
const admissionUi = (admitted: boolean, generation: number, list: Parameters<typeof ui>[1], upload?: Parameters<typeof ui>[2]) => <LocaleProvider><KokoroProjectWorkspace
  key='["project","private-project",null,false]'
  projectRef="private-project" preview={false} brandName="Kokoro" composer={<div>composer</div>} onPrompt={vi.fn()}
  projectReadBoundary={{ admitted, subject: "owner-a", generation }}
  workspaceCapabilities={capabilities} onListProjectResources={list}
  {...(upload ? { onUploadProjectResource: upload } : {})}
/></LocaleProvider>

it("同项目准入暂停后立即退休私有列表，开放弹窗中的读写动作不继续请求", async () => {
  const list = vi.fn().mockResolvedValue(page([item("private-before-pause")]))
  const upload = vi.fn().mockRejectedValue(new Error("offline"))
  const view = render(admissionUi(true, 1, list, upload))
  const dialog = openResources(view.container)
  await waitFor(() => expect(within(dialog).getByText("private-before-pause.txt")).toBeInTheDocument())
  view.rerender(admissionUi(false, 2, list, upload))
  expect(within(dialog).queryByText("private-before-pause.txt")).not.toBeInTheDocument()
  fireEvent.change(document.getElementById("project-resource-upload") as HTMLInputElement, { target: { files: [new File(["abc"], "paused.txt", { type: "text/plain" })] } })
  const retry = within(dialog).queryByRole("button", { name: "重试" })
  expect(within(dialog).getByRole("button", { name: "新增" })).toBeDisabled()
  expect(retry).toBeDisabled()
  if (retry) fireEvent.click(retry)
  await act(async () => {})
  expect(list).toHaveBeenCalledTimes(1)
  expect(upload).not.toHaveBeenCalled()
})

it("准入暂停退休上传回调与剩余批次，恢复只读并由用户用原文件和原 key 重试", async () => {
  const pending = deferred<{ assetId: string; filename: string; mimeType: string; sizeBytes: string }>()
  const list = vi.fn().mockResolvedValue(page([]))
  const upload = vi.fn().mockReturnValueOnce(pending.promise).mockRejectedValue(new Error("offline"))
  const view = render(admissionUi(true, 1, list, upload))
  const dialog = openResources(view.container)
  await waitFor(() => expect(within(dialog).getByText("暂无文件和资源。")).toBeInTheDocument())
  const file = new File(["abc"], "original.txt", { type: "text/plain" })
  const queued = new File(["def"], "queued.txt", { type: "text/plain" })
  fireEvent.change(document.getElementById("project-resource-upload") as HTMLInputElement, { target: { files: [file, queued] } })
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(1))
  const originalCall = upload.mock.calls[0]
  view.rerender(admissionUi(false, 2, list, upload))
  await act(async () => pending.resolve({ assetId: "late", filename: file.name, mimeType: file.type, sizeBytes: "3" }))
  expect(upload).toHaveBeenCalledTimes(1)
  expect(list).toHaveBeenCalledTimes(1)
  view.rerender(admissionUi(true, 3, list, upload))
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  expect(upload).toHaveBeenCalledTimes(1)
  fireEvent.click(within(dialog).getByRole("button", { name: "重试上传 original.txt" }))
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(2))
  expect(upload.mock.calls[1]).toEqual(originalCall)
})

it("真实项目离开会卸载工作台，迟到上传不再发旧列表 GET 或提交剩余文件", async () => {
  const pending = deferred<{ assetId: string; filename: string; mimeType: string; sizeBytes: string }>()
  const list = vi.fn().mockResolvedValue(page([]))
  const upload = vi.fn().mockReturnValueOnce(pending.promise).mockRejectedValue(new Error("offline"))
  const view = render(admissionUi(true, 1, list, upload))
  openResources(view.container)
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
  const file = new File(["abc"], "original.txt", { type: "text/plain" })
  fireEvent.change(document.getElementById("project-resource-upload") as HTMLInputElement, { target: { files: [file, new File(["def"], "queued.txt")] } })
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(1))
  view.unmount()
  await act(async () => pending.resolve({ assetId: "late", filename: file.name, mimeType: file.type, sizeBytes: "3" }))
  expect(list).toHaveBeenCalledTimes(1)
  expect(upload).toHaveBeenCalledTimes(1)
})


it("暂停后的新准入只采纳新 GET，旧上传 ACK 和旧 GET 都不恢复前代投影", async () => {
  const firstRead = deferred<ProjectResourceListPage>()
  const pending = deferred<{ assetId: string; filename: string; mimeType: string; sizeBytes: string }>()
  const signals: AbortSignal[] = []
  const list = vi.fn((_cursor: string | null, signal: AbortSignal) => {
    signals.push(signal)
    return signals.length === 1 ? firstRead.promise : Promise.resolve(page([item("current-generation")]))
  })
  const upload = vi.fn().mockReturnValue(pending.promise)
  const view = render(admissionUi(true, 1, list, upload))
  const dialog = openResources(view.container)
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
  const file = new File(["abc"], "original.txt", { type: "text/plain" })
  fireEvent.change(document.getElementById("project-resource-upload") as HTMLInputElement, { target: { files: [file] } })
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(1))
  view.rerender(admissionUi(false, 2, list, upload))
  expect(signals[0]?.aborted).toBe(true)
  view.rerender(admissionUi(true, 3, list, upload))
  await waitFor(() => expect(within(dialog).getByText("current-generation.txt")).toBeInTheDocument())
  await act(async () => {
    firstRead.resolve(page([item("retired-generation")]))
    pending.resolve({ assetId: "late", filename: file.name, mimeType: file.type, sizeBytes: "3" })
  })
  expect(list).toHaveBeenCalledTimes(2)
  expect(upload).toHaveBeenCalledTimes(1)
  expect(within(dialog).getByText("current-generation.txt")).toBeInTheDocument()
  expect(within(dialog).queryByText("retired-generation.txt")).not.toBeInTheDocument()
  expect(within(dialog).getByRole("button", { name: "重试上传 original.txt" })).toBeEnabled()
})
