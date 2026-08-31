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

beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh")
  window.history.replaceState(null, "", "/app/library")
  routerPush.mockReset()
})

afterEach(cleanup)

type LibraryProps = React.ComponentProps<typeof KokoroLibrarySurface>

function renderLibrary(props: Partial<LibraryProps> = {}) {
  const completeProps: LibraryProps = { onPrompt: vi.fn(), fixtureArtifacts: artifacts, ...props }
  render(<LocaleProvider><KokoroLibrarySurface {...completeProps} /></LocaleProvider>)
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

  const card = screen.getAllByRole("listitem")[0]
  fireEvent.click(within(card).getByRole("button", { name: "仅显示收藏: 季度汇报.pptx" }))
  expect(onFavoriteChange).toHaveBeenCalledWith(artifacts[0], expect.any(Set))
  expect(within(card).getByRole("button", { name: "仅显示收藏: 季度汇报.pptx" })).toHaveAttribute("aria-pressed", "true")
  fireEvent.click(within(card).getByRole("button", { name: "查看来源会话" }))
  expect(onOpenSession).toHaveBeenCalledWith("session-1")

  fireEvent.click(within(card).getByRole("button", { name: "下载 季度汇报.pptx" }))
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("下载失败"))
  expect(downloadArtifact).toHaveBeenCalledWith(artifacts[0])
})

it("卡片使用独立内容和动作布局，避免继承 Card 的空壳间距", async () => {
  renderLibrary()
  await waitFor(() => expect(screen.getByTestId("library-artifacts")).toBeInTheDocument())

  const card = screen.getAllByRole("listitem")[0]
  expect(card.querySelector('[data-slot="card-content"]')).toHaveClass(/cardContent/)
  expect(card.querySelector('[data-slot="card-content"]')).toHaveClass("p-0")
  expect(card.querySelector('[class*="cardActionRow"]')).toBeInTheDocument()
  expect(within(card).getByRole("button", { name: "仅显示收藏: 季度汇报.pptx" })).toHaveClass(/favoriteCard/)
})

it("注入的 live client 失败时显示错误，而不是静默伪装成空资料库", async () => {
  const artifactClient = { listArtifacts: vi.fn(async () => { throw new Error("BFF unavailable") }) }
  renderLibrary({ fixtureArtifacts: undefined, artifactClient })

  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("作品加载失败"))
  expect(screen.queryByTestId("library-empty-state")).not.toBeInTheDocument()
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
    .mockResolvedValueOnce({ artifacts: [artifacts[0]], next_cursor: "cursor-2" })
    .mockResolvedValueOnce({ artifacts: [artifacts[1]], next_cursor: "cursor-2" })
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
    .mockResolvedValueOnce({ artifacts: [artifacts[0]], next_cursor: "cursor-2" })
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ artifacts: [artifacts[1]] })
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
