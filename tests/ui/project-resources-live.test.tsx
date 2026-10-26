import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import type { ProjectResourceListPage } from "@/contract/project-resource"
import { KokoroProjectWorkspace } from "@/features/app/kokoro-project-workspace"
import { LocaleProvider } from "@/i18n/context"

const capabilities = { instructions: false, connectors: false, resources: true, skills: false, projectConversations: false }
const item = (assetId: string): ProjectResourceListPage["items"][number] => ({
  assetId, filename: `${assetId}.txt`, mimeType: "text/plain", sizeBytes: "3", contentSha256: "a".repeat(64), createdAt: "2026-09-28T10:00:00.000Z",
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

// F2: exercise the existing hook and Workspace, not a future hook mock. The
// context is the synchronous acceptance/identity fence supplied by AppFrame.
it("F2 real Workspace ignores an old GET after its accepted context retires even when the transport ignores abort", async () => {
  const { act } = await import("@testing-library/react")
  let current = true
  const context = { isCurrent: () => current }
  const pending = deferred<ProjectResourceListPage>()
  const list = vi.fn().mockReturnValue(pending.promise)
  const view = render(<LocaleProvider><KokoroProjectWorkspace
    projectRef="private-project" preview={false} composer={<div>composer</div>} onPrompt={vi.fn()}
    workspaceCapabilities={capabilities} projectInstructionContext={context} onListProjectResources={list}
  /></LocaleProvider>)
  const dialog = openResources(view.container)
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
  current = false
  await act(async () => pending.resolve(page([item("deleted-project-secret")])))
  expect(within(dialog).queryByText("deleted-project-secret.txt")).not.toBeInTheDocument()
  expect(list).toHaveBeenCalledTimes(1)
})

it("F2 real Workspace late upload cannot confirm with a new GET or start the next selected file after acceptance", async () => {
  const { act } = await import("@testing-library/react")
  let current = true
  const context = { isCurrent: () => current }
  const uploaded = deferred<{ assetId: string; filename: string; mimeType: string; sizeBytes: string }>()
  const upload = vi.fn().mockReturnValue(uploaded.promise)
  const list = vi.fn().mockResolvedValue(page([]))
  const view = render(<LocaleProvider><KokoroProjectWorkspace
    projectRef="private-project" preview={false} composer={<div>composer</div>} onPrompt={vi.fn()}
    workspaceCapabilities={capabilities} projectInstructionContext={context} onListProjectResources={list} onUploadProjectResource={upload}
  /></LocaleProvider>)
  const dialog = openResources(view.container)
  await waitFor(() => expect(within(dialog).getByText("暂无文件和资源。")).toBeInTheDocument())
  fireEvent.change(document.getElementById("project-resource-upload") as HTMLInputElement, { target: { files: [
    new File(["one"], "one.txt", { type: "text/plain" }), new File(["two"], "two.txt", { type: "text/plain" }),
  ] } })
  expect(upload).toHaveBeenCalledTimes(1)
  current = false
  await act(async () => uploaded.resolve({ assetId: "late-upload", filename: "one.txt", mimeType: "text/plain", sizeBytes: "3" }))
  expect(list).toHaveBeenCalledTimes(1)
  expect(upload).toHaveBeenCalledTimes(1)
  expect(within(dialog).queryByText("late-upload.txt")).not.toBeInTheDocument()
})

it.each(["refresh", "loadMore", "retry", "confirmUpload"] as const)("F2 real resource hook captured %s cannot start new IO after acceptance", async (operation) => {
  const { act, renderHook } = await import("@testing-library/react")
  const { useProjectResources } = await import("@/features/app/use-project-resources")
  // A three-argument function is callable through this four-argument seam;
  // current source runs normally but ignores the fence, exposing real new IO.
  const useScopedResources: (target: string, preview: boolean, read: (cursor: string | null, signal: AbortSignal) => Promise<ProjectResourceListPage>, context: { isCurrent: () => boolean }) => ReturnType<typeof useProjectResources> = useProjectResources
  let current = true
  const context = { isCurrent: () => current }
  const list = vi.fn().mockResolvedValue(page([item("first")], "next-page"))
  const view = renderHook(() => useScopedResources("private-project", false, list, context))
  await waitFor(() => expect(view.result.current.status).toBe("ready"))
  const old = view.result.current
  current = false
  await act(async () => {
    if (operation === "confirmUpload") await old.confirmUpload({ assetId: "retired", filename: "retired.txt", mimeType: "text/plain", sizeBytes: "3" })
    else await old[operation]()
  })
  expect(list).toHaveBeenCalledTimes(1)
  expect(view.result.current.items.map(row => row.id)).not.toContain("retired")
})

it.each(["A-B-A", "unmount"] as const)("F2 actual Workspace %s retirement prevents late upload from starting its old confirmation GET", async (changed) => {
  const { act } = await import("@testing-library/react")
  let oldCurrent = true
  const oldContext = { isCurrent: () => oldCurrent }
  const uploadGate = deferred<{ assetId: string; filename: string; mimeType: string; sizeBytes: string }>()
  const upload = vi.fn().mockReturnValue(uploadGate.promise)
  const listA = vi.fn().mockResolvedValue(page([]))
  const listB = vi.fn().mockResolvedValue(page([]))
  const surface = (target: string, context: object, list: typeof listA) => <LocaleProvider><KokoroProjectWorkspace
    projectRef={target} preview={false} composer={<div>composer</div>} onPrompt={vi.fn()} workspaceCapabilities={capabilities}
    projectInstructionContext={context} onListProjectResources={list} onUploadProjectResource={upload}
  /></LocaleProvider>
  const view = render(surface("project-a", oldContext, listA))
  const dialog = openResources(view.container)
  await waitFor(() => expect(within(dialog).getByText("暂无文件和资源。")).toBeInTheDocument())
  fireEvent.change(document.getElementById("project-resource-upload") as HTMLInputElement, { target: { files: [new File(["private"], "private.txt")] } })
  expect(upload).toHaveBeenCalledTimes(1)
  oldCurrent = false
  if (changed === "unmount") view.unmount()
  else {
    view.rerender(surface("project-b", { isCurrent: () => true }, listB))
    await waitFor(() => expect(listB).toHaveBeenCalledTimes(1))
    view.rerender(surface("project-a", { isCurrent: () => true }, listA))
    await waitFor(() => expect(listA).toHaveBeenCalledTimes(2))
  }
  const aCalls = listA.mock.calls.length; const bCalls = listB.mock.calls.length
  await act(async () => uploadGate.resolve({ assetId: "old-a", filename: "private.txt", mimeType: "text/plain", sizeBytes: "7" }))
  expect(listA).toHaveBeenCalledTimes(aCalls)
  expect(listB).toHaveBeenCalledTimes(bCalls)
  expect(upload).toHaveBeenCalledTimes(1)
})

// I3 uses the real list client and Workspace. Download transport is observed at
// fetch/Response/anchor boundaries; no future module or hook is imported.
const i3Asset = {
  asset_id: "asset-1", filename: "private.txt", mime_type: "text/plain", size_bytes: "3",
  content_sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  scan_state: "clean", created_at: "2026-09-28T10:00:00.000Z",
}
const i3ContentPath = "/api/hub/projects/project-a/resources/asset-1/content"
function i3ContentResponse(body = "abc") {
  return new Response(body, { status: 200, headers: {
    "content-type": "text/plain", "content-length": "3",
    "content-disposition": "attachment; filename=\"private.txt\"; filename*=UTF-8''private.txt",
    "cache-control": "private, no-store, max-age=0", "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff", "x-request-id": "req-i3-download",
  } })
}
async function i3ResourceFixture(content: () => Response | Promise<Response> = i3ContentResponse) {
  const { listProjectResources } = await import("@/features/app/project-resource-list")
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const path = typeof input === "string" ? input : input instanceof Request ? input.url : input.href
    if (/^\/api\/hub\/projects\/project-[ab]\/resources\?limit=50$/.test(path)) {
      return new Response(JSON.stringify({ data: { items: [i3Asset], next_cursor: null }, meta: { request_id: "req-i3-list" } }), { status: 200 })
    }
    if (path === i3ContentPath) return content()
    throw new Error(`unexpected_i3_request:${path}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  const createURL = vi.fn(() => "blob:i3-verified-project-resource")
  const revokeURL = vi.fn()
  const OriginalURL = URL
  class DownloadURL extends OriginalURL {
    static override createObjectURL = createURL
    static override revokeObjectURL = revokeURL
  }
  vi.stubGlobal("URL", DownloadURL)
  const clicked: { href: string; download: string }[] = []
  const anchor = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ href: this.href, download: this.download })
  })
  const readers = new Map<string, (cursor: string | null, signal: AbortSignal) => Promise<ProjectResourceListPage>>()
  let current = true
  const context = { isCurrent: () => current }
  const surface = (target = "project-a", boundary = { admitted: true, subject: "subject-a" as string | null, generation: 1 }, preview = false) => {
    let read = readers.get(target)
    if (!read) {
      read = (cursor, signal) => listProjectResources(target, cursor, signal)
      readers.set(target, read)
    }
    return <LocaleProvider><KokoroProjectWorkspace projectRef={target} preview={preview} composer={<div>composer</div>}
      onPrompt={vi.fn()} workspaceCapabilities={capabilities} projectInstructionContext={context}
      projectReadBoundary={boundary} onListProjectResources={read} /></LocaleProvider>
  }
  const downloads = () => fetchMock.mock.calls.filter(([input]) => input === i3ContentPath)
  return { surface, fetchMock, downloads, createURL, revokeURL, clicked,
    retire: () => { current = false },
    restore: () => { cleanup(); anchor.mockRestore(); vi.unstubAllGlobals() },
  }
}

it("I3 real resource hook retains trusted size MIME and SHA instead of only a display string", async () => {
  const { renderHook } = await import("@testing-library/react")
  const { listProjectResources } = await import("@/features/app/project-resource-list")
  const { useProjectResources } = await import("@/features/app/use-project-resources")
  const fixture = await i3ResourceFixture()
  try {
    const read = (cursor: string | null, signal: AbortSignal) => listProjectResources("project-a", cursor, signal)
    const view = renderHook(() => useProjectResources("project-a", false, read))
    await waitFor(() => expect(view.result.current.status).toBe("ready"))
    expect(view.result.current.items[0]).toMatchObject({
      id: i3Asset.asset_id, name: i3Asset.filename, mimeType: i3Asset.mime_type,
      sizeBytes: i3Asset.size_bytes, contentSha256: i3Asset.content_sha256,
    })
    expect(fixture.downloads()).toHaveLength(0)
  } finally { fixture.restore() }
})

it("I3 legal owner wire opens the real Dialog without automatic download and one click starts one verified project GET", async () => {
  const fixture = await i3ResourceFixture()
  try {
    const view = render(fixture.surface())
    const dialog = openResources(view.container)
    await waitFor(() => expect(within(dialog).getByText(i3Asset.filename)).toBeInTheDocument())
    expect(fixture.fetchMock).toHaveBeenCalledTimes(1)
    expect(fixture.downloads()).toHaveLength(0)
    expect(fixture.createURL).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole("button", { name: "下载 private.txt" }))
    await waitFor(() => expect(fixture.clicked).toEqual([{ href: "blob:i3-verified-project-resource", download: "private.txt" }]))
    expect(fixture.downloads()).toHaveLength(1)
    expect(fixture.downloads()[0]?.[1]).toMatchObject({ cache: "no-store", signal: expect.any(AbortSignal) })
    expect(fixture.fetchMock.mock.calls.every(([, init]) => init?.method === undefined || init.method === "GET")).toBe(true)
    expect(fixture.createURL).toHaveBeenCalledTimes(1)
    expect(fixture.createURL).toHaveBeenCalledWith(expect.objectContaining({ size: 3, type: "text/plain" }))
    await waitFor(() => expect(fixture.revokeURL).toHaveBeenCalledWith("blob:i3-verified-project-resource"))
    expect(within(dialog).getByText("已发起下载，请在浏览器下载列表查看结果。")).toBeInTheDocument()
  } finally { fixture.restore() }
})

it("I3 explicit cancellation aborts a partial body without waiting for an uncooperative cancel Promise", async () => {
  const cancel = vi.fn(() => new Promise<void>(() => undefined))
  let first = true
  const fixture = await i3ResourceFixture(() => {
    if (!first) return i3ContentResponse()
    first = false
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("a")) }, cancel })
    return new Response(stream, { status: 200, headers: i3ContentResponse().headers })
  })
  try {
    const view = render(fixture.surface())
    const dialog = openResources(view.container)
    await waitFor(() => expect(within(dialog).getByText(i3Asset.filename)).toBeInTheDocument())
    fireEvent.click(within(dialog).getByRole("button", { name: "下载 private.txt" }))
    await waitFor(() => expect(fixture.downloads()).toHaveLength(1))
    expect(fixture.createURL).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole("button", { name: "取消下载" }))
    expect(fixture.downloads()[0]?.[1]?.signal?.aborted).toBe(true)
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1))
    const restart = within(dialog).getByRole("button", { name: "下载 private.txt" })
    expect(restart).toBeEnabled()
    expect(fixture.downloads()).toHaveLength(1)
    fireEvent.click(restart)
    await waitFor(() => expect(fixture.clicked).toHaveLength(1))
    expect(fixture.downloads()).toHaveLength(2)
  } finally { fixture.restore() }
})

it.each(["network", "SHA mismatch"] as const)("I3 %s fails visibly without a URL or automatic retry and explicit retry uses a new single GET", async (failure) => {
  let first = true
  const fixture = await i3ResourceFixture(() => {
    if (!first) return i3ContentResponse()
    first = false
    if (failure === "network") return Promise.reject(new TypeError("offline"))
    return i3ContentResponse("abd")
  })
  try {
    const view = render(fixture.surface())
    const dialog = openResources(view.container)
    await waitFor(() => expect(within(dialog).getByText(i3Asset.filename)).toBeInTheDocument())
    fireEvent.click(within(dialog).getByRole("button", { name: "下载 private.txt" }))
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("下载失败，请重试。"))
    expect(fixture.downloads()).toHaveLength(1)
    expect(fixture.createURL).not.toHaveBeenCalled()
    expect(fixture.clicked).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole("button", { name: "重新下载 private.txt" }))
    await waitFor(() => expect(fixture.clicked).toHaveLength(1))
    expect(fixture.downloads()).toHaveLength(2)
  } finally { fixture.restore() }
})

it.each(["A-B-A", "subject", "generation", "admission", "accepted deletion", "close", "unmount"] as const)("I3 real Workspace %s retires an old noncooperative download before late bytes can create an object URL", async (changed) => {
  const { act } = await import("@testing-library/react")
  const response = deferred<Response>()
  const fixture = await i3ResourceFixture(() => response.promise)
  try {
    const view = render(fixture.surface())
    const dialog = openResources(view.container)
    await waitFor(() => expect(within(dialog).getByText(i3Asset.filename)).toBeInTheDocument())
    fireEvent.click(within(dialog).getByRole("button", { name: "下载 private.txt" }))
    await waitFor(() => expect(fixture.downloads()).toHaveLength(1))
    const signal = fixture.downloads()[0]?.[1]?.signal
    expect(signal).toBeInstanceOf(AbortSignal)
    if (changed === "unmount") view.unmount()
    else if (changed === "close") fireEvent.click(within(dialog).getByRole("button", { name: "关闭对话框" }))
    else if (changed === "accepted deletion") fixture.retire()
    else if (changed === "A-B-A") {
      view.rerender(fixture.surface("project-b"))
      await waitFor(() => expect(fixture.fetchMock.mock.calls.some(([input]) => input === "/api/hub/projects/project-b/resources?limit=50")).toBe(true))
      view.rerender(fixture.surface("project-a"))
    } else view.rerender(fixture.surface("project-a", {
      admitted: changed !== "admission", subject: changed === "subject" ? "subject-b" : "subject-a",
      generation: changed === "generation" ? 2 : 1,
    }))
    await act(async () => response.resolve(i3ContentResponse()))
    if (changed === "accepted deletion") await waitFor(() => expect(signal?.aborted).toBe(true))
    expect(signal?.aborted).toBe(true)
    expect(fixture.createURL).not.toHaveBeenCalled()
    expect(fixture.clicked).toHaveLength(0)
    expect(fixture.downloads()).toHaveLength(1)
    if (changed !== "unmount") {
      if (!screen.queryByRole("dialog", { name: "文件和资源" })) openResources(view.container)
      const currentDialog = screen.getByRole("dialog", { name: "文件和资源" })
      await waitFor(() => expect(within(currentDialog).getByText(i3Asset.filename)).toBeInTheDocument())
      expect(within(currentDialog).queryByText("正在下载…")).not.toBeInTheDocument()
      expect(fixture.downloads()).toHaveLength(1)
    }
  } finally { fixture.restore() }
})

it.each(["preview", "not admitted"] as const)("I3 %s exposes a disabled explained download action and never requests content", async (mode) => {
  const fixture = await i3ResourceFixture()
  try {
    const view = render(fixture.surface("project-a", { admitted: mode !== "not admitted", subject: "subject-a", generation: 1 }, mode === "preview"))
    const dialog = openResources(view.container)
    const filename = mode === "preview" ? "研究简报.md" : i3Asset.filename
    await waitFor(() => expect(within(dialog).getByText(filename)).toBeInTheDocument())
    const action = within(dialog).getByRole("button", { name: `下载 ${filename}` })
    expect(action).toBeDisabled()
    expect(action).toHaveAccessibleDescription(/.+/)
    fireEvent.click(action)
    expect(fixture.downloads()).toHaveLength(0)
    expect(fixture.createURL).not.toHaveBeenCalled()
    expect(fixture.clicked).toHaveLength(0)
    if (mode === "preview") expect(fixture.fetchMock).not.toHaveBeenCalled()
  } finally { fixture.restore() }
})

it("I3 duplicate clicks before React commits pending still issue only one content GET", async () => {
  const { act } = await import("@testing-library/react")
  const pending = deferred<Response>()
  const fixture = await i3ResourceFixture(() => pending.promise)
  try {
    const view = render(fixture.surface())
    const dialog = openResources(view.container)
    const action = await within(dialog).findByRole("button", { name: "下载 private.txt" })
    act(() => { fireEvent.click(action); fireEvent.click(action) })
    expect(fixture.downloads()).toHaveLength(1)
    expect(fixture.createURL).not.toHaveBeenCalled()
    await act(async () => pending.resolve(i3ContentResponse()))
    await waitFor(() => expect(fixture.clicked).toHaveLength(1))
    expect(fixture.downloads()).toHaveLength(1)
    expect(fixture.revokeURL).toHaveBeenCalledExactlyOnceWith("blob:i3-verified-project-resource")
  } finally { fixture.restore() }
})
