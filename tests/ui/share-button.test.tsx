// 会话头部分享控件（SHARE-1）：创建→公共链接可复制→撤销回到初态。客户端为注入 fake。
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SessionClient } from "@/engine/client"
import { LocaleProvider } from "@/i18n/context"
import { ShareButton } from "@/ui/share/share-button"
import { WorkspaceHeader } from "@/components/blocks/workspace-header/workspace-header"

function makeClient(overrides: Partial<Pick<SessionClient, "readShare" | "createShare" | "revokeShare">> = {}) {
  const shares = new Map<string, { share_id: string; created_at: string; expires_at: null }>()
  return {
    readShare: overrides.readShare ?? vi.fn(async (id: string) => ({ share: shares.get(id) ?? null })),
    createShare: vi.fn(async (...args: Parameters<SessionClient["createShare"]>) => {
      const receipt = await (overrides.createShare?.(...args) ?? Promise.resolve({ share_id: "shr_abc123" }))
      shares.set(args[0], { ...receipt, created_at: "2026-11-12T00:00:00Z", expires_at: null })
      return receipt
    }),
    revokeShare: vi.fn(async (...args: Parameters<SessionClient["revokeShare"]>) => {
      const receipt = await (overrides.revokeShare?.(...args) ?? Promise.resolve({ share_id: "shr_abc123" }))
      shares.delete(args[0])
      return receipt
    }),
  }
}
async function publishShare() {
  const action = await screen.findByRole("button", { name: "Share now" })
  await waitFor(() => expect(action).toBeEnabled())
  fireEvent.click(action)
}

afterEach(cleanup)

describe("ShareButton", () => {
  it("renders the workspace brand as read-only identity without a second model selector", () => {
    render(
      <WorkspaceHeader
        shareReadBoundary={{ admitted: true, subject: "share-owner", generation: 1 }}
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
      <WorkspaceHeader
        shareReadBoundary={{ admitted: true, subject: "share-owner", generation: 1 }}
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
      <WorkspaceHeader shareReadBoundary={{ admitted: true, subject: "share-owner", generation: 1 }} activeId={null} emptyWorkspace shareClient={makeClient()} onOpenSettings={vi.fn()} />,
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
      <WorkspaceHeader shareReadBoundary={{ admitted: true, subject: "share-owner", generation: 1 }} activeId={null} emptyWorkspace shareClient={makeClient()} />,
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
      <WorkspaceHeader shareReadBoundary={{ admitted: true, subject: "share-owner", generation: 1 }} activeId={null} emptyWorkspace shareClient={makeClient()} onOpenSettings={onOpenSettings} />,
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
      <WorkspaceHeader
        shareReadBoundary={{ admitted: true, subject: "share-owner", generation: 1 }}
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
        shareReadBoundary={{ admitted: true, subject: "share-owner", generation: 1 }}
        activeId="task_1"
        shareClient={makeClient()}
        projectWorkspace
        emptyWorkspace
        onOpenSettings={onOpenSettings}
      />,
      { wrapper: LocaleProvider },
    )

    expect(document.querySelector('[data-workspace-upgrade="true"]')).toBeNull()
    expect(screen.getByRole("button", { name: "Project options" })).toBeInTheDocument()

    rerender(
      <WorkspaceHeader
        shareReadBoundary={{ admitted: true, subject: "share-owner", generation: 1 }}
        activeId="task_1"
        shareClient={makeClient()}
        projectWorkspace
        onOpenSettings={onOpenSettings}
      />,
    )

    expect(document.querySelector('[data-workspace-upgrade="true"]')).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Credits & usage" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Project options" })).toBeInTheDocument()
  })

  // Private URL-copy UI was replaced by the real Project Grant workflow.
  // Its positive/unknown/retirement behavior is covered in project-share.test.tsx.
  it("does not invent Project sharing authority from a route or a private Session share client", () => {
    const client = makeClient()
    render(<WorkspaceHeader shareReadBoundary={{ admitted: true, subject: "share-owner", generation: 1 }} activeId="task_1" projectWorkspace shareClient={client} />, { wrapper: LocaleProvider })
    expect(screen.getByRole("button", { name: "Share" })).toBeDisabled()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(client.createShare).not.toHaveBeenCalled()
  })

  it("opens the share panel without publishing and requires an explicit share action", async () => {
    const client = makeClient()
    render(<ShareButton readBoundary={{ admitted: true, subject: "share-owner", generation: 1 }} client={client} sessionId="ses_1" />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    expect(screen.getByRole("dialog", { name: "Share this session" })).toBeVisible()
    expect(client.createShare).not.toHaveBeenCalled()
    await publishShare()
    await screen.findByLabelText("Public share link")
    expect(client.createShare).toHaveBeenCalledExactlyOnceWith("ses_1", expect.any(AbortSignal), { kind: "direct" }, expect.stringMatching(/^session-mutation:/))
  })

  it("closing and reopening a published link does not publish again", async () => {
    const client = makeClient()
    render(<ShareButton readBoundary={{ admitted: true, subject: "share-owner", generation: 1 }} client={client} sessionId="ses_1" />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    await publishShare()
    await screen.findByLabelText("Public share link")
    fireEvent.click(screen.getByText("Done"))
    fireEvent.click(screen.getByTestId("share-button"))
    expect((await screen.findByLabelText("Public share link") as HTMLInputElement).value).toContain("/shared/shr_abc123")
    expect(client.createShare).toHaveBeenCalledTimes(1)
  })

  it("does not reopen when publication finishes after the panel was closed", async () => {
    let finish: ((value: { share_id: string }) => void) | undefined
    const createShare = vi.fn(() => new Promise<{ share_id: string }>(resolve => { finish = resolve }))
    render(<ShareButton readBoundary={{ admitted: true, subject: "share-owner", generation: 1 }} client={makeClient({ createShare })} sessionId="ses_1" />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    await publishShare()
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
    const { rerender } = render(<WorkspaceHeader shareReadBoundary={{ admitted: true, subject: "share-owner", generation: 1 }} activeId="ses_1" shareClient={client} />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    await publishShare()
    rerender(<WorkspaceHeader shareReadBoundary={{ admitted: true, subject: "share-owner", generation: 1 }} activeId="ses_2" shareClient={client} />)
    await act(async () => { finish?.({ share_id: "shr_old_session" }) })
    fireEvent.click(screen.getByTestId("share-button"))
    expect(screen.queryByLabelText("Public share link")).toBeNull()
    await waitFor(() => expect(screen.getByRole("button", { name: "Share now" })).toBeEnabled())
    expect(createShare).toHaveBeenCalledExactlyOnceWith("ses_1", expect.any(AbortSignal), { kind: "direct" }, expect.stringMatching(/^session-mutation:/))
  })

  it("creates a share and reveals the public link", async () => {
    const client = makeClient()
    render(<ShareButton readBoundary={{ admitted: true, subject: "share-owner", generation: 1 }} client={client} sessionId="ses_1" />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    await publishShare()
    await waitFor(() => {
      const link = screen.getByLabelText("Public share link") as HTMLInputElement
      expect(link.value).toContain("/shared/shr_abc123")
    })
    expect(screen.getByRole("dialog", { name: "Share this session" })).toBeInTheDocument()
    expect(client.createShare).toHaveBeenCalledWith("ses_1", expect.any(AbortSignal), { kind: "direct" }, expect.stringMatching(/^session-mutation:/))
  })

  it("copies the link to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    // 只覆盖 clipboard，不整体替换 navigator（否则会抹掉 LocaleProvider 依赖的 navigator.languages）。
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    render(<ShareButton readBoundary={{ admitted: true, subject: "share-owner", generation: 1 }} client={makeClient()} sessionId="ses_1" />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    await publishShare()
    await screen.findByText("Copy link")
    fireEvent.click(screen.getByText("Copy link"))
    await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy())
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/shared/shr_abc123"))
    await waitFor(() => expect(screen.getByText("Copied")).toHaveFocus())
  })

  it("revokes the share and returns to idle", async () => {
    const client = makeClient()
    render(<ShareButton readBoundary={{ admitted: true, subject: "share-owner", generation: 1 }} client={client} sessionId="ses_1" />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    await publishShare()
    await screen.findByText("Revoke share")
    fireEvent.click(screen.getByText("Revoke share"))
    await screen.findByText("The existing link will stop working immediately.")
    fireEvent.click(screen.getByText("Confirm revoke"))
    await waitFor(() => expect(screen.queryByText("Revoke share")).toBeNull())
    expect(client.revokeShare).toHaveBeenCalledWith("ses_1", expect.any(AbortSignal), { kind: "direct" }, expect.stringMatching(/^session-mutation:/))
    // 回到初态：分享触发按钮仍在。
    expect(screen.getByTestId("share-button")).toBeTruthy()
  })

  it("returns focus to the share trigger after Done", async () => {
    const client = makeClient()
    render(<ShareButton readBoundary={{ admitted: true, subject: "share-owner", generation: 1 }} client={client} sessionId="ses_1" />, { wrapper: LocaleProvider })
    const trigger = screen.getByTestId("share-button")
    fireEvent.click(trigger)
    await publishShare()
    await screen.findByText("Copy link")

    fireEvent.click(screen.getByText("Done"))
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByText("Copy link")).toBeNull()
  })

  it("returns focus to the matching trigger when multiple share controls are mounted", async () => {
    render(
      <>
        <ShareButton readBoundary={{ admitted: true, subject: "share-owner", generation: 1 }} client={makeClient()} sessionId="ses_1" />
        <ShareButton readBoundary={{ admitted: true, subject: "share-owner", generation: 1 }} client={makeClient()} sessionId="ses_2" />
      </>,
      { wrapper: LocaleProvider },
    )
    const triggers = screen.getAllByTestId("share-button")
    fireEvent.click(triggers[0]!)
    await publishShare()
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
    render(<ShareButton readBoundary={{ admitted: true, subject: "share-owner", generation: 1 }} client={client} sessionId="ses_1" />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByTestId("share-button"))
    await publishShare()
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
    render(<ShareButton readBoundary={{ admitted: true, subject: "share-owner", generation: 1 }} client={makeClient({ createShare })} sessionId="ses_1" />, { wrapper: LocaleProvider })

    const trigger = screen.getByTestId("share-button")
    fireEvent.click(trigger)
    const publish = await screen.findByRole("button", { name: "Share now" })
    await waitFor(() => expect(publish).toBeEnabled())
    fireEvent.click(publish)
    fireEvent.click(publish)
    expect(createShare).toHaveBeenCalledTimes(1)

    resolveCreate?.({ share_id: "shr_guarded" })
    await screen.findByDisplayValue(/shr_guarded/)
  })

  it("surfaces an error when creation fails", async () => {
    render(<ShareButton readBoundary={{ admitted: true, subject: "share-owner", generation: 1 }} client={makeClient({ createShare: vi.fn().mockRejectedValue(new Error("x")) })} sessionId="ses_1" />, {
      wrapper: LocaleProvider,
    })
    fireEvent.click(screen.getByTestId("share-button"))
    await publishShare()
    await screen.findByText("Share failed")
  })

  it("切换会话时清理旧会话的分享浮层", async () => {
    const client = makeClient()
    const { rerender } = render(
      <WorkspaceHeader
        shareReadBoundary={{ admitted: true, subject: "share-owner", generation: 1 }}
        activeId="ses_1"
        shareClient={client}
      />,
      { wrapper: LocaleProvider },
    )
    fireEvent.click(screen.getByTestId("share-button"))
    await publishShare()
    await screen.findByText("Revoke share")

    rerender(
      <WorkspaceHeader
        shareReadBoundary={{ admitted: true, subject: "share-owner", generation: 1 }}
        activeId="ses_2"
        shareClient={client}
      />,
    )
    expect(screen.queryByText("Revoke share")).toBeNull()
    expect(screen.getByTestId("share-button")).toBeInTheDocument()
    fireEvent.click(screen.getByTestId("share-button"))
    await publishShare()
    await waitFor(() => expect(client.createShare).toHaveBeenLastCalledWith("ses_2", expect.any(AbortSignal), { kind: "direct" }, expect.stringMatching(/^session-mutation:/)))
  })
})

it("空正式 Home Header 不展示或切换未接 owner 的硬编码模型档位", () => {
  const { container } = render(
    <WorkspaceHeader
        shareReadBoundary={{ admitted: true, subject: "share-owner", generation: 1 }}
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


it("opening an existing Session Share reads fresh metadata without publishing", async () => {
  const readShare = vi.fn().mockResolvedValue({ share: { share_id: "shr_existing", created_at: "2026-11-12T00:00:00Z", expires_at: null } })
  const client = Object.assign(makeClient(), { readShare })
  render(<ShareButton readBoundary={{ admitted: true, subject: "share-owner", generation: 1 }} client={client} sessionId="ses_1" />, { wrapper: LocaleProvider })
  fireEvent.click(screen.getByRole("button", { name: "Share" }))
  await waitFor(() => expect(readShare).toHaveBeenCalledOnce())
  expect(await screen.findByRole("textbox", { name: "Public share link" })).toHaveValue("http://localhost:3000/shared/shr_existing")
  expect(client.createShare).not.toHaveBeenCalled()
})

it("failed metadata reads retry GET only; a null read alone enables explicit publication", async () => {
  const readShare = vi.fn().mockRejectedValueOnce(Error("unavailable")).mockResolvedValue({ share: null })
  const client = makeClient({ readShare })
  render(<LocaleProvider><ShareButton client={client} sessionId="read-only" readBoundary={{ admitted: true, subject: "owner", generation: 1 }} /></LocaleProvider>)
  fireEvent.click(screen.getByTestId("share-button"))
  fireEvent.click(await screen.findByRole("button", { name: "Reload" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "Share now" })).toBeEnabled())
  expect(readShare).toHaveBeenCalledTimes(2)
  expect(client.createShare).not.toHaveBeenCalled(); expect(client.revokeShare).not.toHaveBeenCalled()
})

it("an uncertain publication keeps the original key through close and same-actor readmission; new actors inherit neither link nor command", async () => {
  const createShare = vi.fn().mockRejectedValueOnce(Error("lost ACK")).mockResolvedValue({ share_id: "confirmed-original" })
  const client = makeClient({ createShare })
  let boundary = { admitted: true, subject: "actor-A", generation: 1 }
  const content = () => <LocaleProvider><ShareButton client={client} sessionId="unknown-share" readBoundary={boundary} /></LocaleProvider>
  const view = render(content())
  fireEvent.click(screen.getByTestId("share-button")); await publishShare()
  await screen.findByRole("button", { name: "Retry original request" })
  const original = createShare.mock.calls[0]!
  fireEvent.click(screen.getByRole("button", { name: "Close share panel" }))
  boundary = { ...boundary, admitted: false }; view.rerender(content())
  boundary = { ...boundary, admitted: true, generation: 2 }; view.rerender(content())
  expect(screen.queryByRole("dialog")).toBeNull()
  fireEvent.click(screen.getByTestId("share-button"))
  const retry = await screen.findByRole("button", { name: "Retry original request" })
  await waitFor(() => expect(retry).toBeEnabled()); fireEvent.click(retry)
  await screen.findByDisplayValue(/confirmed-original/)
  expect(createShare.mock.calls[1]?.slice(0, 1)).toEqual(original.slice(0, 1))
  expect(createShare.mock.calls[1]?.slice(2)).toEqual(original.slice(2))
  boundary = { ...boundary, subject: "actor-B", generation: 3 }; view.rerender(content())
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByDisplayValue(/confirmed-original/)).toBeNull()
  expect(createShare).toHaveBeenCalledTimes(2)
})

it("a confirmed publication followed by a failed fresh read is recovered by GET, never a second publish", async () => {
  const readShare = vi.fn().mockResolvedValueOnce({ share: null }).mockRejectedValueOnce(Error("read unavailable")).mockResolvedValue({ share: { share_id: "fresh-link", created_at: "2026-11-12T00:00:00Z", expires_at: null } })
  const client = makeClient({ readShare })
  render(<LocaleProvider><ShareButton client={client} sessionId="post-read" readBoundary={{ admitted: true, subject: "owner", generation: 1 }} /></LocaleProvider>)
  fireEvent.click(screen.getByTestId("share-button")); await publishShare()
  fireEvent.click(await screen.findByRole("button", { name: "Reload" }))
  await screen.findByDisplayValue(/fresh-link/)
  expect(client.createShare).toHaveBeenCalledOnce(); expect(readShare).toHaveBeenCalledTimes(3)
})

it.each(["same-owner", "other-tenant", "other-actor"] as const)("unavailable admission omitting tenant retains only the verified owner's uncertain share command (%s)", async restored => {
  const createShare = vi.fn().mockRejectedValueOnce(Error("lost ACK")).mockResolvedValue({ share_id: "original-owner-share" })
  const client = makeClient({ createShare })
  let boundary: { admitted: boolean; subject: string; generation: number; tenant?: string } = { admitted: true, subject: "actor-A", tenant: "tenant-A", generation: 1 }
  const content = () => <LocaleProvider><ShareButton client={client} sessionId="tenant-fenced-share" readBoundary={boundary} /></LocaleProvider>
  const view = render(content())
  fireEvent.click(screen.getByTestId("share-button")); await publishShare()
  await screen.findByRole("button", { name: "Retry original request" })
  const original = createShare.mock.calls[0]!
  const readsBeforeUnavailable = vi.mocked(client.readShare).mock.calls.length
  boundary = { admitted: false, subject: "actor-A", generation: 2 }; view.rerender(content())
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByRole("textbox", { name: "Public share link" })).toBeNull()
  expect(screen.getByTestId("share-button")).toBeDisabled(); fireEvent.click(screen.getByTestId("share-button"))
  expect(createShare).toHaveBeenCalledOnce(); expect(client.readShare).toHaveBeenCalledTimes(readsBeforeUnavailable); expect(client.revokeShare).not.toHaveBeenCalled()
  boundary = { admitted: true, subject: restored === "other-actor" ? "actor-B" : "actor-A", tenant: restored === "other-tenant" ? "tenant-B" : "tenant-A", generation: 3 }; view.rerender(content())
  fireEvent.click(screen.getByTestId("share-button"))
  if (restored === "same-owner") {
    const retry = await screen.findByRole("button", { name: "Retry original request" })
    await waitFor(() => expect(retry).toBeEnabled()); fireEvent.click(retry)
    await screen.findByDisplayValue(/original-owner-share/)
    expect(createShare.mock.calls[1]?.slice(0, 1)).toEqual(original.slice(0, 1)); expect(createShare.mock.calls[1]?.slice(2)).toEqual(original.slice(2))
  } else {
    await waitFor(() => expect(screen.getByRole("button", { name: "Share now" })).toBeEnabled())
    expect(screen.queryByRole("button", { name: "Retry original request" })).toBeNull(); expect(createShare).toHaveBeenCalledOnce()
  }
})
