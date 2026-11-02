// 会话头部分享控件（SHARE-1）：创建→公共链接可复制→撤销回到初态。客户端为注入 fake。
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SessionClientError, type SessionClient } from "@/engine/client"
import { LocaleProvider } from "@/i18n/context"
import { ShareButton } from "@/ui/share/share-button"
import { ProductReadRecheckProvider } from "@/ui/auth/product-read-recheck-context"
import { WorkspaceHeader } from "@/components/blocks/workspace-header/workspace-header"

function makeClient(overrides: Partial<Pick<SessionClient, "readShare" | "createShare" | "revokeShare">> = {}) {
  const shares = new Map<string, { share_id: string; created_at: string; expires_at: null }>()
  const create = overrides.createShare ?? vi.fn().mockResolvedValue({ share_id: "shr_abc123" })
  const revoke = overrides.revokeShare ?? vi.fn().mockResolvedValue({ share_id: "shr_abc123" })
  return {
    readShare: overrides.readShare ?? vi.fn(async (sessionId: string) => ({ share: shares.get(sessionId) ?? null })),
    createShare: vi.fn(async (...args: Parameters<SessionClient["createShare"]>) => {
      const ack = await create(...args)
      shares.set(args[0], { share_id: ack.share_id, created_at: "2026-11-02T00:00:00.000Z", expires_at: null })
      return ack
    }),
    revokeShare: vi.fn(async (...args: Parameters<SessionClient["revokeShare"]>) => { const ack = await revoke(...args); shares.delete(args[0]); return ack }),
  }
}

afterEach(cleanup)

describe("ShareButton", () => {
  it("renders the workspace brand as read-only identity without a second model selector", () => {
    render(
      <WorkspaceHeader shareReadBoundary={shareBoundary}
        activeId="ses_1"
        shareClient={makeClient()}
      />,
      { wrapper: LocaleProvider },
    )

    const brand = screen.getByText("Kokoro")
    expect(brand).toHaveAttribute("data-slot", "workspace-brand")
    expect(brand.closest("button")).toBeNull()
    expect(screen.queryByRole("radio")).toBeNull()
    expect(screen.queryByText(/Kokoro 1\.6/u)).toBeNull()
  })

  it("opens formal credits settings directly from the empty workspace", () => {
    const onOpenSettings = vi.fn()
    render(
      <WorkspaceHeader shareReadBoundary={shareBoundary}
        activeId={null}
        emptyWorkspace
        shareClient={makeClient()}
        onOpenSettings={onOpenSettings}
      />,
      { wrapper: LocaleProvider },
    )

    fireEvent.click(screen.getByRole("button", { name: "Credits & usage" }))
    expect(onOpenSettings).toHaveBeenCalledExactlyOnceWith("credits")
  })

  it("does not invent a home balance, free plan or daily refresh", () => {
    render(
      <WorkspaceHeader shareReadBoundary={shareBoundary} activeId={null} emptyWorkspace shareClient={makeClient()} onOpenSettings={vi.fn()} />,
      { wrapper: LocaleProvider },
    )

    expect(screen.queryByText("1,000")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Credits & usage" }))
    for (const sample of ["1,000", "Free", "Free credits", "300", "Daily refresh credits", "Refreshes to 300 every day at 00:00"]) {
      expect(screen.queryByText(sample)).toBeNull()
    }
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("disables the home credits entry when no settings callback exists", () => {
    render(
      <WorkspaceHeader shareReadBoundary={shareBoundary} activeId={null} emptyWorkspace shareClient={makeClient()} />,
      { wrapper: LocaleProvider },
    )

    const credits = screen.getByRole("button", { name: "Credits & usage" })
    expect(credits).toBeDisabled()
    fireEvent.click(credits)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.queryByText("Daily refresh credits")).toBeNull()
  })

  it.each(["Enter", " "])("keeps native focus and activation for the home credits button (%s)", (key) => {
    const onOpenSettings = vi.fn()
    render(
      <WorkspaceHeader shareReadBoundary={shareBoundary} activeId={null} emptyWorkspace shareClient={makeClient()} onOpenSettings={onOpenSettings} />,
      { wrapper: LocaleProvider },
    )

    const credits = screen.getByRole("button", { name: "Credits & usage" })
    expect(credits).toBeEnabled()
    expect(credits).toHaveAttribute("type", "button")
    expect(credits.tabIndex).toBe(0)
    expect(credits).toHaveTextContent("Credits")
    expect(credits).toHaveClass("focus-visible:ring-[3px]")
    credits.focus()
    expect(credits).toHaveFocus()
    fireEvent.keyDown(credits, { key })
    fireEvent.keyUp(credits, { key })
    // jsdom does not synthesize the native button click from keyboard input.
    // Dispatch that activation explicitly; do not add a custom key handler.
    fireEvent.click(credits)
    expect(onOpenSettings).toHaveBeenCalledExactlyOnceWith("credits")
    expect(credits).not.toHaveAttribute("aria-haspopup")
  })

  it("uses the upgrade action in an active direct Web conversation", () => {
    const onOpenSettings = vi.fn()
    render(
      <WorkspaceHeader shareReadBoundary={shareBoundary}
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
      <WorkspaceHeader shareReadBoundary={shareBoundary}
        activeId="task_1"
        shareClient={makeClient()}
        projectWorkspace
        emptyWorkspace
        onOpenSettings={onOpenSettings}
      />,
      { wrapper: LocaleProvider },
    )

    expect(document.querySelector('[data-workspace-upgrade="true"]')).toBeNull()
    expect(screen.getByRole("button", { name: "项目选项" })).toBeInTheDocument()

    rerender(
      <WorkspaceHeader shareReadBoundary={shareBoundary}
        activeId="task_1"
        shareClient={makeClient()}
        projectWorkspace
        onOpenSettings={onOpenSettings}
      />,
    )

    expect(document.querySelector('[data-workspace-upgrade="true"]')).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Credits & usage" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "项目选项" })).toBeInTheDocument()
  })

  it("presents a project link as private navigation without invented owners or editable invites", async () => {
    window.history.replaceState(null, "", "/app/project/kokoro?conversation=private-task#settings")
    const client = makeClient()
    render(<WorkspaceHeader shareReadBoundary={shareBoundary} activeId="task_1" projectWorkspace shareClient={client} />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByRole("button", { name: "Share" }))
    const link = await screen.findByRole("textbox", { name: "Project link" })
    expect(link).toHaveValue("http://localhost:3000/app/project/kokoro")
    expect(link).toHaveAttribute("readonly")
    expect(screen.getByText("Copying this link does not grant access. Project access still requires sign-in and permission.")).toBeVisible()
    expect(screen.queryByText("owner@kokoro.local")).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: "Enter an email address" })).not.toBeInTheDocument()
    expect(client.createShare).not.toHaveBeenCalled()
  })

  it("copies a canonical project URL without task query or hash state", async () => {
    window.history.replaceState(null, "", "/app/project/kokoro?conversation=task_1#settings")
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    render(
      <WorkspaceHeader shareReadBoundary={shareBoundary}
        activeId="task_1"
        projectWorkspace
        shareClient={makeClient()}
      />,
      { wrapper: LocaleProvider },
    )

    fireEvent.click(screen.getByRole("button", { name: "Share" }))
    fireEvent.click(await screen.findByRole("button", { name: "Copy link" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument())
    expect(writeText).toHaveBeenCalledWith("http://localhost:3000/app/project/kokoro")
  })

  it("shows a recoverable state when project link copying is rejected", async () => {
    window.history.replaceState(null, "", "/app/project/kokoro")
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard blocked"))
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    render(
      <WorkspaceHeader shareReadBoundary={shareBoundary}
        activeId="task_1"
        projectWorkspace
        shareClient={makeClient()}
      />,
      { wrapper: LocaleProvider },
    )

    fireEvent.click(screen.getByRole("button", { name: "Share" }))
    fireEvent.click(await screen.findByRole("button", { name: "Copy link" }))
    expect(await screen.findByRole("button", { name: "Copy failed, try again" })).toBeInTheDocument()
  })

  it("opens the share panel without publishing and requires an explicit share action", async () => {
    const client = makeClient()
    render(<ShareButton readBoundary={shareBoundary} client={client} sessionId="ses_1" />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    expect(screen.getByRole("dialog", { name: "Share this session" })).toBeVisible()
    expect(client.createShare).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole("button", { name: "Share now" }))
    await screen.findByLabelText("Public share link")
    expect(client.createShare).toHaveBeenCalledExactlyOnceWith("ses_1", expect.any(AbortSignal), directShareScope)
  })

  it("closing and reopening a published link does not publish again", async () => {
    const client = makeClient()
    render(<ShareButton readBoundary={shareBoundary} client={client} sessionId="ses_1" />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    fireEvent.click(await screen.findByRole("button", { name: "Share now" }))
    await screen.findByLabelText("Public share link")
    fireEvent.click(screen.getByText("Done"))
    fireEvent.click(screen.getByTestId("share-button"))
    expect((await screen.findByLabelText("Public share link") as HTMLInputElement).value).toContain("/shared/shr_abc123")
    expect(client.createShare).toHaveBeenCalledTimes(1)
  })

  it("does not reopen when publication finishes after the panel was closed", async () => {
    let finish: ((value: { share_id: string }) => void) | undefined
    const createShare = vi.fn(() => new Promise<{ share_id: string }>(resolve => { finish = resolve }))
    render(<ShareButton readBoundary={shareBoundary} client={makeClient({ createShare })} sessionId="ses_1" />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    fireEvent.click(await screen.findByRole("button", { name: "Share now" }))
    fireEvent.click(screen.getByRole("button", { name: "Close share panel" }))
    await act(async () => { finish?.({ share_id: "shr_after_close" }) })
    expect(screen.queryByRole("dialog")).toBeNull()
    fireEvent.click(screen.getByTestId("share-button"))
    expect((await screen.findByLabelText("Public share link") as HTMLInputElement).value).toContain("shr_after_close")
    expect(createShare).toHaveBeenCalledTimes(1)
  })

  it("does not expose the previous session link when its publication finishes after navigation", async () => {
    let finish: ((value: { share_id: string }) => void) | undefined
    const createShare = vi.fn(() => new Promise<{ share_id: string }>(resolve => { finish = resolve }))
    const client = makeClient({ createShare })
    const { rerender } = render(<WorkspaceHeader shareReadBoundary={shareBoundary} activeId="ses_1" shareClient={client} />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    fireEvent.click(await screen.findByRole("button", { name: "Share now" }))
    rerender(<WorkspaceHeader shareReadBoundary={shareBoundary} activeId="ses_2" shareClient={client} />)
    await act(async () => { finish?.({ share_id: "shr_old_session" }) })
    fireEvent.click(screen.getByTestId("share-button"))
    expect(screen.queryByLabelText("Public share link")).toBeNull()
    expect(await screen.findByRole("button", { name: "Share now" })).toBeEnabled()
    expect(createShare).toHaveBeenCalledExactlyOnceWith("ses_1", expect.any(AbortSignal), directShareScope)
  })

  it("creates a share and reveals the public link", async () => {
    const client = makeClient()
    render(<ShareButton readBoundary={shareBoundary} client={client} sessionId="ses_1" />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    fireEvent.click(await screen.findByRole("button", { name: "Share now" }))
    await waitFor(() => {
      const link = screen.getByLabelText("Public share link") as HTMLInputElement
      expect(link.value).toContain("/shared/shr_abc123")
    })
    expect(screen.getByRole("dialog", { name: "Share this session" })).toBeInTheDocument()
    expect(client.createShare).toHaveBeenCalledWith("ses_1", expect.any(AbortSignal), directShareScope)
  })

  it("copies the link to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    // 只覆盖 clipboard，不整体替换 navigator（否则会抹掉 LocaleProvider 依赖的 navigator.languages）。
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    render(<ShareButton readBoundary={shareBoundary} client={makeClient()} sessionId="ses_1" />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    fireEvent.click(await screen.findByRole("button", { name: "Share now" }))
    await screen.findByText("Copy link")
    fireEvent.click(screen.getByText("Copy link"))
    await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy())
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/shared/shr_abc123"))
    await waitFor(() => expect(screen.getByText("Copied")).toHaveFocus())
  })

  it("revokes the share and returns to idle", async () => {
    const client = makeClient()
    render(<ShareButton readBoundary={shareBoundary} client={client} sessionId="ses_1" />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    fireEvent.click(await screen.findByRole("button", { name: "Share now" }))
    await screen.findByText("Revoke share")
    fireEvent.click(screen.getByText("Revoke share"))
    await screen.findByText("The existing link will stop working immediately.")
    fireEvent.click(screen.getByText("Confirm revoke"))
    await waitFor(() => expect(screen.queryByText("Revoke share")).toBeNull())
    expect(client.revokeShare).toHaveBeenCalledWith("ses_1", expect.any(AbortSignal), directShareScope)
    // 回到初态：分享触发按钮仍在。
    expect(screen.getByTestId("share-button")).toBeTruthy()
  })

  it("returns focus to the share trigger after Done", async () => {
    const client = makeClient()
    render(<ShareButton readBoundary={shareBoundary} client={client} sessionId="ses_1" />, { wrapper: LocaleProvider })
    const trigger = screen.getByTestId("share-button")
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByRole("button", { name: "Share now" }))
    await screen.findByText("Copy link")

    fireEvent.click(screen.getByText("Done"))
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByText("Copy link")).toBeNull()
  })

  it("returns focus to the matching trigger when multiple share controls are mounted", async () => {
    render(
      <>
        <ShareButton readBoundary={shareBoundary} client={makeClient()} sessionId="ses_1" />
        <ShareButton readBoundary={shareBoundary} client={makeClient()} sessionId="ses_2" />
      </>,
      { wrapper: LocaleProvider },
    )
    const triggers = screen.getAllByTestId("share-button")
    fireEvent.click(triggers[0]!)
    fireEvent.click(await screen.findByRole("button", { name: "Share now" }))
    fireEvent.click(await screen.findByText("Done"))
    await waitFor(() => expect(triggers[0]).toHaveFocus())
    expect(triggers[1]).not.toHaveFocus()
  })

  it("locks copy and revoke while the share mutation is pending", async () => {
    let resolveRevoke: ((value: { share_id: "shr_abc123" }) => void) | undefined
    const revokeShare = vi.fn().mockImplementation(
      () => new Promise<{ share_id: "shr_abc123" }>((resolve) => { resolveRevoke = resolve }),
    )
    const client = makeClient({ revokeShare })
    render(<ShareButton readBoundary={shareBoundary} client={client} sessionId="ses_1" />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    fireEvent.click(await screen.findByRole("button", { name: "Share now" }))
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
    resolveRevoke?.({ share_id: "shr_abc123" })
    await waitFor(() => expect(screen.queryByText("Revoke share")).toBeNull())
  })

  it("guards share creation before the disabled state commits", async () => {
    let resolveCreate: ((value: { share_id: string }) => void) | undefined
    const createShare = vi.fn().mockImplementation(
      () => new Promise<{ share_id: string }>((resolve) => { resolveCreate = resolve }),
    )
    render(<ShareButton readBoundary={shareBoundary} client={makeClient({ createShare })} sessionId="ses_1" />, { wrapper: LocaleProvider })

    const trigger = screen.getByTestId("share-button")
    fireEvent.click(trigger)
    const publish = await screen.findByRole("button", { name: "Share now" })
    fireEvent.click(publish)
    fireEvent.click(publish)
    expect(createShare).toHaveBeenCalledTimes(1)

    resolveCreate?.({ share_id: "shr_guarded" })
    await screen.findByDisplayValue(/shr_guarded/)
  })

  it("surfaces an error when creation fails", async () => {
    render(<ShareButton readBoundary={shareBoundary} client={makeClient({ createShare: vi.fn().mockRejectedValue(new Error("x")) })} sessionId="ses_1" />, {
      wrapper: LocaleProvider,
    })
    fireEvent.click(screen.getByTestId("share-button"))
    fireEvent.click(await screen.findByRole("button", { name: "Share now" }))
    await screen.findByText("Share failed")
  })

  it("切换会话时清理旧会话的分享浮层", async () => {
    const client = makeClient()
    const { rerender } = render(
      <WorkspaceHeader shareReadBoundary={shareBoundary}
        activeId="ses_1"
        shareClient={client}
      />,
      { wrapper: LocaleProvider },
    )
    fireEvent.click(screen.getByTestId("share-button"))
    fireEvent.click(await screen.findByRole("button", { name: "Share now" }))
    await screen.findByText("Revoke share")

    rerender(
      <WorkspaceHeader shareReadBoundary={shareBoundary}
        activeId="ses_2"
        shareClient={client}
      />,
    )
    expect(screen.queryByText("Revoke share")).toBeNull()
    expect(screen.getByTestId("share-button")).toBeInTheDocument()
    fireEvent.click(screen.getByTestId("share-button"))
    fireEvent.click(await screen.findByRole("button", { name: "Share now" }))
    await waitFor(() => expect(client.createShare).toHaveBeenLastCalledWith("ses_2", expect.any(AbortSignal), directShareScope))
  })
})

it("空正式 Home Header 不展示或切换未接 owner 的硬编码模型档位", () => {
  const { container } = render(
    <WorkspaceHeader shareReadBoundary={shareBoundary}
      activeId={null}
      emptyWorkspace
      shareClient={makeClient()}
      onOpenSettings={vi.fn()}
    />,
    { wrapper: LocaleProvider },
  )
  const fakeTierTrigger = screen.queryByRole("button", { name: "Kokoro Workspace" })
  if (fakeTierTrigger) fireEvent.click(fakeTierTrigger)

  expect({
    fakeTierTriggerVisible: fakeTierTrigger !== null,
    hardcodedTierVisible: /Kokoro 1\.6(?: Max| Lite)?/u.test(container.textContent ?? ""),
    fakeTierRadioCount: screen.queryAllByRole("radio").length,
    creditsEntryVisible: screen.queryByRole("button", { name: "Credits & usage" }) !== null,
  }).toEqual({
    fakeTierTriggerVisible: false,
    hardcodedTierVisible: false,
    fakeTierRadioCount: 0,
    creditsEntryVisible: true,
  })
})

const shareBoundary = { admitted: true, subject: "share-owner", generation: 1 }
const directShareScope = { kind: "direct" } as const
const sharedMetadata = (shareId = "shr_existing") => ({ share: { share_id: shareId, created_at: "2026-11-02T00:00:00.000Z", expires_at: null } })

describe("B10 authoritative share metadata", () => {
  it("opens and reopens with only GET and displays the existing owner link", async () => {
    const client = { ...makeClient(), readShare: vi.fn().mockResolvedValue(sharedMetadata()) }
    render(<ShareButton client={client} sessionId="ses_1" readBoundary={shareBoundary} scope={directShareScope} />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    await waitFor(() => expect(client.readShare).toHaveBeenCalledTimes(1))
    expect(await screen.findByDisplayValue(/shr_existing/u)).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    fireEvent.click(screen.getByTestId("share-button"))
    await waitFor(() => expect(client.readShare).toHaveBeenCalledTimes(2))
    expect(client.createShare).not.toHaveBeenCalled()
    expect(client.revokeShare).not.toHaveBeenCalled()
  })
  it("never presents a read failure as private and retries GET without publishing", async () => {
    const client = { ...makeClient(), readShare: vi.fn().mockRejectedValueOnce(Error("unavailable")).mockResolvedValueOnce({ share: null }) }
    render(<ShareButton client={client} sessionId="ses_1" readBoundary={shareBoundary} scope={directShareScope} />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    expect(await screen.findByText("Could not load. Please retry.")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Share now" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Reload" }))
    expect(await screen.findByRole("button", { name: "Share now" })).toBeEnabled()
    expect(client.readShare).toHaveBeenCalledTimes(2)
    expect(client.createShare).not.toHaveBeenCalled()
  })
  it("reads authority after a create ACK instead of using the ACK as the current link", async () => {
    const client = { ...makeClient(), readShare: vi.fn().mockResolvedValueOnce({ share: null }).mockResolvedValueOnce(sharedMetadata("shr_current")) }
    render(<ShareButton client={client} sessionId="ses_1" readBoundary={shareBoundary} scope={directShareScope} />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    fireEvent.click(await screen.findByRole("button", { name: "Share now" }))
    expect(await screen.findByDisplayValue(/shr_current/u)).toBeVisible()
    expect(screen.queryByDisplayValue(/shr_abc123/u)).toBeNull()
    expect(client.readShare).toHaveBeenCalledTimes(2)
    expect(client.createShare).toHaveBeenCalledTimes(1)
  })
  it("retires an old subject's read, drops its late link and requires fresh read after ABA", async () => {
    let resolveOld!: (value: ReturnType<typeof sharedMetadata>) => void
    const readShare = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve })).mockResolvedValue({ share: null })
    const client = { ...makeClient(), readShare }
    const view = (boundary: typeof shareBoundary) => <ShareButton client={client} sessionId="ses_1" readBoundary={boundary} scope={directShareScope} />
    const { rerender } = render(view(shareBoundary), { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    await waitFor(() => expect(readShare).toHaveBeenCalledTimes(1))
    const oldSignal = readShare.mock.calls[0]![1].signal as AbortSignal
    rerender(view({ ...shareBoundary, subject: "other", generation: 2 }))
    expect(oldSignal.aborted).toBe(true)
    rerender(view({ ...shareBoundary, generation: 3 }))
    await act(async () => resolveOld(sharedMetadata("shr_late_other_generation")))
    expect(screen.queryByDisplayValue(/shr_late/u)).toBeNull()
    fireEvent.click(screen.getByTestId("share-button"))
    await waitFor(() => expect(readShare).toHaveBeenCalledTimes(2))
  })
  it("refreshes an open panel on focus with GET only", async () => {
    const client = { ...makeClient(), readShare: vi.fn().mockResolvedValueOnce(sharedMetadata()).mockResolvedValueOnce({ share: null }) }
    render(<ShareButton client={client} sessionId="ses_1" readBoundary={shareBoundary} scope={directShareScope} />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    await screen.findByDisplayValue(/shr_existing/u)
    fireEvent(window, new Event("focus"))
    expect(await screen.findByRole("button", { name: "Share now" })).toBeEnabled()
    expect(client.readShare).toHaveBeenCalledTimes(2)
    expect(client.createShare).not.toHaveBeenCalled()
    expect(client.revokeShare).not.toHaveBeenCalled()
  })
  it("does not issue reads or commands without trusted admission or in preview", async () => {
    const client = { ...makeClient(), readShare: vi.fn().mockResolvedValue(sharedMetadata()) }
    const { rerender } = render(<ShareButton client={client} sessionId="ses_1" readBoundary={{ ...shareBoundary, admitted: false }} scope={directShareScope} />, { wrapper: LocaleProvider })
    expect(screen.getByTestId("share-button")).toBeDisabled()
    rerender(<ShareButton client={client} sessionId="ses_1" readBoundary={shareBoundary} scope={directShareScope} preview />)
    expect(screen.getByTestId("share-button")).toBeDisabled()
    expect(client.readShare).not.toHaveBeenCalled()
    expect(client.createShare).not.toHaveBeenCalled()
  })
})


it("B10 a read failure after ACK permits GET retry but never publishes the ACK link or repeats POST", async () => {
  const client = { ...makeClient(), readShare: vi.fn().mockResolvedValueOnce({ share: null }).mockRejectedValueOnce(Error("read unavailable")).mockResolvedValueOnce(sharedMetadata("shr_authority")) }
  render(<ShareButton client={client} sessionId="ses_1" readBoundary={shareBoundary} />, { wrapper: LocaleProvider })
  fireEvent.click(screen.getByTestId("share-button"))
  fireEvent.click(await screen.findByRole("button", { name: "Share now" }))
  await screen.findByText("Could not load. Please retry.")
  expect(screen.queryByDisplayValue(/shr_abc123/u)).toBeNull()
  expect(screen.queryByRole("button", { name: "Share now" })).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Reload" }))
  expect(await screen.findByDisplayValue(/shr_authority/u)).toBeVisible()
  expect(client.createShare).toHaveBeenCalledTimes(1)
  expect(client.readShare).toHaveBeenCalledTimes(3)
})
it("B10 a revoke ACK cannot hide a still-active authoritative share", async () => {
  const client = { ...makeClient(), readShare: vi.fn().mockResolvedValue(sharedMetadata()) }
  render(<ShareButton client={client} sessionId="ses_1" readBoundary={shareBoundary} />, { wrapper: LocaleProvider })
  fireEvent.click(screen.getByTestId("share-button"))
  fireEvent.click(await screen.findByRole("button", { name: "Revoke share" }))
  fireEvent.click(screen.getByRole("button", { name: "Confirm revoke" }))
  await waitFor(() => expect(client.readShare).toHaveBeenCalledTimes(2))
  expect(await screen.findByDisplayValue(/shr_existing/u)).toBeVisible()
  expect(screen.getByRole("dialog")).toBeVisible()
  expect(client.revokeShare).toHaveBeenCalledTimes(1)
})
it("B10 an unknown create is resolved by GET facts without automatic command replay", async () => {
  const client = makeClient({ createShare: vi.fn().mockRejectedValue(Error("lost ACK")), readShare: vi.fn().mockResolvedValueOnce({ share: null }).mockResolvedValueOnce(sharedMetadata("shr_owner_committed")) })
  render(<ShareButton client={client} sessionId="ses_1" readBoundary={shareBoundary} />, { wrapper: LocaleProvider })
  fireEvent.click(screen.getByTestId("share-button"))
  fireEvent.click(await screen.findByRole("button", { name: "Share now" }))
  expect(await screen.findByDisplayValue(/shr_owner_committed/u)).toBeVisible()
  expect(client.createShare).toHaveBeenCalledTimes(1)
  expect(client.readShare).toHaveBeenCalledTimes(2)
})
it.each([401, 403, 503])("B10 only a typed current GET401 requests original readmission (%i)", async status => {
  const recheck = vi.fn(), client = makeClient({ readShare: vi.fn().mockRejectedValue(new SessionClientError("http", "Unavailable", "session_invalid", status)) })
  render(<ProductReadRecheckProvider value={recheck}><ShareButton client={client} sessionId="ses_1" readBoundary={shareBoundary} /></ProductReadRecheckProvider>, { wrapper: LocaleProvider })
  fireEvent.click(screen.getByTestId("share-button"))
  await screen.findByText("Could not load. Please retry.")
  if (status === 401) expect(recheck).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ subject: "share-owner", generation: 1, signal: expect.any(AbortSignal) }))
  else expect(recheck).not.toHaveBeenCalled()
  expect(client.createShare).not.toHaveBeenCalled()
})
it("B10 a scope/client switch drops old URL and a late clipboard result", async () => {
  let finishCopy!: () => void
  const writeText = vi.fn(() => new Promise<void>(resolve => { finishCopy = resolve }))
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  const first = makeClient({ readShare: vi.fn().mockResolvedValue(sharedMetadata("shr_direct")) }), second = makeClient({ readShare: vi.fn().mockResolvedValue({ share: null }) })
  const { rerender } = render(<ShareButton client={first} sessionId="ses_1" readBoundary={shareBoundary} scope={directShareScope} />, { wrapper: LocaleProvider })
  fireEvent.click(screen.getByTestId("share-button"))
  fireEvent.click(await screen.findByRole("button", { name: "Copy link" }))
  rerender(<ShareButton client={second} sessionId="ses_1" readBoundary={shareBoundary} scope={{ kind: "project", projectRef: "project_one" }} />)
  await act(async () => finishCopy())
  expect(screen.queryByDisplayValue(/shr_direct/u)).toBeNull()
  expect(screen.queryByRole("dialog")).toBeNull()
  fireEvent.click(screen.getByTestId("share-button"))
  await screen.findByRole("button", { name: "Share now" })
  expect(second.readShare).toHaveBeenCalledWith("ses_1", expect.objectContaining({ scope: { kind: "project", projectRef: "project_one" } }))
  expect(screen.queryByText("Copied")).toBeNull()
})

it("B10 a repeated failed GET preserves its keyboard retry focus without stealing a Tab move", async () => {
  let rejectRead!: (reason: Error) => void
  const readShare = vi.fn().mockRejectedValueOnce(Error("unavailable")).mockImplementation(() => new Promise((_resolve, reject) => { rejectRead = reject }))
  const client = makeClient({ readShare })
  render(<ShareButton client={client} sessionId="ses_1" readBoundary={shareBoundary} />, { wrapper: LocaleProvider })
  fireEvent.click(screen.getByTestId("share-button"))
  const retry = await screen.findByRole("button", { name: "Reload" })
  retry.focus(); fireEvent.click(retry)
  expect(retry).toBeDisabled()
  retry.blur()
  await act(async () => rejectRead(Error("still unavailable")))
  expect(retry).toBeEnabled()
  expect(retry).toHaveFocus()
  fireEvent.click(retry)
  retry.blur(); fireEvent.keyDown(document, { key: "Tab" })
  const close = screen.getByRole("button", { name: "Close share panel" }); close.focus()
  await act(async () => rejectRead(Error("again unavailable")))
  expect(close).toHaveFocus()
  expect(client.createShare).not.toHaveBeenCalled()
})
it("B10 closing an in-flight read aborts it and a late response never reopens the panel", async () => {
  let finish!: (value: ReturnType<typeof sharedMetadata>) => void
  const readShare = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue({ share: null })
  const client = makeClient({ readShare })
  render(<ShareButton client={client} sessionId="ses_1" readBoundary={shareBoundary} />, { wrapper: LocaleProvider })
  const trigger = screen.getByTestId("share-button")
  fireEvent.click(trigger)
  await waitFor(() => expect(readShare).toHaveBeenCalledTimes(1))
  const signal = readShare.mock.calls[0]![1].signal as AbortSignal
  fireEvent.click(screen.getByRole("button", { name: "Close share panel" }))
  expect(signal.aborted).toBe(true)
  await act(async () => finish(sharedMetadata("shr_after_cancel")))
  expect(screen.queryByRole("dialog")).toBeNull()
  await waitFor(() => expect(trigger).toHaveFocus())
  fireEvent.click(trigger)
  expect(await screen.findByRole("button", { name: "Share now" })).toBeEnabled()
  expect(screen.queryByDisplayValue(/shr_after_cancel/u)).toBeNull()
  expect(client.createShare).not.toHaveBeenCalled()
})
it("B10 the real header passes the current read boundary and project scope", async () => {
  const client = makeClient({ readShare: vi.fn().mockResolvedValue(sharedMetadata()) })
  render(<WorkspaceHeader activeId="ses_1" shareClient={client} shareReadBoundary={shareBoundary} shareScope={{ kind: "project", projectRef: "opaque/project" }} />, { wrapper: LocaleProvider })
  fireEvent.click(screen.getByTestId("share-button"))
  await screen.findByDisplayValue(/shr_existing/u)
  expect(client.readShare).toHaveBeenCalledWith("ses_1", expect.objectContaining({ scope: { kind: "project", projectRef: "opaque/project" }, signal: expect.any(AbortSignal) }))
})
it("B10 a fresh GET showing a replacement share retires the old revoke confirmation", async () => {
  const client = makeClient({ readShare: vi.fn().mockResolvedValueOnce(sharedMetadata("shr_first")).mockResolvedValueOnce(sharedMetadata("shr_replacement")) })
  render(<ShareButton client={client} sessionId="ses_1" readBoundary={shareBoundary} />, { wrapper: LocaleProvider })
  fireEvent.click(screen.getByTestId("share-button"))
  fireEvent.click(await screen.findByRole("button", { name: "Revoke share" }))
  expect(screen.getByRole("button", { name: "Confirm revoke" })).toBeVisible()
  fireEvent(window, new Event("focus"))
  await screen.findByDisplayValue(/shr_replacement/u)
  expect(screen.queryByRole("button", { name: "Confirm revoke" })).toBeNull()
  expect(screen.getByRole("button", { name: "Revoke share" })).toBeEnabled()
  expect(client.revokeShare).not.toHaveBeenCalled()
})
it("B10 an explicit command and its authority read share one total ten-second budget", async () => {
  vi.useFakeTimers()
  try {
    let finishCommand!: (ack: { share_id: string }) => void
    const readShare = vi.fn().mockResolvedValueOnce({ share: null }).mockImplementation(() => new Promise(() => {}))
    const client = makeClient({ readShare, createShare: vi.fn(() => new Promise<{ share_id: string }>(resolve => { finishCommand = resolve })) })
    render(<ShareButton client={client} sessionId="ses_1" readBoundary={shareBoundary} />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    fireEvent.click(screen.getByRole("button", { name: "Share now" }))
    await act(async () => { await vi.advanceTimersByTimeAsync(9_000); finishCommand({ share_id: "shr_ack_only" }) })
    expect(readShare).toHaveBeenCalledTimes(2)
    const signal = readShare.mock.calls[1]![1].signal as AbortSignal
    await act(async () => { await vi.advanceTimersByTimeAsync(1_001) })
    expect(signal.aborted).toBe(true)
    expect(screen.getByText("Could not load. Please retry.")).toBeVisible()
    expect(screen.getByRole("button", { name: "Reload" })).toBeEnabled()
    expect(client.createShare).toHaveBeenCalledTimes(1)
    expect(screen.queryByDisplayValue(/shr_ack_only/u)).toBeNull()
  } finally { vi.useRealTimers() }
})

it.each(["shr_same", "shr_replacement"])("B10 reopening retires pending clipboard ownership without clearing a new copy (%s)", async nextShare => {
  let finishOld!: () => void, finishNew!: () => void
  const writeText = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finishOld = resolve })).mockImplementationOnce(() => new Promise<void>(resolve => { finishNew = resolve }))
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  const client = makeClient({ readShare: vi.fn().mockResolvedValueOnce(sharedMetadata("shr_same")).mockResolvedValue(sharedMetadata(nextShare)) })
  render(<ShareButton client={client} sessionId="ses_1" readBoundary={shareBoundary} />, { wrapper: LocaleProvider })
  const trigger = screen.getByTestId("share-button")
  fireEvent.click(trigger)
  fireEvent.click(await screen.findByRole("button", { name: "Copy link" }))
  expect(screen.getByRole("button", { name: "Copy link" })).toBeDisabled()
  fireEvent.click(screen.getByRole("button", { name: "Close share panel" }))
  await waitFor(() => expect(trigger).toHaveFocus())
  fireEvent.click(trigger)
  const newCopy = await screen.findByRole("button", { name: "Copy link" })
  expect(newCopy).toBeEnabled()
  expect(screen.getByRole("button", { name: "Revoke share" })).toBeEnabled()
  expect(screen.queryByText("Copied")).toBeNull()
  fireEvent.click(newCopy)
  const close = screen.getByRole("button", { name: "Close share panel" })
  close.focus()
  await act(async () => { finishOld(); await new Promise(resolve => setTimeout(resolve, 40)) })
  expect(newCopy).toBeDisabled()
  expect(screen.queryByText("Copied")).toBeNull()
  expect(close).toHaveFocus()
  await act(async () => finishNew())
  await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toHaveFocus())
  expect(writeText).toHaveBeenCalledTimes(2)
  expect(writeText.mock.calls[1]![0]).toContain(`/shared/${nextShare}`)
  expect(client.readShare).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole("button", { name: "Done" }))
  await waitFor(() => expect(trigger).toHaveFocus())
  fireEvent.click(trigger)
  expect(await screen.findByRole("button", { name: "Copy link" })).toBeEnabled()
  expect(screen.queryByText("Copied")).toBeNull()
  expect(client.readShare).toHaveBeenCalledTimes(3)
  expect(client.createShare).not.toHaveBeenCalled()
  expect(client.revokeShare).not.toHaveBeenCalled()
})
it("B10 a late clipboard result cannot mark or refocus the same share after reopening", async () => {
  let finishOld!: () => void
  const writeText = vi.fn(() => new Promise<void>(resolve => { finishOld = resolve }))
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  const client = makeClient({ readShare: vi.fn().mockResolvedValue(sharedMetadata("shr_same")) })
  render(<ShareButton client={client} sessionId="ses_1" readBoundary={shareBoundary} />, { wrapper: LocaleProvider })
  const trigger = screen.getByTestId("share-button")
  fireEvent.click(trigger)
  fireEvent.click(await screen.findByRole("button", { name: "Copy link" }))
  fireEvent.click(screen.getByRole("button", { name: "Close share panel" }))
  await waitFor(() => expect(trigger).toHaveFocus())
  fireEvent.click(trigger)
  await screen.findByRole("button", { name: "Copy link" })
  const close = screen.getByRole("button", { name: "Close share panel" }); close.focus()
  await act(async () => { finishOld(); await new Promise(resolve => setTimeout(resolve, 40)) })
  expect(screen.queryByText("Copied")).toBeNull()
  expect(close).toHaveFocus()
  expect(client.readShare).toHaveBeenCalledTimes(2)
})

it("B10 a replacement share in the same window retires the old clipboard intent", async () => {
  let finishOld!: () => void, finishNew!: () => void
  const writeText = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finishOld = resolve })).mockImplementationOnce(() => new Promise<void>(resolve => { finishNew = resolve }))
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  const client = makeClient({ readShare: vi.fn().mockResolvedValueOnce(sharedMetadata("shr_first")).mockResolvedValue(sharedMetadata("shr_replacement")) })
  render(<ShareButton client={client} sessionId="ses_1" readBoundary={shareBoundary} />, { wrapper: LocaleProvider })
  fireEvent.click(screen.getByTestId("share-button"))
  fireEvent.click(await screen.findByRole("button", { name: "Copy link" }))
  fireEvent(window, new Event("focus"))
  await screen.findByDisplayValue(/shr_replacement/u)
  const newCopy = screen.getByRole("button", { name: "Copy link" })
  expect(newCopy).toBeEnabled()
  expect(screen.getByRole("button", { name: "Revoke share" })).toBeEnabled()
  fireEvent.click(newCopy)
  const close = screen.getByRole("button", { name: "Close share panel" }); close.focus()
  await act(async () => { finishOld(); await new Promise(resolve => setTimeout(resolve, 40)) })
  expect(newCopy).toBeDisabled()
  expect(screen.queryByText("Copied")).toBeNull()
  expect(close).toHaveFocus()
  await act(async () => finishNew())
  await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toHaveFocus())
  expect(writeText.mock.calls[1]![0]).toContain("/shared/shr_replacement")
  expect(client.readShare).toHaveBeenCalledTimes(2)
  expect(client.createShare).not.toHaveBeenCalled()
  expect(client.revokeShare).not.toHaveBeenCalled()
})

it("B10 copied status does not refocus after an unrelated parent render", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
  const client = makeClient({ readShare: vi.fn().mockResolvedValue(sharedMetadata("shr_same")) })
  const { rerender } = render(<ShareButton client={client} sessionId="ses_1" readBoundary={shareBoundary} />, { wrapper: LocaleProvider })
  fireEvent.click(screen.getByTestId("share-button"))
  fireEvent.click(await screen.findByRole("button", { name: "Copy link" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toHaveFocus())
  const done = screen.getByRole("button", { name: "Done" }); done.focus()
  rerender(<ShareButton client={client} sessionId="ses_1" readBoundary={shareBoundary} />)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })
  expect(done).toHaveFocus()
})
