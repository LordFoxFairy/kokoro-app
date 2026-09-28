import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const routerPush = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}))

import { LocaleProvider } from "@/i18n/context"
import { KokoroLibrarySurface } from "@/features/app/kokoro-library-surface"
import type { ArtifactList, ArtifactRecord } from "@/contract/http"

const artifacts: ArtifactRecord[] = [
  { content_hash: "hash-slide", session_id: "session-1", title: "季度汇报.pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", size: 1024, created_at: "2026-08-30T12:00:00Z" },
  { content_hash: "hash-doc", session_id: "session-2", title: "研究摘要.pdf", mime: "application/pdf", size: 2048, created_at: "2026-08-29T12:00:00Z" },
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

it("默认个人文件页签从同源 BFF 读取 Asset，且不借用作品下载或上传动作", async () => {
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
  expect(screen.queryByRole("button", { name: /上传|下载私人备忘/u })).not.toBeInTheDocument()
  expect(screen.queryByTestId("library-artifacts")).not.toBeInTheDocument()
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
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

type LibraryProps = React.ComponentProps<typeof KokoroLibrarySurface>

type LibraryRenderProps = Omit<Partial<LibraryProps>, "fixtureArtifacts"> & {
  fixtureArtifacts?: LibraryProps["fixtureArtifacts"] | undefined
}

function artifactAt(index: number): ArtifactRecord {
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
  const listArtifacts = vi.fn(async () => ({ artifacts }))
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
  let resolveRequest: (value: ArtifactList) => void = () => {}
  const artifactClient = {
    listArtifacts: vi.fn(() => new Promise<ArtifactList>((resolve) => { resolveRequest = resolve })),
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

  resolveRequest({ artifacts: [artifactAt(1)], next_cursor: "stale-cursor" })
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
  let resolveMore: (value: ArtifactList) => void = () => {}
  const listArtifacts = vi
    .fn<(cursor?: string) => Promise<ArtifactList>>()
    .mockResolvedValueOnce({ artifacts: [artifactAt(0)], next_cursor: "cursor-2" })
    .mockImplementationOnce(() => new Promise<ArtifactList>((resolve) => { resolveMore = resolve }))
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

  resolveMore({ artifacts: [artifactAt(0)], next_cursor: "stale-cursor" })
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
  const downloadArtifact = vi.fn(async () => false)
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
  expect(downloadArtifact).toHaveBeenCalledWith(artifactAt(0))
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
    .mockResolvedValueOnce(new Response(JSON.stringify({ artifacts: [artifactAt(0)] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }))
  vi.stubGlobal("fetch", (url: string, options: RequestInit) => url.startsWith("/api/hub/library")
    ? Promise.reject(new Error("fixture BFF unavailable"))
    : fetchArtifacts(url, options))
  renderLibrary({ fixtureArtifacts: undefined, preview: false })

  await waitFor(() => expect(fetchArtifacts).toHaveBeenCalledWith("/api/session/artifacts", { cache: "no-store" }))
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
  let resolveRequest: (value: { artifacts: [] }) => void = () => {}
  const artifactClient = {
    listArtifacts: vi.fn(() => new Promise<{ artifacts: [] }>((resolve) => { resolveRequest = resolve })),
  }
  renderLibrary({ fixtureArtifacts: undefined, artifactClient })

  expect(screen.getByRole("status", { name: "正在加载作品…" })).toBeInTheDocument()
  expect(screen.getAllByTestId("library-loading-group")).toHaveLength(2)
  expect(screen.getAllByTestId("library-loading-card")).toHaveLength(6)
  expect(screen.queryByTestId("library-loading-line")).not.toBeInTheDocument()

  await waitFor(() => expect(artifactClient.listArtifacts).toHaveBeenCalled())
  resolveRequest({ artifacts: [] })
  await waitFor(() => expect(screen.getByTestId("library-empty-state")).toBeInTheDocument())
})

it("通过 next_cursor 加载下一页，并在服务端重复游标时停止重复请求", async () => {
  const listArtifacts = vi
    .fn<(cursor?: string) => Promise<ArtifactList>>()
    .mockResolvedValueOnce({ artifacts: [artifactAt(0)], next_cursor: "cursor-2" })
    .mockResolvedValueOnce({ artifacts: [artifactAt(1)], next_cursor: "cursor-2" })
  renderLibrary({ fixtureArtifacts: undefined, artifactClient: { listArtifacts } })

  await screen.findByText("季度汇报.pptx")
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }))
  await screen.findByText("研究摘要.pdf")

  expect(listArtifacts).toHaveBeenNthCalledWith(1)
  expect(listArtifacts).toHaveBeenNthCalledWith(2, "cursor-2")
  expect(screen.getAllByRole("listitem")).toHaveLength(2)
  expect(screen.queryByRole("button", { name: "加载更多" })).not.toBeInTheDocument()
})

it("翻页失败时保留当前成果并提供明确的重试入口", async () => {
  const listArtifacts = vi
    .fn<(cursor?: string) => Promise<ArtifactList>>()
    .mockResolvedValueOnce({ artifacts: [artifactAt(0)], next_cursor: "cursor-2" })
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ artifacts: [artifactAt(1)] })
  renderLibrary({ fixtureArtifacts: undefined, artifactClient: { listArtifacts } })

  await screen.findByText("季度汇报.pptx")
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }))
  expect(await screen.findByText("更多成果加载失败，请重试。")).toBeInTheDocument()
  expect(screen.getByText("季度汇报.pptx")).toBeInTheDocument()

  fireEvent.click(screen.getByRole("button", { name: "重试加载更多" }))
  await screen.findByText("研究摘要.pdf")
  expect(screen.queryByText("更多成果加载失败，请重试。")).toBeNull()
  expect(listArtifacts).toHaveBeenLastCalledWith("cursor-2")
})

it("收藏筛选为空时 CTA 清除收藏筛选，不导航到新任务", async () => {
  const onPrompt = vi.fn()
  renderLibrary({ initialFavoriteHashes: [], onPrompt })
  await waitFor(() => expect(screen.getByTestId("library-artifacts")).toBeInTheDocument())

  fireEvent.click(screen.getByRole("button", { name: "仅显示收藏" }))
  expect(screen.getByTestId("library-empty-state")).toHaveTextContent("尚无收藏作品")

  fireEvent.click(screen.getByRole("button", { name: "清除筛选" }))
  await waitFor(() => expect(screen.getByTestId("library-artifacts")).toBeInTheDocument())
  expect(window.location.search).not.toContain("favorites=1")
  expect(routerPush).not.toHaveBeenCalled()
  expect(onPrompt).not.toHaveBeenCalled()
})
