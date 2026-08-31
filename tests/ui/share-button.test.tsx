// 会话头部分享控件（SHARE-1）：创建→公共链接可复制→撤销回到初态。客户端为注入 fake。
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SessionClient } from "@/engine/client"
import { LocaleProvider } from "@/i18n/context"
import { ShareButton } from "@/ui/share/share-button"
import { WorkspaceHeader } from "@/components/blocks/workspace-header/workspace-header"

function makeClient(overrides: Partial<Pick<SessionClient, "createShare" | "revokeShare">> = {}) {
  return {
    createShare: vi.fn().mockResolvedValue({ share_id: "shr_abc123" }),
    revokeShare: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  }
}

afterEach(cleanup)

describe("ShareButton", () => {
  it("opens the desktop agent tier selector and applies the selected tier", async () => {
    render(
      <WorkspaceHeader
        activeId="ses_1"
        shareClient={makeClient()}
      />,
      { wrapper: LocaleProvider },
    )

    const trigger = screen.getByRole("button", { name: "Kokoro Workspace" })
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByRole("radio", { name: /Kokoro 1\.6 Max/ }))
    expect(trigger).toHaveTextContent("Kokoro 1.6 Max")
    expect(screen.queryByRole("dialog", { name: "Choose a Kokoro model" })).toBeNull()
  })

  it("opens the home credit summary before routing to usage details", async () => {
    const onOpenSettings = vi.fn()
    render(
      <WorkspaceHeader
        activeId={null}
        emptyWorkspace
        shareClient={makeClient()}
        onOpenSettings={onOpenSettings}
      />,
      { wrapper: LocaleProvider },
    )

    fireEvent.click(screen.getByRole("button", { name: "Credits & usage" }))
    expect(await screen.findByText("Daily refresh credits")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "View usage" }))
    expect(onOpenSettings).toHaveBeenCalledWith("credits")
  })

  it("uses the upgrade action in an active direct Web conversation", () => {
    const onOpenSettings = vi.fn()
    render(
      <WorkspaceHeader
        activeId="ses_1"
        shareClient={makeClient()}
        onOpenSettings={onOpenSettings}
      />,
      { wrapper: LocaleProvider },
    )

    const upgrade = document.querySelector('[data-workspace-upgrade="true"]') as HTMLButtonElement | null
    expect(upgrade).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "技能" })).toBeNull()
    fireEvent.click(upgrade!)
    expect(onOpenSettings).toHaveBeenCalledWith("subscription")
  })

  it("keeps the active project task toolbar while the project empty state stays compact", () => {
    const onOpenSettings = vi.fn()
    const { rerender } = render(
      <WorkspaceHeader
        activeId="task_1"
        shareClient={makeClient()}
        projectWorkspace
        emptyWorkspace
        onOpenSettings={onOpenSettings}
      />,
      { wrapper: LocaleProvider },
    )

    expect(document.querySelector('[data-workspace-upgrade="true"]')).toBeNull()
    expect(screen.getByRole("button", { name: "More settings sections" })).toBeInTheDocument()

    rerender(
      <WorkspaceHeader
        activeId="task_1"
        shareClient={makeClient()}
        projectWorkspace
        onOpenSettings={onOpenSettings}
      />,
    )

    expect(document.querySelector('[data-workspace-upgrade="true"]')).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Credits & usage" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Library" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "More settings sections" })).toBeInTheDocument()
  })

  it("creates a share and reveals the public link", async () => {
    const client = makeClient()
    render(<ShareButton client={client} sessionId="ses_1" />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    await waitFor(() => {
      const link = screen.getByLabelText("Public share link") as HTMLInputElement
      expect(link.value).toContain("/shared/shr_abc123")
    })
    expect(screen.getByRole("dialog", { name: "Share this session" })).toBeInTheDocument()
    expect(client.createShare).toHaveBeenCalledWith("ses_1")
  })

  it("copies the link to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    // 只覆盖 clipboard，不整体替换 navigator（否则会抹掉 LocaleProvider 依赖的 navigator.languages）。
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    render(<ShareButton client={makeClient()} sessionId="ses_1" />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    await screen.findByText("Copy link")
    fireEvent.click(screen.getByText("Copy link"))
    await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy())
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/shared/shr_abc123"))
    await waitFor(() => expect(screen.getByText("Copied")).toHaveFocus())
  })

  it("revokes the share and returns to idle", async () => {
    const client = makeClient()
    render(<ShareButton client={client} sessionId="ses_1" />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    await screen.findByText("Revoke share")
    fireEvent.click(screen.getByText("Revoke share"))
    await screen.findByText("The existing link will stop working immediately.")
    fireEvent.click(screen.getByText("Confirm revoke"))
    await waitFor(() => expect(screen.queryByText("Revoke share")).toBeNull())
    expect(client.revokeShare).toHaveBeenCalledWith("ses_1")
    // 回到初态：分享触发按钮仍在。
    expect(screen.getByTestId("share-button")).toBeTruthy()
  })

  it("returns focus to the share trigger after Done", async () => {
    const client = makeClient()
    render(<ShareButton client={client} sessionId="ses_1" />, { wrapper: LocaleProvider })
    const trigger = screen.getByTestId("share-button")
    fireEvent.click(trigger)
    await screen.findByText("Done")

    fireEvent.click(screen.getByText("Done"))
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByText("Copy link")).toBeNull()
  })

  it("returns focus to the matching trigger when multiple share controls are mounted", async () => {
    render(
      <>
        <ShareButton client={makeClient()} sessionId="ses_1" />
        <ShareButton client={makeClient()} sessionId="ses_2" />
      </>,
      { wrapper: LocaleProvider },
    )
    const triggers = screen.getAllByTestId("share-button")
    fireEvent.click(triggers[0]!)
    fireEvent.click(await screen.findByText("Done"))
    await waitFor(() => expect(triggers[0]).toHaveFocus())
    expect(triggers[1]).not.toHaveFocus()
  })

  it("locks copy and revoke while the share mutation is pending", async () => {
    let resolveRevoke: ((value: { ok: true }) => void) | undefined
    const revokeShare = vi.fn().mockImplementation(
      () => new Promise<{ ok: true }>((resolve) => { resolveRevoke = resolve }),
    )
    const client = makeClient({ revokeShare })
    render(<ShareButton client={client} sessionId="ses_1" />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    await screen.findByText("Revoke share")

    const revoke = screen.getByText("Revoke share") as HTMLButtonElement
    const copy = screen.getByText("Copy link") as HTMLButtonElement
    fireEvent.click(revoke)
    const confirm = await screen.findByText("Confirm revoke") as HTMLButtonElement
    fireEvent.click(confirm)
    fireEvent.click(copy)

    expect(revokeShare).toHaveBeenCalledTimes(1)
    expect(confirm).toBeDisabled()
    expect(copy).toBeDisabled()
    resolveRevoke?.({ ok: true })
    await waitFor(() => expect(screen.queryByText("Revoke share")).toBeNull())
  })

  it("guards share creation before the disabled state commits", async () => {
    let resolveCreate: ((value: { share_id: string }) => void) | undefined
    const createShare = vi.fn().mockImplementation(
      () => new Promise<{ share_id: string }>((resolve) => { resolveCreate = resolve }),
    )
    render(<ShareButton client={makeClient({ createShare })} sessionId="ses_1" />, { wrapper: LocaleProvider })

    const trigger = screen.getByTestId("share-button")
    fireEvent.click(trigger)
    fireEvent.click(trigger)
    expect(createShare).toHaveBeenCalledTimes(1)

    resolveCreate?.({ share_id: "shr_guarded" })
    await screen.findByDisplayValue(/shr_guarded/)
  })

  it("surfaces an error when creation fails", async () => {
    render(<ShareButton client={makeClient({ createShare: vi.fn().mockRejectedValue(new Error("x")) })} sessionId="ses_1" />, {
      wrapper: LocaleProvider,
    })
    fireEvent.click(screen.getByTestId("share-button"))
    await screen.findByText("Share failed")
  })

  it("切换会话时清理旧会话的分享浮层", async () => {
    const client = makeClient()
    const { rerender } = render(
      <WorkspaceHeader
        activeId="ses_1"
        shareClient={client}
      />,
      { wrapper: LocaleProvider },
    )
    fireEvent.click(screen.getByTestId("share-button"))
    await screen.findByText("Revoke share")

    rerender(
      <WorkspaceHeader
        activeId="ses_2"
        shareClient={client}
      />,
    )
    expect(screen.queryByText("Revoke share")).toBeNull()
    expect(screen.getByTestId("share-button")).toBeInTheDocument()
    fireEvent.click(screen.getByTestId("share-button"))
    await waitFor(() => expect(client.createShare).toHaveBeenLastCalledWith("ses_2"))
  })
})
