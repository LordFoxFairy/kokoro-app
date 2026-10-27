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
  expect(within(dialog).getByRole("status")).toHaveClass("sr-only")
  expect(within(dialog).queryByText("研究简报.md")).not.toBeInTheDocument()
  first.resolve(page([item("private-1")], "opaque-next"))
  await waitFor(() => expect(within(dialog).getByText("private-1.txt")).toBeInTheDocument())
  expect(within(dialog).queryByText("研究简报.md")).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole("button", { name: "加载更多文件" }))
  await waitFor(() => expect(within(dialog).getByText("private-2.txt")).toBeInTheDocument())
  expect(list.mock.calls.map((call: unknown[]) => call[0])).toEqual([null, "opaque-next"])
  expect(within(dialog).queryByRole("button", { name: "加载更多文件" })).not.toBeInTheDocument()
})

it("GET 失败保持quiet错误而非伪空态；关闭重开后 owner 空页才显示空态", async () => {
  const list = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(page([]))
  const view = render(ui("private-project", list))
  let dialog = openResources(view.container)
  await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent("文件加载失败"))
  expect(within(dialog).getByRole("status")).toHaveClass("sr-only")
  expect(within(dialog).queryByRole("alert")).toBeNull()
  expect(within(dialog).queryByRole("button", { name: "重试" })).toBeNull()
  expect(within(dialog).queryByText("暂无文件和资源")).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole("button", { name: "关闭对话框" }))
  dialog = openResources(view.container)
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
  expect(retry).toBeNull()
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

it("resource row opens fresh exact metadata, confirms irreversible Asset deletion, and stale refresh cannot resurrect it", async () => {
 const list = vi.fn().mockResolvedValue(page([item("asset-one"), item("asset-two")]))
 const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ data: { resource: { asset_id: "asset-one", filename: "fresh-name.txt", mime_type: "text/plain", size_bytes: "3", content_sha256: "a".repeat(64), scan_state: "clean" } }, meta: { request_id: "r" } }, { headers: { "cache-control": "private, no-store, max-age=0" } })).mockResolvedValueOnce(Response.json({ data: { asset_id: "asset-one", deleted_at: "2026-10-26T00:00:00.000Z", replayed: false }, meta: { request_id: "r" } }, { headers: { "cache-control": "private, no-store, max-age=0" } }))
 const view = render(ui("project-one", list)); const picker = openResources(view.container)
 await waitFor(() => expect(within(picker).getByRole("button", { name: /asset-one.txt/ })).toBeInTheDocument())
 fireEvent.click(within(picker).getByRole("button", { name: /asset-one.txt/ }))
 const detail = await screen.findByRole("dialog", { name: "fresh-name.txt" })
 expect(fetcher.mock.calls[0]?.[0]).toBe("/api/hub/projects/project-one/resources/asset-one")
 fireEvent.click(within(detail).getByRole("button", { name: "永久删除资源" }))
 expect(within(detail).getByRole("alert")).toHaveTextContent("确定永久删除“fresh-name.txt”？文件将从项目中移除，删除后无法恢复。")
 expect(fetcher).toHaveBeenCalledTimes(1)
 fireEvent.click(within(detail).getByRole("button", { name: "永久删除资源" }))
 await waitFor(() => expect(screen.queryByRole("dialog", { name: "fresh-name.txt" })).not.toBeInTheDocument())
 await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
 expect(within(picker).queryByText("asset-one.txt")).not.toBeInTheDocument()
 expect(within(picker).getByText("asset-two.txt")).toBeInTheDocument()
 fetcher.mockRestore()
})

it("an ACK negative fact keeps unrelated rows during failed refresh and never hides a recreated different asset or actor", async () => {
 const { renderHook } = await import("@testing-library/react")
 const { useProjectResources } = await import("@/features/app/use-project-resources")
 let rejectRefresh!: (error: Error) => void
 const pending = { promise: new Promise<ProjectResourceListPage>((_resolve,reject)=>{rejectRefresh=reject}) }
 const list=vi.fn().mockResolvedValueOnce(page([item("one"),item("two")])).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(page([item("one"),item("two"),item("replacement")])).mockResolvedValueOnce(page([item("one")]))
 const a={},b={};const view=renderHook(({context})=>useProjectResources("p",false,list,context,true),{initialProps:{context:a}})
 await waitFor(()=>expect(view.result.current.items).toHaveLength(2))
 act(()=>view.result.current.confirmDelete("one"))
 expect(view.result.current.items.map(row=>row.id)).toEqual(["two"])
 await act(async()=>{rejectRefresh(new Error("refresh offline"))})
 expect(view.result.current.items.map(row=>row.id)).toEqual(["two"])
 expect(view.result.current.refreshFailed).toBe(true)
 await act(async()=>{await view.result.current.retry()})
 expect(view.result.current.items.map(row=>row.id)).toEqual(["two","replacement"])
 view.rerender({context:b});await waitFor(()=>expect(view.result.current.items.map(row=>row.id)).toEqual(["one"]))
})

it("a new same-name selection replaces only a proven local size error, never a pending or unknown command", async () => {
 const { ProjectResourceUploadError } = await import("@/features/app/project-resource-upload")
 const list=vi.fn().mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([item("success")]))
 const upload=vi.fn().mockRejectedValueOnce(new ProjectResourceUploadError("request_body_too_large",false,413,true)).mockRejectedValueOnce(new Error("unknown network result")).mockResolvedValueOnce({assetId:"success",filename:"same.txt",mimeType:"text/plain",sizeBytes:"3"})
 const view=render(ui("p",list,upload));const picker=openResources(view.container)
 await waitFor(()=>expect(within(picker).getByText("暂无文件和资源。")).toBeInTheDocument())
 const select=()=>fireEvent.change(document.getElementById("project-resource-upload") as HTMLInputElement,{target:{files:[new File(["abc"],"same.txt",{type:"text/plain"})]}})
 select();await waitFor(()=>expect(within(picker).getByText("same.txt 超过 1 MB 上传限制。")).toBeInTheDocument())
 select();await waitFor(()=>expect(upload).toHaveBeenCalledTimes(2))
 await waitFor(()=>expect(within(picker).queryByText("same.txt 超过 1 MB 上传限制。")).not.toBeInTheDocument())
 expect(within(picker).getByRole("button",{name:"重试上传 same.txt"})).toBeInTheDocument()
 const original=upload.mock.calls[1]
 select();await waitFor(()=>expect(upload).toHaveBeenCalledTimes(3))
 await waitFor(()=>expect(within(picker).getByText("success.txt")).toBeInTheDocument())
 expect(within(picker).getByRole("button",{name:"重试上传 same.txt"})).toBeInTheDocument()
 expect(upload.mock.calls[1]).toEqual(original)
})

it("confirmed upload rechecks preserve already-read siblings through pending or failed GET without listing an unobserved receipt", async () => {
  const firstRecheck = deferred<ProjectResourceListPage>()
  let failSecondRecheck!: (error: Error) => void
  const secondRecheck = new Promise<ProjectResourceListPage>((_resolve, reject) => { failSecondRecheck = reject })
  const list = vi.fn().mockResolvedValueOnce(page([item("sibling-900k")])).mockReturnValueOnce(firstRecheck.promise).mockReturnValueOnce(secondRecheck)
  const upload = vi.fn().mockResolvedValueOnce({ assetId: "new-one", filename: "new-one.txt", mimeType: "text/plain", sizeBytes: "3" })
    .mockResolvedValueOnce({ assetId: "new-two", filename: "new-two.txt", mimeType: "text/plain", sizeBytes: "3" })
  const view = render(ui("private-project", list, upload))
  const picker = openResources(view.container)
  await waitFor(() => expect(within(picker).getByRole("button", { name: /sibling-900k.txt/ })).toBeInTheDocument())
  const select = (name: string) => fireEvent.change(document.getElementById("project-resource-upload") as HTMLInputElement,
    { target: { files: [new File(["abc"], name, { type: "text/plain" })] } })
  select("new-one.txt")
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  expect(within(picker).getByRole("button", { name: /sibling-900k.txt/ })).toBeInTheDocument()
  expect(within(picker).queryByRole("button", { name: /new-one.txt/ })).toBeNull()
  await act(async () => { firstRecheck.resolve(page([item("sibling-900k"), item("new-one")])) })
  await waitFor(() => expect(within(picker).getByRole("button", { name: /new-one.txt/ })).toBeInTheDocument())
  select("new-two.txt")
  await waitFor(() => expect(list).toHaveBeenCalledTimes(3))
  expect(within(picker).getByRole("button", { name: /sibling-900k.txt/ })).toBeInTheDocument()
  expect(within(picker).getByRole("button", { name: /new-one.txt/ })).toBeInTheDocument()
  expect(within(picker).queryByRole("button", { name: /new-two.txt/ })).toBeNull()
  await act(async () => { failSecondRecheck(new Error("GET offline after a valid upload ACK")) })
  expect(within(picker).getByRole("button", { name: /sibling-900k.txt/ })).toBeInTheDocument()
  expect(within(picker).getByRole("button", { name: /new-one.txt/ })).toBeInTheDocument()
  expect(within(picker).queryByRole("button", { name: /new-two.txt/ })).toBeNull()
})

it("quiet parent keeps known rows during pending/failed reads and an ordinary reopen rechecks without generic retry panels", async () => {
  let rejectRecheck!: (error: Error) => void
  const pending = new Promise<ProjectResourceListPage>((_resolve, reject) => { rejectRecheck = reject })
  const list = vi.fn().mockResolvedValueOnce(page([item("known")])).mockReturnValueOnce(pending)
    .mockResolvedValueOnce(page([item("known"), item("recovered")]))
  const view = render(ui("p", list))
  let picker = openResources(view.container)
  await waitFor(() => expect(within(picker).getByRole("button", { name: /known.txt/ })).toBeInTheDocument())
  fireEvent.click(within(picker).getByRole("button", { name: "关闭对话框" }))
  picker = openResources(view.container)
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  expect(within(picker).getByRole("button", { name: /known.txt/ })).toBeInTheDocument()
  expect(within(picker).getByRole("status")).toHaveClass("sr-only")
  expect(within(picker).queryByRole("button", { name: "重试" })).toBeNull()
  await act(async () => { rejectRecheck(new Error("offline")) })
  expect(within(picker).getByRole("button", { name: /known.txt/ })).toBeInTheDocument()
  expect(within(picker).queryByRole("alert")).toBeNull()
  expect(within(picker).getByRole("status")).toHaveClass("sr-only")
  expect(within(picker).queryByRole("button", { name: "重试" })).toBeNull()
  fireEvent.click(within(picker).getByRole("button", { name: "关闭对话框" }))
  picker = openResources(view.container)
  await waitFor(() => expect(list).toHaveBeenCalledTimes(3))
  await waitFor(() => expect(within(picker).getByRole("button", { name: /recovered.txt/ })).toBeInTheDocument())
})
