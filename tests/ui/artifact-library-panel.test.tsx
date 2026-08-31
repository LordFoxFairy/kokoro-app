// 作品库面板（ARTIFACT-LIB）：卡片网格渲染 + 空态 + 游标翻页 + 来源会话跳转。客户端为注入 fake。
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ArtifactList } from "@/contract/http"
import { LocaleProvider } from "@/i18n/context"
import { ArtifactLibraryPanel } from "@/ui/library/artifact-library-panel"

function artifact(hash: string, sessionId: string): ArtifactList["artifacts"][number] {
  return {
    content_hash: hash,
    session_id: sessionId,
    title: `Artifact ${hash}`,
    mime: "application/pdf",
    size: 2048,
    created_at: "2026-07-02T00:00:01.000Z",
  }
}

function renderPanel(listArtifacts: (cursor?: string) => Promise<ArtifactList>, onOpenSession = vi.fn()) {
  return {
    onOpenSession,
    ...render(
      <ArtifactLibraryPanel client={{ listArtifacts }} onClose={vi.fn()} onOpenSession={onOpenSession} />,
      { wrapper: LocaleProvider },
    ),
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("ArtifactLibraryPanel", () => {
  it("renders artifact cards with title and size", async () => {
    renderPanel(vi.fn().mockResolvedValue({ artifacts: [artifact("h1", "s1"), artifact("h2", "s2")] }))
    await screen.findByText("Artifact h1")
    expect(screen.getByText("Artifact h2")).toBeTruthy()
    // 网格容器就位。
    expect(screen.getByTestId("library-grid")).toBeTruthy()
  })

  it("returns focus to the opener when the controlled dialog closes", async () => {
    const opener = document.createElement("button")
    opener.type = "button"
    opener.textContent = "打开作品库"
    document.body.appendChild(opener)
    opener.focus()

    renderPanel(vi.fn().mockResolvedValue({ artifacts: [] }))
    fireEvent.click(screen.getByTestId("library-close"))

    await waitFor(() => expect(opener).toHaveFocus())
    opener.remove()
  })

  it("shows empty state when there are no artifacts", async () => {
    renderPanel(vi.fn().mockResolvedValue({ artifacts: [] }))
    await screen.findByTestId("library-empty")
  })

  it("ignores a stale list response after the client changes", async () => {
    let resolveFirst!: (page: ArtifactList) => void
    const first = vi.fn(() => new Promise<ArtifactList>((resolve) => { resolveFirst = resolve }))
    const second = vi.fn().mockResolvedValue({ artifacts: [artifact("fresh", "s2")] })
    const view = render(
      <ArtifactLibraryPanel client={{ listArtifacts: first }} onClose={vi.fn()} onOpenSession={vi.fn()} />,
      { wrapper: LocaleProvider },
    )

    view.rerender(
      <LocaleProvider>
        <ArtifactLibraryPanel client={{ listArtifacts: second }} onClose={vi.fn()} onOpenSession={vi.fn()} />
      </LocaleProvider>,
    )
    await screen.findByText("Artifact fresh")

    resolveFirst({ artifacts: [artifact("stale", "s1")] })
    await waitFor(() => expect(screen.queryByText("Artifact stale")).not.toBeInTheDocument())
    expect(screen.getByText("Artifact fresh")).toBeInTheDocument()
  })

  it("paginates via next_cursor on load more", async () => {
    const listArtifacts = vi
      .fn()
      .mockResolvedValueOnce({ artifacts: [artifact("h1", "s1")], next_cursor: "cur_2" })
      .mockResolvedValueOnce({ artifacts: [artifact("h2", "s2")] })
    renderPanel(listArtifacts)
    await screen.findByText("Artifact h1")
    fireEvent.click(screen.getByText("Load more"))
    await screen.findByText("Artifact h2")
    expect(listArtifacts).toHaveBeenLastCalledWith("cur_2")
  })

  it("翻页失败时保留当前成果并提供明确的重试入口", async () => {
    const listArtifacts = vi
      .fn()
      .mockResolvedValueOnce({ artifacts: [artifact("h1", "s1")], next_cursor: "cur_2" })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ artifacts: [artifact("h2", "s2")] })
    renderPanel(listArtifacts)
    await screen.findByText("Artifact h1")

    fireEvent.click(screen.getByRole("button", { name: "Load more" }))
    expect(await screen.findByText("More artifacts failed to load. Try again.")).toBeInTheDocument()
    expect(screen.getByText("Artifact h1")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Retry loading more" }))
    await screen.findByText("Artifact h2")
    expect(screen.queryByText("More artifacts failed to load. Try again.")).toBeNull()
    expect(listArtifacts).toHaveBeenLastCalledWith("cur_2")
  })

  it("jumps to the source session on click", async () => {
    const onOpenSession = vi.fn()
    renderPanel(vi.fn().mockResolvedValue({ artifacts: [artifact("h1", "ses_src")] }), onOpenSession)
    await screen.findByText("Artifact h1")
    fireEvent.click(screen.getByText("Open source session"))
    expect(onOpenSession).toHaveBeenCalledWith("ses_src")
  })

  it("downloads through an authenticated blob and defers URL revocation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["pdf"], { type: "application/pdf" }),
    })
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:artifact")
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    renderPanel(vi.fn().mockResolvedValue({ artifacts: [artifact("h1", "s1")] }))
    await screen.findByText("Artifact h1")

    fireEvent.click(screen.getByRole("button", { name: /Download Artifact h1|下载 Artifact h1/ }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/session/artifacts/h1",
      { cache: "no-store" },
    ))
    expect(revoke).not.toHaveBeenCalled()
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:artifact"))
  })

  it("turns a failed download into an explicit retry action", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    renderPanel(vi.fn().mockResolvedValue({ artifacts: [artifact("h1", "s1")] }))
    await screen.findByText("Artifact h1")

    fireEvent.click(screen.getByRole("button", { name: /Download Artifact h1|下载 Artifact h1/ }))
    expect(await screen.findByRole("button", { name: /Retry download Artifact h1|重新下载 Artifact h1/ })).toBeInTheDocument()
    expect(screen.getByRole("alert")).toBeInTheDocument()
  })

  it("shows an error state when loading fails", async () => {
    renderPanel(vi.fn().mockRejectedValue(new Error("boom")))
    await waitFor(() => expect(screen.getByText("Failed to load artifacts")).toBeTruthy())
  })
})
