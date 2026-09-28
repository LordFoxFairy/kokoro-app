import { readFileSync } from "node:fs"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const routerPush = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}))

import { LocaleProvider } from "@/i18n/context"
import { KokoroLibrarySurface } from "@/features/app/kokoro-library-surface"
import styles from "@/features/app/kokoro-library-surface.module.css"
import type { LibraryArtifact, LibraryArtifactPage } from "@/features/app/kokoro-library-artifact-client"

const artifacts: LibraryArtifact[] = [
  { conversationId: "session-1", artifactId: "artifact-slide", assetId: "asset-slide", artifactKind: "document", title: "季度汇报.pptx", filename: "季度汇报.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", sizeBytes: "1024", deliveredAt: "2026-08-30T12:00:00Z" },
  { conversationId: "session-2", artifactId: "artifact-doc", assetId: "asset-doc", artifactKind: "document", title: "研究摘要.pdf", filename: "研究摘要.pdf", mimeType: "application/pdf", sizeBytes: "2048", deliveredAt: "2026-08-29T12:00:00Z" },
]

const fileOne = {
  kind: "file",
  asset_id: "asset-personal-1",
  filename: "私人备忘.pdf",
  mime_type: "application/pdf",
  size_bytes: "2048",
  content_sha256: "a".repeat(64),
  scan_state: "clean",
  created_at: "2026-09-28T10:00:00Z",
}

function filePage(items: readonly typeof fileOne[], nextCursor: string | null = null) {
  return { data: { items, next_cursor: nextCursor }, meta: { request_id: "req_library_1" } }
}

function cleanUploadReceipt(file: typeof fileOne = fileOne) {
  return { data: { file: {
    kind: file.kind,
    asset_id: file.asset_id,
    filename: file.filename,
    mime_type: file.mime_type,
    size_bytes: file.size_bytes,
    content_sha256: file.content_sha256,
    scan_state: file.scan_state,
  } }, meta: { request_id: "req_upload_1" } }
}

function requestUrl(input: string | Request): string {
  return typeof input === "string" ? input : new URL(input.url).pathname + new URL(input.url).search
}

// jsdom's FormData and Node's Request belong to different realms. UI tests
// model only the native Request measurement; the Node contract test below
// exercises real FormData serialization and multipart parsing.
function installUploadRequestShim() {
  vi.stubGlobal("Request", class {
    readonly url: string
    readonly method: string
    readonly headers: Headers
    readonly form: FormData
    constructor(url: URL, init: RequestInit) {
      this.url = String(url)
      this.method = init.method ?? "GET"
      this.headers = new Headers(init.headers)
      this.form = init.body as FormData
    }
    clone() {
      const file = this.form.get("files") as File
      return { arrayBuffer: async () => new ArrayBuffer(file.size + 256) }
    }
  })
}

function installDownloadDomShim() {
  const createObjectURL = vi.fn(() => "blob:library-test")
  const revokeObjectURL = vi.fn()
  vi.stubGlobal("URL", class extends URL {
    static override createObjectURL = createObjectURL
    static override revokeObjectURL = revokeObjectURL
  })
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
  return { createObjectURL, click }
}

it("默认个人文件页签从同源 BFF 读取 Asset，且不借用作品下载", async () => {
  const fetchFiles = vi.fn(async () => new Response(JSON.stringify(filePage([fileOne])), {
    status: 200,
    headers: { "content-type": "application/json" },
  }))
  vi.stubGlobal("fetch", fetchFiles)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} /></LocaleProvider>)

  expect(screen.getByRole("tab", { name: "个人文件" })).toHaveAttribute("data-state", "active")
  await screen.findByText("私人备忘.pdf")
  expect(fetchFiles).toHaveBeenCalledWith("/api/hub/library?kind=file&limit=50", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }))
  expect(screen.getByTestId("library-files")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "上传个人文件" })).toBeInTheDocument()
  expect(within(screen.getByTestId("library-files")).getByTestId("library-file-download")).toHaveAccessibleName("下载 私人备忘.pdf")
  expect(screen.queryByTestId("library-artifacts")).not.toBeInTheDocument()
})

it("个人文件卡独立在窄屏改为两行网格，下载按钮换行且不挤压文件名", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(filePage([fileOne])), { status: 200 })))
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} /></LocaleProvider>)
  const card = await screen.findByRole("listitem")
  expect(card.firstElementChild?.classList.contains(styles.fileCardMain ?? "__missing__")).toBe(true)
  const css = readFileSync("src/features/app/kokoro-library-surface.module.css", "utf8")
  expect(css).toMatch(/@media \(max-width: 48rem\)[\s\S]*?\.fileCardMain\s*\{\s*display: grid; grid-template-columns: 2rem minmax\(0, 1fr\)/u)
  expect(css).toContain(".fileCardMain .fileDownloadControls { grid-column: 1 / -1; min-width: 0; }")
  expect(css).toContain(".fileDownloadControls button { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }")
})

it("从个人文件卡点击同源 GET 后只下载完整原字节，并使用安全文件名", async () => {
  const dom = installDownloadDomShim()
  const bytes = new Uint8Array(2048).fill(71)
  const fetchFiles = vi.fn((input: string | Request) => requestUrl(input) === "/api/hub/library/files/asset-personal-1/content"
    ? Promise.resolve(new Response(bytes, { status: 200, headers: { "content-type": "application/pdf", "content-length": "2048" } }))
    : Promise.resolve(new Response(JSON.stringify(filePage([fileOne])), { status: 200 })))
  vi.stubGlobal("fetch", fetchFiles)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} /></LocaleProvider>)
  const card = await screen.findByRole("listitem")
  fireEvent.click(within(card).getByTestId("library-file-download"))
  await waitFor(() => expect(dom.click).toHaveBeenCalledTimes(1))
  expect(fetchFiles).toHaveBeenCalledWith("/api/hub/library/files/asset-personal-1/content", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }))
  expect(dom.createObjectURL).toHaveBeenCalledTimes(1)
  const downloaded = dom.click.mock.instances[0] as HTMLAnchorElement
  expect(downloaded.download).toBe("私人备忘.pdf")
  expect(downloaded.href).toBe("blob:library-test")
})

it("下载响应字节少于已校验 Asset 大小时不触发保存", async () => {
  const dom = installDownloadDomShim()
  const fetchFiles = vi.fn((input: string | Request) => requestUrl(input) === "/api/hub/library/files/asset-personal-1/content"
    ? Promise.resolve(new Response(new Uint8Array([1, 2]), { status: 200, headers: { "content-length": "2" } }))
    : Promise.resolve(new Response(JSON.stringify(filePage([fileOne])), { status: 200 })))
  vi.stubGlobal("fetch", fetchFiles)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} /></LocaleProvider>)
  const card = await screen.findByRole("listitem")
  fireEvent.click(within(card).getByTestId("library-file-download"))
  expect(await within(card).findByRole("alert")).toHaveTextContent("下载失败")
  expect(dom.click.mock.instances.filter((anchor) => (anchor as HTMLAnchorElement).download !== "")).toHaveLength(0)
})

it("个人文件名只作为安全锚点名，不把路径片段写入下载目标", async () => {
  const dom = installDownloadDomShim()
  const unsafeName = { ...fileOne, filename: "../private.txt" }
  const fetchFiles = vi.fn((input: string | Request) => requestUrl(input) === "/api/hub/library/files/asset-personal-1/content"
    ? Promise.resolve(new Response(new Uint8Array(2048), { status: 200, headers: { "content-length": "2048" } }))
    : Promise.resolve(new Response(JSON.stringify(filePage([unsafeName])), { status: 200 })))
  vi.stubGlobal("fetch", fetchFiles)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} /></LocaleProvider>)
  const card = await screen.findByRole("listitem")
  fireEvent.click(within(card).getByTestId("library-file-download"))
  await waitFor(() => expect(dom.click).toHaveBeenCalledTimes(1))
  const downloaded = dom.click.mock.instances[0] as HTMLAnchorElement
  expect(downloaded.download).not.toMatch(/[\\/]/u)
  expect(downloaded.download).not.toMatch(/^\./u)
})

it.each([404, 401, 502])("文件下载 %i 在同一私有卡就近显示错误，并只由用户重试", async (status) => {
  installDownloadDomShim()
  let downloads = 0
  const fetchFiles = vi.fn((input: string | Request) => {
    if (requestUrl(input) === "/api/hub/library/files/asset-personal-1/content") {
      downloads++
      return Promise.resolve(new Response(downloads === 1 ? "{}" : new Uint8Array(2048), {
        status: downloads === 1 ? status : 200,
        headers: downloads === 1 ? { "content-type": "application/json" } : { "content-type": "application/pdf", "content-length": "2048" },
      }))
    }
    return Promise.resolve(new Response(JSON.stringify(filePage([fileOne])), { status: 200 }))
  })
  vi.stubGlobal("fetch", fetchFiles)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} /></LocaleProvider>)
  const card = await screen.findByRole("listitem")
  fireEvent.click(within(card).getByTestId("library-file-download"))
  const alert = await within(card).findByRole("alert")
  expect(alert).toHaveTextContent(status === 404 ? "文件不可用或你无权访问" : status === 401 ? "登录已失效" : "下载失败")
  expect(downloads).toBe(1)
  fireEvent.click(within(card).getByTestId("library-file-download"))
  await waitFor(() => expect(downloads).toBe(2))
  await waitFor(() => expect(within(card).queryByRole("alert")).not.toBeInTheDocument())
})

it("下载中禁重复点击，显式取消及切换作品页签均中止在途请求", async () => {
  const dom = installDownloadDomShim()
  let resolveDownload: (response: Response) => void = () => {}
  const fetchFiles = vi.fn((input: string | Request, init?: RequestInit) => {
    void init
    return requestUrl(input) === "/api/hub/library/files/asset-personal-1/content"
      ? new Promise<Response>((resolve) => { resolveDownload = resolve })
      : Promise.resolve(new Response(JSON.stringify(filePage([fileOne])), { status: 200 }))
  })
  vi.stubGlobal("fetch", fetchFiles)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} fixtureArtifacts={artifacts} /></LocaleProvider>)
  const card = await screen.findByRole("listitem")
  const button = within(card).getByTestId("library-file-download")
  fireEvent.click(button)
  fireEvent.click(button)
  expect(button).toBeDisabled()
  const calls = fetchFiles.mock.calls.filter(([input]) => requestUrl(input) === "/api/hub/library/files/asset-personal-1/content")
  expect(calls).toHaveLength(1)
  const signal = (calls[0]?.[1] as { signal: AbortSignal }).signal
  fireEvent.click(within(card).getByRole("button", { name: "取消下载" }))
  expect(signal.aborted).toBe(true)
  resolveDownload(new Response(new Uint8Array(2048), { status: 200, headers: { "content-length": "2048" } }))
  await waitFor(() => expect(button).not.toBeDisabled())
  expect(dom.click.mock.instances.filter((anchor) => (anchor as HTMLAnchorElement).download === "私人备忘.pdf")).toHaveLength(0)
  fireEvent.click(button)
  const nextCalls = fetchFiles.mock.calls.filter(([input]) => requestUrl(input) === "/api/hub/library/files/asset-personal-1/content")
  const nextSignal = (nextCalls[1]?.[1] as { signal: AbortSignal }).signal
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Agent 作品" }), { button: 0, ctrlKey: false })
  expect(nextSignal.aborted).toBe(true)
})

it("完整响应已读取但共享下载 helper 尚在异步 Blob 阶段时取消，不触发锚点保存", async () => {
  const dom = installDownloadDomShim()
  const fetchFiles = vi.fn((input: string | Request) => requestUrl(input) === "/api/hub/library/files/asset-personal-1/content"
    ? Promise.resolve(new Response(new Uint8Array(2048), { status: 200, headers: { "content-length": "2048" } }))
    : Promise.resolve(new Response(JSON.stringify(filePage([fileOne])), { status: 200 })))
  vi.stubGlobal("fetch", fetchFiles)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} /></LocaleProvider>)
  const card = await screen.findByRole("listitem")
  const originalBlob = Response.prototype.blob
  let resolveHelperBlob: (blob: Blob) => void = () => {}
  let blobReads = 0
  vi.spyOn(Response.prototype, "blob").mockImplementation(function (this: Response) {
    blobReads++
    if (blobReads === 2) return new Promise<Blob>((resolve) => { resolveHelperBlob = resolve })
    return originalBlob.call(this)
  })
  fireEvent.click(within(card).getByTestId("library-file-download"))
  await waitFor(() => expect(blobReads).toBe(2))
  fireEvent.click(within(card).getByRole("button", { name: "取消下载" }))
  resolveHelperBlob(new Blob([new Uint8Array(2048)]))
  await waitFor(() => expect(within(card).getByTestId("library-file-download")).not.toBeDisabled())
  expect(dom.createObjectURL).not.toHaveBeenCalled()
  expect(dom.click).not.toHaveBeenCalled()
})

it("用户点击单文件上传后只以重新读取的个人 GET 显示文件", async () => {
  installUploadRequestShim()
  let resolveRefresh: (response: Response) => void = () => {}
  let getCount = 0
  const calls = vi.fn((input: string | Request) => {
    if (requestUrl(input) === "/api/hub/library/files") return Promise.resolve(new Response(JSON.stringify(cleanUploadReceipt()), { status: 200 }))
    if (++getCount === 1)
      return Promise.resolve(new Response(JSON.stringify(filePage([])), { status: 200 }))
    return new Promise<Response>((resolve) => { resolveRefresh = resolve })
  })
  vi.stubGlobal("fetch", calls)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} /></LocaleProvider>)
  await screen.findByTestId("library-files-empty")

  const file = new File([new Uint8Array(2048)], "私人备忘.pdf", { type: "application/pdf" })
  fireEvent.change(screen.getByLabelText("选择个人文件"), { target: { files: [file] } })
  fireEvent.click(screen.getByRole("button", { name: "上传个人文件" }))
  await waitFor(() => expect(calls.mock.calls.some(([input]) => requestUrl(input) === "/api/hub/library/files")).toBe(true))
  expect(screen.queryByText("私人备忘.pdf", { selector: "[data-asset-id] *" })).not.toBeInTheDocument()
  await waitFor(() => expect(getCount).toBe(2))
  resolveRefresh(new Response(JSON.stringify(filePage([fileOne])), { status: 200 }))
  await screen.findByTestId("library-files")
  expect(screen.getByText("私人备忘.pdf", { selector: "[data-asset-id] *" })).toBeInTheDocument()
  const post = calls.mock.calls.find(([input]) => requestUrl(input) === "/api/hub/library/files")?.[0] as Request
  expect(post.method).toBe("POST")
  expect(post.headers.get("Idempotency-Key")).toMatch(/^library-file:/u)
})

it("上传响应未知时切到作品再返回仍保留同一文件和键供显式重试", async () => {
  installUploadRequestShim()
  let postAttempts = 0
  const calls = vi.fn((input: string | Request) => {
    if (requestUrl(input) === "/api/hub/library/files") {
      postAttempts++
      return postAttempts === 1 ? Promise.reject(new Error("connection lost"))
        : Promise.resolve(new Response(JSON.stringify(cleanUploadReceipt()), { status: 200 }))
    }
    return Promise.resolve(new Response(JSON.stringify(filePage(postAttempts >= 2 ? [fileOne] : [])), { status: 200 }))
  })
  vi.stubGlobal("fetch", calls)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} fixtureArtifacts={artifacts} /></LocaleProvider>)
  await screen.findByTestId("library-files-empty")
  fireEvent.change(screen.getByLabelText("选择个人文件"), { target: { files: [new File([new Uint8Array(2048)], "私人备忘.pdf", { type: "application/pdf" })] } })
  fireEvent.click(screen.getByRole("button", { name: "上传个人文件" }))
  expect(await screen.findByRole("button", { name: "重试上传同一文件" })).toBeInTheDocument()
  const firstKey = (calls.mock.calls.find(([input]) => requestUrl(input) === "/api/hub/library/files")?.[0] as Request).headers.get("Idempotency-Key")
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Agent 作品" }), { button: 0, ctrlKey: false })
  await screen.findByText("季度汇报.pptx")
  fireEvent.mouseDown(screen.getByRole("tab", { name: "个人文件" }), { button: 0, ctrlKey: false })
  expect(screen.getByRole("button", { name: "重试上传同一文件" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "重试上传同一文件" }))
  await waitFor(() => expect(screen.getByTestId("library-files")).toHaveTextContent("私人备忘.pdf"))
  const postCalls = calls.mock.calls.filter(([input]) => requestUrl(input) === "/api/hub/library/files")
  const secondKey = (postCalls[1]?.[0] as Request).headers.get("Idempotency-Key")
  expect(secondKey).toBe(firstKey)
})

it("上传仍在途时切换作品页签，未知结果返回后保留原意图", async () => {
  installUploadRequestShim()
  let rejectUpload: (reason?: unknown) => void = () => {}
  const calls = vi.fn((input: string | Request) => requestUrl(input) === "/api/hub/library/files"
    ? new Promise<Response>((_resolve, reject) => { rejectUpload = reject })
    : Promise.resolve(new Response(JSON.stringify(filePage([])), { status: 200 })))
  vi.stubGlobal("fetch", calls)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} fixtureArtifacts={artifacts} /></LocaleProvider>)
  await screen.findByTestId("library-files-empty")
  fireEvent.change(screen.getByLabelText("选择个人文件"), { target: { files: [new File(["hello"], "私人备忘.pdf", { type: "application/pdf" })] } })
  fireEvent.click(screen.getByRole("button", { name: "上传个人文件" }))
  await waitFor(() => expect(calls.mock.calls.some(([input]) => requestUrl(input) === "/api/hub/library/files")).toBe(true))
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Agent 作品" }), { button: 0, ctrlKey: false })
  await screen.findByText("季度汇报.pptx")
  rejectUpload(new Error("connection lost"))
  fireEvent.mouseDown(screen.getByRole("tab", { name: "个人文件" }), { button: 0, ctrlKey: false })
  expect(await screen.findByRole("button", { name: "重试上传同一文件" })).toBeInTheDocument()
  expect(screen.getByText("私人备忘.pdf")).toBeInTheDocument()
})

it("扫描待定 503 只在明确点击时同键重试，双击不并发发送", async () => {
  installUploadRequestShim()
  let postAttempts = 0
  const calls = vi.fn((input: string | Request) => {
    if (requestUrl(input) === "/api/hub/library/files") {
      postAttempts++
      return Promise.resolve(new Response(JSON.stringify(postAttempts === 1
        ? { error: { code: "library_file_scan_pending" } } : cleanUploadReceipt()), { status: postAttempts === 1 ? 503 : 200 }))
    }
    return Promise.resolve(new Response(JSON.stringify(filePage(postAttempts >= 2 ? [fileOne] : [])), { status: 200 }))
  })
  vi.stubGlobal("fetch", calls)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} /></LocaleProvider>)
  await screen.findByTestId("library-files-empty")
  fireEvent.change(screen.getByLabelText("选择个人文件"), { target: { files: [new File([new Uint8Array(2048)], "私人备忘.pdf", { type: "application/pdf" })] } })
  const submit = screen.getByRole("button", { name: "上传个人文件" })
  fireEvent.click(submit)
  fireEvent.click(submit)
  expect(await screen.findByRole("button", { name: "重试上传同一文件" })).toBeInTheDocument()
  expect(screen.getByRole("alert")).toHaveTextContent("仍在处理中")
  expect(postAttempts).toBe(1)
  const first = calls.mock.calls.find(([input]) => requestUrl(input) === "/api/hub/library/files")?.[0] as Request
  fireEvent.click(screen.getByRole("button", { name: "重试上传同一文件" }))
  await waitFor(() => expect(screen.getByTestId("library-files")).toHaveTextContent("私人备忘.pdf"))
  const posts = calls.mock.calls.filter(([input]) => requestUrl(input) === "/api/hub/library/files")
  expect(posts).toHaveLength(2)
  expect((posts[1]?.[0] as Request).headers.get("Idempotency-Key")).toBe(first.headers.get("Idempotency-Key"))
})

it("幂等请求仍在处理 409 显示同文件稍后重试，而非上传失败", async () => {
  installUploadRequestShim()
  const calls = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(filePage([])), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "idempotency_in_progress" } }), { status: 409 }))
  vi.stubGlobal("fetch", calls)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} /></LocaleProvider>)
  await screen.findByTestId("library-files-empty")
  fireEvent.change(screen.getByLabelText("选择个人文件"), { target: { files: [new File(["hello"], "私人备忘.pdf", { type: "application/pdf" })] } })
  fireEvent.click(screen.getByRole("button", { name: "上传个人文件" }))
  expect(await screen.findByRole("button", { name: "重试上传同一文件" })).toBeInTheDocument()
  expect(screen.getByRole("alert")).toHaveTextContent("仍在处理中")
  expect(calls).toHaveBeenCalledTimes(2)
})

it("CLEAN POST 后个人 GET 失败仍显示读取错误而不插入回执卡片", async () => {
  installUploadRequestShim()
  let getCount = 0
  const calls = vi.fn((input: string | Request) => {
    if (requestUrl(input) === "/api/hub/library/files")
      return Promise.resolve(new Response(JSON.stringify(cleanUploadReceipt()), { status: 200 }))
    getCount++
    return Promise.resolve(getCount === 1
      ? new Response(JSON.stringify(filePage([])), { status: 200 })
      : new Response("{}", { status: 503 }))
  })
  vi.stubGlobal("fetch", calls)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} /></LocaleProvider>)
  await screen.findByTestId("library-files-empty")
  fireEvent.change(screen.getByLabelText("选择个人文件"), { target: { files: [new File([new Uint8Array(2048)], "私人备忘.pdf", { type: "application/pdf" })] } })
  fireEvent.click(screen.getByRole("button", { name: "上传个人文件" }))
  expect(await screen.findByText("个人文件加载失败")).toBeInTheDocument()
  expect(screen.queryByTestId("library-files")).not.toBeInTheDocument()
  expect(calls.mock.calls.filter(([input]) => requestUrl(input) === "/api/hub/library/files")).toHaveLength(1)
})

it.each([
  [409, "idempotency_conflict"],
  [409, "file_upload_aborted"],
  [422, "library_file_infected"],
])("上传终态 %i %s 不提供同键重试", async (status, code) => {
  installUploadRequestShim()
  const calls = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(filePage([])), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code } }), { status }))
  vi.stubGlobal("fetch", calls)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} /></LocaleProvider>)
  await screen.findByTestId("library-files-empty")
  fireEvent.change(screen.getByLabelText("选择个人文件"), { target: { files: [new File(["hello"], "私人备忘.pdf", { type: "application/pdf" })] } })
  fireEvent.click(screen.getByRole("button", { name: "上传个人文件" }))
  expect(await screen.findByRole("alert")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "重试上传同一文件" })).not.toBeInTheDocument()
  expect(calls).toHaveBeenCalledTimes(2)
})

it("整个 multipart 超过 1 MiB 时不发送上传请求", async () => {
  installUploadRequestShim()
  const calls = vi.fn(async () => new Response(JSON.stringify(filePage([])), { status: 200 }))
  vi.stubGlobal("fetch", calls)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} /></LocaleProvider>)
  await screen.findByTestId("library-files-empty")
  fireEvent.change(screen.getByLabelText("选择个人文件"), { target: { files: [new File([new Uint8Array(1024 * 1024 - 8)], "almost.bin", { type: "application/octet-stream" })] } })
  fireEvent.click(screen.getByRole("button", { name: "上传个人文件" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("1 MiB")
  expect(calls).toHaveBeenCalledTimes(1)
})

it("个人文件仅在有效 200 空页显示空态，503 后明确错误并由点击重试", async () => {
  const fetchFiles = vi.fn()
    .mockResolvedValueOnce(new Response("{}", { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(filePage([])), { status: 200 }))
  vi.stubGlobal("fetch", fetchFiles)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} /></LocaleProvider>)

  expect(await screen.findByText("个人文件加载失败")).toBeInTheDocument()
  expect(screen.queryByTestId("library-files-empty")).not.toBeInTheDocument()
  expect(fetchFiles).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole("button", { name: "重新加载个人文件" }))
  expect(await screen.findByTestId("library-files-empty")).toHaveTextContent("暂无个人文件")
  expect(fetchFiles).toHaveBeenCalledTimes(2)
})

it("个人文件拒绝缺字段、错误 kind 或非 CLEAN 的伪 200，不回落空态", async () => {
  const fetchFiles = vi.fn(async () => new Response(JSON.stringify(filePage([{ ...fileOne, kind: "artifact", scan_state: "pending" }])), { status: 200 }))
  vi.stubGlobal("fetch", fetchFiles)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} /></LocaleProvider>)

  expect(await screen.findByText("个人文件加载失败")).toBeInTheDocument()
  expect(screen.queryByTestId("library-files-empty")).not.toBeInTheDocument()
  expect(screen.queryByTestId("library-files")).not.toBeInTheDocument()
})

it("个人文件按 opaque cursor 分页、asset_id 去重，并阻止 owner 重复游标循环", async () => {
  const fileTwo = { ...fileOne, asset_id: "asset-personal-2", filename: "私有图表.csv" }
  const fetchFiles = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(filePage([fileOne], "cursor-2")), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(filePage([fileOne, fileTwo], "cursor-2")), { status: 200 }))
  vi.stubGlobal("fetch", fetchFiles)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} /></LocaleProvider>)

  await screen.findByText("私人备忘.pdf")
  fireEvent.click(screen.getByRole("button", { name: "加载更多文件" }))
  await screen.findByText("私有图表.csv")
  expect(fetchFiles).toHaveBeenNthCalledWith(2, "/api/hub/library?kind=file&limit=50&cursor=cursor-2", expect.any(Object))
  expect(within(screen.getByTestId("library-files")).getAllByRole("listitem")).toHaveLength(2)
  expect(screen.queryByRole("button", { name: "加载更多文件" })).not.toBeInTheDocument()
  expect(fetchFiles).toHaveBeenCalledTimes(2)
})

it("个人文件翻页失败保留已确认页且只在显式重试时复用原 cursor", async () => {
  const fileTwo = { ...fileOne, asset_id: "asset-personal-2", filename: "私有图表.csv" }
  const fetchFiles = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(filePage([fileOne], "cursor-2")), { status: 200 }))
    .mockResolvedValueOnce(new Response("{}", { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(filePage([fileTwo])), { status: 200 }))
  vi.stubGlobal("fetch", fetchFiles)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} /></LocaleProvider>)

  await screen.findByText("私人备忘.pdf")
  fireEvent.click(screen.getByRole("button", { name: "加载更多文件" }))
  expect(await screen.findByText("更多文件加载失败，请重试。")).toBeInTheDocument()
  expect(screen.getByText("私人备忘.pdf")).toBeInTheDocument()
  expect(fetchFiles).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole("button", { name: "重试加载更多文件" }))
  await screen.findByText("私有图表.csv")
  expect(fetchFiles).toHaveBeenNthCalledWith(3, "/api/hub/library?kind=file&limit=50&cursor=cursor-2", expect.any(Object))
})

it("切到 Agent 作品时取消个人文件在途 GET，返回时重新读取而不接纳迟到旧页", async () => {
  let resolveOld: (response: Response) => void = () => {}
  const fetchFiles = vi.fn()
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve }))
    .mockResolvedValueOnce(new Response(JSON.stringify(filePage([])), { status: 200 }))
  vi.stubGlobal("fetch", fetchFiles)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} fixtureArtifacts={artifacts} /></LocaleProvider>)
  await waitFor(() => expect(fetchFiles).toHaveBeenCalledTimes(1))
  const firstSignal = (fetchFiles.mock.calls[0]?.[1] as { signal: AbortSignal }).signal
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Agent 作品" }), { button: 0, ctrlKey: false })
  expect(firstSignal.aborted).toBe(true)
  expect(await screen.findByText("季度汇报.pptx")).toBeInTheDocument()
  resolveOld(new Response(JSON.stringify(filePage([fileOne])), { status: 200 }))
  fireEvent.mouseDown(screen.getByRole("tab", { name: "个人文件" }), { button: 0, ctrlKey: false })
  expect(await screen.findByTestId("library-files-empty")).toBeInTheDocument()
  expect(screen.queryByText("私人备忘.pdf")).not.toBeInTheDocument()
})

beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh")
  window.history.replaceState(null, "", "/app/library")
  routerPush.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

type LibraryProps = React.ComponentProps<typeof KokoroLibrarySurface>

type LibraryRenderProps = Omit<Partial<LibraryProps>, "fixtureArtifacts"> & {
  fixtureArtifacts?: LibraryProps["fixtureArtifacts"] | undefined
}

function artifactAt(index: number): LibraryArtifact {
  const artifact = artifacts.at(index)
  if (artifact === undefined) {
    throw new Error(`Expected fixture artifact at index ${index}`)
  }
  return artifact
}

function listItemAt(index: number): HTMLElement {
  const item = screen.getAllByRole("listitem").at(index)
  if (item === undefined) {
    throw new Error(`Expected library list item at index ${index}`)
  }
  return item
}

function renderLibrary(props: LibraryRenderProps = {}) {
  const { fixtureArtifacts, ...rest } = props
  const commonProps: Omit<LibraryProps, "fixtureArtifacts"> = { onPrompt: vi.fn(), ...rest }
  const hasFixtureOverride = Object.prototype.hasOwnProperty.call(props, "fixtureArtifacts")
  const completeProps: LibraryProps = hasFixtureOverride
    ? fixtureArtifacts === undefined ? commonProps : { ...commonProps, fixtureArtifacts }
    : { ...commonProps, fixtureArtifacts: artifacts }
  render(<LocaleProvider><KokoroLibrarySurface {...completeProps} /></LocaleProvider>)
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Agent 作品" }), { button: 0, ctrlKey: false })
}

it("加载资料库后可筛选、搜索、收藏和切换列表视图，并同步 URL", async () => {
  renderLibrary()
  await waitFor(() => expect(screen.getByTestId("library-artifacts")).toBeInTheDocument())

  expect(screen.getAllByRole("listitem")).toHaveLength(2)
  fireEvent.click(screen.getByRole("radio", { name: "投影片" }))
  expect(screen.getAllByRole("listitem")).toHaveLength(1)
  expect(window.location.search).toBe("?type=slides")

  fireEvent.click(screen.getByRole("radio", { name: "清单视图" }))
  expect(screen.getByTestId("library-artifacts")).toHaveAttribute("data-view", "list")
  expect(window.location.search).toContain("view=list")

  fireEvent.click(screen.getByRole("button", { name: "仅显示收藏" }))
  expect(screen.getByTestId("library-empty-state")).toBeInTheDocument()
  expect(window.location.search).toContain("favorites=1")

  fireEvent.click(screen.getByRole("button", { name: "仅显示收藏" }))
  fireEvent.click(screen.getByRole("radio", { name: "全部" }))
  fireEvent.change(screen.getByRole("textbox", { name: "搜寻档案" }), { target: { value: "研究" } })
  expect(screen.getByText("研究摘要.pdf")).toBeInTheDocument()
})

it("已挂载时收到站内 surface 导航事件会重新读取资料库 URL 状态", async () => {
  window.history.replaceState(null, "", "/app/library?type=slides&view=list&favorites=1&q=研究")
  renderLibrary()
  await waitFor(() => expect(screen.getByTestId("library-empty-state")).toBeInTheDocument())

  window.history.pushState(null, "", "/app/library")
  fireEvent(window, new Event("kokoro:surface-navigation"))

  await waitFor(() => expect(screen.getByTestId("library-artifacts")).toHaveAttribute("data-view", "grid"))
  expect(screen.getByRole("radio", { name: "全部" })).toHaveAttribute("data-state", "on")
  expect(screen.getByRole("textbox", { name: "搜寻档案" })).toHaveValue("")
  expect(screen.getByRole("button", { name: "仅显示收藏" })).toHaveAttribute("aria-pressed", "false")
})

it("窄桌面分类条是明确的横向滚动区域，支持键盘滚动并显示边缘提示", () => {
  renderLibrary()
  const viewport = screen.getByTestId("library-filter-scroll")
  Object.defineProperties(viewport, {
    clientWidth: { configurable: true, value: 240 },
    scrollWidth: { configurable: true, value: 640 },
    scrollLeft: { configurable: true, writable: true, value: 0 },
  })
  const scrollTo = vi.fn(({ left }: { left: number }) => {
    Object.defineProperty(viewport, "scrollLeft", { configurable: true, writable: true, value: left })
    fireEvent.scroll(viewport)
  })
  Object.defineProperty(viewport, "scrollTo", { configurable: true, value: scrollTo })

  expect(viewport).toHaveAttribute("role", "region")
  expect(viewport).toHaveAttribute("tabindex", "0")
  fireEvent.scroll(viewport)
  expect(viewport).toHaveAttribute("data-overflow-right", "true")

  fireEvent.keyDown(viewport, { key: "ArrowRight" })
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 192, behavior: "smooth" })
  expect(viewport).toHaveAttribute("data-overflow-left", "true")

  fireEvent.keyDown(viewport, { key: "End" })
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 400, behavior: "smooth" })
})

it("进入 Agent 作品页签时注入的资料库 fixture 同步渲染", () => {
  renderLibrary()

  expect(screen.getByTestId("library-artifacts")).toBeInTheDocument()
})

it("收藏作品跨个人文件页签切换保留，默认文件页签不预载作品", async () => {
  const listArtifacts = vi.fn(async () => ({ items: artifacts, nextCursor: null }))
  const fetchFiles = vi.fn(async () => new Response(JSON.stringify(filePage([])), { status: 200 }))
  vi.stubGlobal("fetch", fetchFiles)
  render(<LocaleProvider><KokoroLibrarySurface onPrompt={vi.fn()} artifactClient={{ listArtifacts }} /></LocaleProvider>)

  await screen.findByTestId("library-files-empty")
  expect(listArtifacts).not.toHaveBeenCalled()

  fireEvent.mouseDown(screen.getByRole("tab", { name: "Agent 作品" }), { button: 0, ctrlKey: false })
  await screen.findByText("季度汇报.pptx")
  fireEvent.click(screen.getByRole("button", { name: "仅显示收藏: 季度汇报.pptx" }))
  expect(screen.getByRole("button", { name: "仅显示收藏: 季度汇报.pptx" })).toHaveAttribute("aria-pressed", "true")

  fireEvent.mouseDown(screen.getByRole("tab", { name: "个人文件" }), { button: 0, ctrlKey: false })
  expect(screen.queryByTestId("library-artifacts")).not.toBeInTheDocument()
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Agent 作品" }), { button: 0, ctrlKey: false })
  expect(await screen.findByText("季度汇报.pptx")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "仅显示收藏: 季度汇报.pptx" })).toHaveAttribute("aria-pressed", "true")
})

it("资料库从异步加载切换为受控 fixture 时结束 loading 并忽略旧请求结果", async () => {
  let resolveRequest: (value: LibraryArtifactPage) => void = () => {}
  const artifactClient = {
    listArtifacts: vi.fn(() => new Promise<LibraryArtifactPage>((resolve) => { resolveRequest = resolve })),
  }
  const initialProps: LibraryProps = { onPrompt: vi.fn(), artifactClient }
  const view = render(
    <LocaleProvider><KokoroLibrarySurface {...initialProps} /></LocaleProvider>,
  )
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Agent 作品" }), { button: 0, ctrlKey: false })

  expect(screen.getByRole("status", { name: "正在加载作品…" })).toBeInTheDocument()

  view.rerender(
    <LocaleProvider><KokoroLibrarySurface {...initialProps} fixtureArtifacts={[artifactAt(0)]} /></LocaleProvider>,
  )

  expect(await screen.findByText("季度汇报.pptx")).toBeInTheDocument()
  expect(screen.queryByRole("status", { name: "正在加载作品…" })).not.toBeInTheDocument()

  resolveRequest({ items: [artifactAt(1)], nextCursor: "stale-cursor" })
  await waitFor(() => expect(screen.queryByText("研究摘要.pdf")).not.toBeInTheDocument())
  expect(screen.queryByRole("button", { name: "加载更多" })).not.toBeInTheDocument()
})

it("受控 fixture 接管失败的首屏请求时清除错误态", async () => {
  const artifactClient = {
    listArtifacts: vi.fn(async () => { throw new Error("BFF unavailable") }),
  }
  const initialProps: LibraryProps = { onPrompt: vi.fn(), artifactClient }
  const view = render(
    <LocaleProvider><KokoroLibrarySurface {...initialProps} /></LocaleProvider>,
  )
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Agent 作品" }), { button: 0, ctrlKey: false })

  await screen.findByText("作品加载失败")

  view.rerender(
    <LocaleProvider><KokoroLibrarySurface {...initialProps} fixtureArtifacts={[artifactAt(0)]} /></LocaleProvider>,
  )

  expect(await screen.findByText("季度汇报.pptx")).toBeInTheDocument()
  expect(screen.queryByText("作品加载失败")).not.toBeInTheDocument()
})

it("受控 fixture 接管进行中的翻页时清除分页并忽略旧页面", async () => {
  let resolveMore: (value: LibraryArtifactPage) => void = () => {}
  const listArtifacts = vi
    .fn<(cursor: string | null, _signal: AbortSignal) => Promise<LibraryArtifactPage>>()
    .mockResolvedValueOnce({ items: [artifactAt(0)], nextCursor: "cursor-2" })
    .mockImplementationOnce(() => new Promise<LibraryArtifactPage>((resolve) => { resolveMore = resolve }))
  const initialProps: LibraryProps = { onPrompt: vi.fn(), artifactClient: { listArtifacts } }
  const view = render(
    <LocaleProvider><KokoroLibrarySurface {...initialProps} /></LocaleProvider>,
  )
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Agent 作品" }), { button: 0, ctrlKey: false })

  await screen.findByText("季度汇报.pptx")
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }))
  await waitFor(() => expect(listArtifacts).toHaveBeenCalledTimes(2))

  view.rerender(
    <LocaleProvider><KokoroLibrarySurface {...initialProps} fixtureArtifacts={[artifactAt(1)]} /></LocaleProvider>,
  )

  expect(await screen.findByText("研究摘要.pdf")).toBeInTheDocument()
  expect(screen.queryByTestId("library-pagination")).not.toBeInTheDocument()

  resolveMore({ items: [artifactAt(0)], nextCursor: "stale-cursor" })
  await waitFor(() => expect(screen.queryByText("季度汇报.pptx")).not.toBeInTheDocument())
})

it("无匹配筛选时给出明确空态并可一键恢复", async () => {
  renderLibrary()
  await waitFor(() => expect(screen.getByTestId("library-artifacts")).toBeInTheDocument())

  fireEvent.change(screen.getByRole("textbox", { name: "搜寻档案" }), { target: { value: "不存在的作品" } })
  expect(screen.getByTestId("library-empty-state")).toHaveTextContent("没有匹配的作品")
  expect(screen.getByRole("button", { name: "清除筛选" })).toBeInTheDocument()
  expect(screen.queryByText("资料库中没有内容")).toBeNull()

  fireEvent.click(screen.getByRole("button", { name: "清除筛选" }))
  expect(screen.getByTestId("library-artifacts")).toBeInTheDocument()
  expect(screen.getByText("季度汇报.pptx")).toBeInTheDocument()
})

it("收藏卡片、打开来源和下载失败均保持明确的可恢复状态", async () => {
  const downloadArtifact = vi.fn(async () => { throw new Error("preflight failed") })
  const onFavoriteChange = vi.fn()
  const onOpenSession = vi.fn()
  renderLibrary({ downloadArtifact, onFavoriteChange, onOpenSession })
  await waitFor(() => expect(screen.getByTestId("library-artifacts")).toBeInTheDocument())

  const card = listItemAt(0)
  fireEvent.click(within(card).getByRole("button", { name: "仅显示收藏: 季度汇报.pptx" }))
  expect(onFavoriteChange).toHaveBeenCalledWith(artifactAt(0), expect.any(Set))
  expect(within(card).getByRole("button", { name: "仅显示收藏: 季度汇报.pptx" })).toHaveAttribute("aria-pressed", "true")
  fireEvent.click(within(card).getByRole("button", { name: "查看来源会话" }))
  expect(onOpenSession).toHaveBeenCalledWith("session-1")

  fireEvent.click(within(card).getByRole("button", { name: "下载 季度汇报.pptx" }))
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("下载失败"))
  expect(downloadArtifact).toHaveBeenCalledWith(artifactAt(0), expect.any(AbortSignal))
})

it("卡片使用独立内容和动作布局，避免继承 Card 的空壳间距", async () => {
  renderLibrary()
  await waitFor(() => expect(screen.getByTestId("library-artifacts")).toBeInTheDocument())

  const card = listItemAt(0)
  expect(card.querySelector('[data-slot="card-content"]')).toHaveClass(/cardContent/)
  expect(card.querySelector('[data-slot="card-content"]')).toHaveClass("p-0")
  expect(card.querySelector('[class*="cardActionRow"]')).toBeInTheDocument()
  expect(within(card).getByRole("button", { name: "仅显示收藏: 季度汇报.pptx" })).toHaveClass(/favoriteCard/)
})

it("注入的 live client 失败时显示错误，而不是静默伪装成空资料库", async () => {
  const artifactClient = { listArtifacts: vi.fn(async () => { throw new Error("BFF unavailable") }) }
  renderLibrary({ fixtureArtifacts: undefined, artifactClient })

  expect(artifactClient.listArtifacts).toHaveBeenCalledTimes(1)

  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("作品加载失败"))
  expect(screen.queryByTestId("library-empty-state")).not.toBeInTheDocument()
})

it("开发环境未注入 client 的正式资料库请求同源 live，失败可见且只在点击后重试", async () => {
  vi.stubEnv("NODE_ENV", "development")
  const fetchArtifacts = vi.fn()
    .mockResolvedValueOnce(new Response("{}", { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { items: [{ kind: "artifact", conversation_id: "session-1", artifact_id: "artifact-slide", asset_id: "asset-slide", artifact_kind: "document", title: "季度汇报.pptx", filename: "季度汇报.pptx", mime_type: "application/pdf", size_bytes: "1024", content_sha256: "a".repeat(64), source_run_id: "run-1", delivered_at: "2026-08-30T12:00:00Z" }], next_cursor: null }, meta: { request_id: "req-1" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }))
  vi.stubGlobal("fetch", (url: string, options: RequestInit) => url.includes("kind=file")
    ? Promise.resolve(new Response(JSON.stringify(filePage([])), { status: 200 }))
    : fetchArtifacts(url, options))
  renderLibrary({ fixtureArtifacts: undefined, preview: false })

  await waitFor(() => expect(fetchArtifacts).toHaveBeenCalledWith("/api/hub/library?kind=artifact&limit=50", expect.objectContaining({ cache: "no-store" })))
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("作品加载失败"))
  expect(screen.queryByTestId("library-empty-state")).not.toBeInTheDocument()
  expect(fetchArtifacts).toHaveBeenCalledTimes(1)

  fireEvent.click(screen.getByRole("button", { name: "重新加载作品" }))
  expect(await screen.findByText("季度汇报.pptx")).toBeInTheDocument()
  expect(fetchArtifacts).toHaveBeenCalledTimes(2)
})

it("显式 preview 仍使用资料库 fixture transport，不请求正式同源 API", async () => {
  const fetchArtifacts = vi.fn()
  vi.stubGlobal("fetch", fetchArtifacts)
  renderLibrary({ fixtureArtifacts: undefined, preview: true })

  await screen.findByTestId("library-empty-state")
  expect(fetchArtifacts).not.toHaveBeenCalled()
})

it("加载中保持与目录相同的三列卡片骨架，不用低高度横线占位", async () => {
  let resolveRequest: (value: { items: [], nextCursor: null }) => void = () => {}
  const artifactClient = {
    listArtifacts: vi.fn(() => new Promise<{ items: [], nextCursor: null }>((resolve) => { resolveRequest = resolve })),
  }
  renderLibrary({ fixtureArtifacts: undefined, artifactClient })

  expect(screen.getByRole("status", { name: "正在加载作品…" })).toBeInTheDocument()
  expect(screen.getAllByTestId("library-loading-group")).toHaveLength(2)
  expect(screen.getAllByTestId("library-loading-card")).toHaveLength(6)
  expect(screen.queryByTestId("library-loading-line")).not.toBeInTheDocument()

  await waitFor(() => expect(artifactClient.listArtifacts).toHaveBeenCalled())
  resolveRequest({ items: [], nextCursor: null })
  await waitFor(() => expect(screen.getByTestId("library-empty-state")).toBeInTheDocument())
})

it("通过 next_cursor 加载下一页，并在服务端重复游标时停止重复请求", async () => {
  const listArtifacts = vi
    .fn<(cursor: string | null, _signal: AbortSignal) => Promise<LibraryArtifactPage>>()
    .mockResolvedValueOnce({ items: [artifactAt(0)], nextCursor: "cursor-2" })
    .mockResolvedValueOnce({ items: [artifactAt(1)], nextCursor: "cursor-2" })
  renderLibrary({ fixtureArtifacts: undefined, artifactClient: { listArtifacts } })

  await screen.findByText("季度汇报.pptx")
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }))
  await screen.findByText("研究摘要.pdf")

  expect(listArtifacts).toHaveBeenNthCalledWith(1, null, expect.any(AbortSignal))
  expect(listArtifacts).toHaveBeenNthCalledWith(2, "cursor-2", expect.any(AbortSignal))
  expect(screen.getAllByRole("listitem")).toHaveLength(2)
  expect(screen.queryByRole("button", { name: "加载更多" })).not.toBeInTheDocument()
})

it("翻页失败时保留当前成果并提供明确的重试入口", async () => {
  const listArtifacts = vi
    .fn<(cursor: string | null, _signal: AbortSignal) => Promise<LibraryArtifactPage>>()
    .mockResolvedValueOnce({ items: [artifactAt(0)], nextCursor: "cursor-2" })
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ items: [artifactAt(1)], nextCursor: null })
  renderLibrary({ fixtureArtifacts: undefined, artifactClient: { listArtifacts } })

  await screen.findByText("季度汇报.pptx")
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }))
  expect(await screen.findByText("更多成果加载失败，请重试。")).toBeInTheDocument()
  expect(screen.getByText("季度汇报.pptx")).toBeInTheDocument()

  fireEvent.click(screen.getByRole("button", { name: "重试加载更多" }))
  await screen.findByText("研究摘要.pdf")
  expect(screen.queryByText("更多成果加载失败，请重试。")).toBeNull()
  expect(listArtifacts).toHaveBeenLastCalledWith("cursor-2", expect.any(AbortSignal))
})

it("收藏筛选为空时 CTA 清除收藏筛选，不导航到新任务", async () => {
  const onPrompt = vi.fn()
  renderLibrary({ initialFavoriteIds: [], onPrompt })
  await waitFor(() => expect(screen.getByTestId("library-artifacts")).toBeInTheDocument())

  fireEvent.click(screen.getByRole("button", { name: "仅显示收藏" }))
  expect(screen.getByTestId("library-empty-state")).toHaveTextContent("尚无收藏作品")

  fireEvent.click(screen.getByRole("button", { name: "清除筛选" }))
  await waitFor(() => expect(screen.getByTestId("library-artifacts")).toBeInTheDocument())
  expect(window.location.search).not.toContain("favorites=1")
  expect(routerPush).not.toHaveBeenCalled()
  expect(onPrompt).not.toHaveBeenCalled()
})

it("正式作品页用二元 Product 列表，空页带 cursor 时继续加载而不走 hash Session API", async () => {
  const liveArtifact = {
    kind: "artifact", conversation_id: "conversation-1", artifact_id: "artifact-1", asset_id: "asset-1",
    artifact_kind: "document", title: "正式报告", filename: "report.pdf", mime_type: "application/pdf",
    size_bytes: "24", content_sha256: "a".repeat(64), source_run_id: "run-1", delivered_at: "2026-09-28T10:00:00Z",
  }
  const fetcher = vi.fn(async (input: string) => {
    if (input.includes("kind=file")) return new Response(JSON.stringify(filePage([])), { status: 200 })
    if (input.includes("cursor=continue-1")) return new Response(JSON.stringify({ data: { items: [liveArtifact], next_cursor: null }, meta: { request_id: "req-2" } }), { status: 200 })
    if (input.includes("kind=artifact")) return new Response(JSON.stringify({ data: { items: [], next_cursor: "continue-1" }, meta: { request_id: "req-1" } }), { status: 200 })
    throw new Error(`Unexpected legacy URL ${input}`)
  })
  vi.stubGlobal("fetch", fetcher)
  renderLibrary({ fixtureArtifacts: undefined })
  expect(await screen.findByRole("button", { name: "加载更多" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }))
  expect(await screen.findByText("正式报告")).toBeInTheDocument()
  expect(fetcher.mock.calls.some(([url]) => String(url).includes("/api/session/artifacts"))).toBe(false)
  expect(fetcher.mock.calls.some(([url]) => String(url).includes("kind=artifact&limit=50"))).toBe(true)
})
