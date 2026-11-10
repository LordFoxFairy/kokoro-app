import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { LocaleProvider } from "@/i18n/context"
import { ComposerResourcePicker, type ComposerResourceSource } from "@/ui/composer/composer-resource-picker"
import type { SelectedResourceRef } from "@/contract/chat"
import { listLibraryFiles } from "@/features/app/kokoro-library-file-client"
import { listLibraryArtifacts } from "@/features/app/kokoro-library-artifact-client"
import { uploadLibraryFile } from "@/features/app/kokoro-library-file-upload-client"
import { listProjectResources } from "@/features/app/project-resource-list"
import { createSessionEngine } from "@/engine/machine"
import type { ConversationStore } from "@/core/conversations"
import { useAppFrameActions } from "@/components/blocks/app-frame/use-app-frame-actions"
import { AppFrame } from "@/components/blocks/app-frame/app-frame"
import { ThemeProvider } from "@/ui/theme/theme-context"
import { admitBrowserAuthSessionIndexes } from "@/ui/shell/page-clients"
import { createFakeClient, createMemoryStorage, settle } from "../engine/fakes"

vi.mock("@/features/app/kokoro-library-file-client", () => ({ listLibraryFiles: vi.fn() }))
vi.mock("@/features/app/kokoro-library-artifact-client", () => ({ listLibraryArtifacts: vi.fn() }))
vi.mock("@/features/app/project-resource-list", () => ({ listProjectResources: vi.fn() }))
vi.mock("@/features/app/kokoro-library-file-upload-client", async importOriginal => ({ ...await importOriginal<typeof import("@/features/app/kokoro-library-file-upload-client")>(), uploadLibraryFile: vi.fn() }))

const boundary = { admitted: true, subject: "resource-actor", generation: 1 }
const file = { assetId: "asset-clean", filename: "notes.txt", mimeType: "text/plain", sizeBytes: "8", createdAt: "2026-11-09T00:00:00Z" }
const artifact = { conversationId: "task-with-file", artifactId: "artifact-final", assetId: "asset-final", artifactKind: "document" as const, title: "Final result", filename: "result.txt", mimeType: "text/plain", sizeBytes: "4", deliveredAt: "2026-11-09T00:00:00Z" }
function Harness({ initialSource = "library", projectRef, onChange = vi.fn(), initialSelected = [] }: {
  initialSource?: ComposerResourceSource; projectRef?: string; onChange?: (refs: readonly SelectedResourceRef[]) => void; initialSelected?: readonly SelectedResourceRef[]
}) {
  const [source, setSource] = useState<ComposerResourceSource | null>(initialSource)
  const [selected, setSelected] = useState(initialSelected)
  return <ComposerResourcePicker source={source} onClose={() => setSource(null)} controller={{
    boundary, scopeKey: projectRef ?? "personal", ...(projectRef ? { projectRef } : {}), selectable: true, selected,
    onChange: refs => { setSelected(refs); onChange(refs) },
    recentTasks: [{ id: "answer-only", title: "Answer only task" }, { id: "task-with-file", title: "Task with file" }],
  }} />
}
beforeEach(() => {
  history.replaceState(null, "", "/app")
  localStorage.setItem("kokoro.locale", "en")
  localStorage.setItem("kokoro.web.auth-index-subject", "resource-actor")
  vi.mocked(listLibraryFiles).mockResolvedValue({ items: [file], nextCursor: null })
  vi.mocked(listProjectResources).mockResolvedValue({ items: [{ ...file, assetId: "project-asset" }], nextCursor: null })
  vi.mocked(listLibraryArtifacts).mockResolvedValue({ items: [artifact], nextCursor: null })
})
afterEach(() => { cleanup(); vi.resetAllMocks(); localStorage.clear() })

it("selects only public opaque refs, disables duplicates, and removes without submitting", async () => {
  const onChange = vi.fn()
  render(<Harness onChange={onChange} />, { wrapper: LocaleProvider })
  const choice = await screen.findByRole("button", { name: "notes.txt" })
  fireEvent.click(choice)
  expect(onChange).toHaveBeenLastCalledWith([{ kind: "asset", resource_id: "asset-clean" }])
  expect(choice).toBeDisabled()
  fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!)
  expect(screen.queryByRole("dialog")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Remove notes.txt" }))
  expect(onChange).toHaveBeenLastCalledWith([])
})

it("requires explicit upload and retries an unknown outcome with the same file and key", async () => {
  const onChange = vi.fn(), bytes = new File(["content"], "local.txt", { type: "text/plain" })
  vi.mocked(uploadLibraryFile).mockRejectedValueOnce(new Error("lost response")).mockResolvedValueOnce("uploaded-clean")
  render(<Harness initialSource="upload" onChange={onChange} />, { wrapper: LocaleProvider })
  fireEvent.change(screen.getByLabelText("Choose file"), { target: { files: [bytes] } })
  expect(uploadLibraryFile).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Upload file" }))
  fireEvent.click(await screen.findByRole("button", { name: "Retry same file" }))
  await waitFor(() => expect(onChange).toHaveBeenCalledWith([{ kind: "asset", resource_id: "uploaded-clean" }]))
  expect(uploadLibraryFile).toHaveBeenCalledTimes(2)
  const [first, retry] = vi.mocked(uploadLibraryFile).mock.calls
  expect(first![0]).toBe(bytes)
  expect(retry!.slice(0, 2)).toEqual(first!.slice(0, 2))
  expect(screen.queryByRole("dialog")).toBeNull()
})

it("aborts and ignores a late uploaded file after the actor retires", async () => {
  const onChange = vi.fn()
  let finish!: (id: string) => void
  vi.mocked(uploadLibraryFile).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  render(<Harness initialSource="upload" onChange={onChange} />, { wrapper: LocaleProvider })
  fireEvent.change(screen.getByLabelText("Choose file"), { target: { files: [new File(["late"], "late.txt")] } })
  fireEvent.click(screen.getByRole("button", { name: "Upload file" }))
  act(() => {
    localStorage.setItem("kokoro.web.auth-index-subject", "another-actor")
    window.dispatchEvent(new StorageEvent("storage", { key: "kokoro.web.auth-index-subject", newValue: "another-actor" }))
  })
  expect(vi.mocked(uploadLibraryFile).mock.calls[0]![2]?.aborted).toBe(true)
  await act(async () => { finish("late-clean"); await Promise.resolve() })
  expect(onChange).not.toHaveBeenCalled()
  expect(screen.queryByRole("dialog")).toBeNull()
})

it("uses the current Project file owner and limits history to its actual tasks", async () => {
  const onChange = vi.fn()
  vi.mocked(listLibraryArtifacts).mockResolvedValueOnce({ items: [artifact, { ...artifact, artifactId: "other-artifact", conversationId: "other-project", filename: "other.txt" }], nextCursor: null })
  render(<Harness projectRef="project-current" onChange={onChange} />, { wrapper: LocaleProvider })
  fireEvent.click(await screen.findByRole("button", { name: "notes.txt" }))
  expect(listProjectResources).toHaveBeenCalledWith("project-current", null, expect.any(AbortSignal))
  expect(listLibraryFiles).not.toHaveBeenCalled()
  expect(onChange).toHaveBeenLastCalledWith([{ kind: "asset", resource_id: "project-asset" }])
  fireEvent.click(screen.getByRole("button", { name: "Agent artifacts" }))
  fireEvent.click(await screen.findByRole("button", { name: "result.txt" }))
  expect(screen.queryByRole("button", { name: "other.txt" })).toBeNull()
  expect(onChange).toHaveBeenLastCalledWith([{ kind: "asset", resource_id: "project-asset" }, { kind: "artifact", resource_id: "artifact-final" }])
})

it("shows answer-only recent tasks honestly while selecting only delivered artifacts", async () => {
  render(<Harness initialSource="recent" />, { wrapper: LocaleProvider })
  expect(screen.getByRole("button", { name: "Answer only task" })).toBeVisible()
  expect(screen.getByText(/Answer-only task references are not available yet/)).toBeVisible()
  expect(listLibraryArtifacts).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Task with file" }))
  expect(await screen.findByRole("button", { name: "result.txt" })).toBeVisible()
})

it.each([false, true])("restores the unsent composer selection in a new AppFrame and sends it once (Project=%s)", async project => {
  const projectRef = "project-draft-refs"
  const path = project ? `/app/project/${projectRef}` : "/app"
  const key = project ? `__project__:${projectRef}` : "__pending__"
  history.replaceState(null, "", path)
  const admission = { ...boundary, tenant: "resource-tenant" }
  expect(admitBrowserAuthSessionIndexes(admission.subject, admission.subject, admission.tenant)).toBe(true)
  const client = createFakeClient()
  const storage = createMemoryStorage<ConversationStore>()
  const mount = () => {
    const engine = createSessionEngine({ client, storage, ...(project ? { scope: { kind: "project", projectRef } } : {}) })
    const view = render(<ThemeProvider><LocaleProvider><AppFrame engine={engine} chatHref="/app"
      projectReadBoundary={admission} {...(project ? { projectWorkspace: true, projectRef } : {})}
      workspaceCapabilities={{ instructions: false, connectors: false, resources: true, skills: false, projectConversations: false }}
    /></LocaleProvider></ThemeProvider>)
    return () => { view.unmount(); engine.dispose() }
  }
  let close = mount()
  const input = () => screen.getByRole("textbox", { name: "Chat input" })
  const prompt = "Read this file after refresh"
  try {
    fireEvent.change(input(), { target: { value: prompt } })
    fireEvent.click(screen.getByRole("button", { name: "Files and resources" }))
    fireEvent.click(screen.getByRole("button", { name: /^Library$/u }))
    fireEvent.click(await screen.findByRole("button", { name: "notes.txt" }))
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!)
    expect(screen.getByRole("button", { name: "Remove notes.txt" })).toBeVisible()
    act(() => window.dispatchEvent(new PageTransitionEvent("pagehide")))
    expect(window.localStorage.getItem("kokoro.web.drafts")).not.toContain("notes.txt")
    close()
    close = mount()
    expect(input()).toHaveValue(prompt)
    expect(screen.getByRole("list", { name: "Selected attachments" })).toBeVisible()
    expect(client.createCalls).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))
    await waitFor(() => expect(client.createCalls).toHaveLength(1))
    expect(client.createCalls[0]?.body).toMatchObject({
      content: prompt,
      selected_resource_refs: [{ kind: "asset", resource_id: project ? "project-asset" : "asset-clean" }],
    })
    expect(screen.queryByRole("list", { name: "Selected attachments" })).toBeNull()
    expect(JSON.parse(window.localStorage.getItem("kokoro.web.drafts") ?? "{}")[key]).toBeUndefined()
  } finally { close() }
})

it("transfers the Project draft refs after allocation and preserves the exact unknown retry", async () => {
  history.replaceState(null, "", "/app/project/project-refs")
  const client = createFakeClient()
  client.nextCreate = () => Promise.reject(new Error("unconfirmed receipt"))
  const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(), scope: { kind: "project", projectRef: "project-refs" } })
  engine.newConversation()
  const hiddenId = engine.getSnapshot().store!.activeId
  const refs: SelectedResourceRef[] = [{ kind: "asset", resource_id: "project-asset" }]
  let currentRefs = refs
  const view = renderHook(() => useAppFrameActions({
    engine, preview: false, readBoundary: boundary, projectWorkspace: true, standaloneSurface: false,
    projectRef: "project-refs", routedConversationId: null, chatHref: "/app", activeId: hiddenId,
    clearDraft: vi.fn(), updateDraft: vi.fn(), setDeploymentIntent: vi.fn(),
    readDraft: () => ({ text: "Read the attached file", refs: currentRefs }),
    syncConversationUrl: vi.fn(), setConversationRouteId: vi.fn(), focusComposer: vi.fn(), closeSettings: vi.fn(),
    brandName: "Kokoro", commandNewChatTimerRef: { current: null },
    projectComposerDraft: { mode: "fast", model: null, selectedMcpConnectionIds: [], isCurrent: () => true },
  }), { wrapper: LocaleProvider })
  try {
    await act(async () => { view.result.current.submitDraft(); await settle() })
    const original = structuredClone(client.createCalls[0])
    expect(original?.sessionId).not.toBe(hiddenId)
    expect(original?.body.selected_resource_refs).toEqual(refs)
    expect(engine.getSnapshot().canRetryPendingSubmission).toBe(true)
    currentRefs = []
    await act(async () => { engine.retry(); await settle() })
    expect(client.createCalls).toEqual([original, original])
  } finally { view.unmount(); engine.dispose() }
})
