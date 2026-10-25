import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useRef, useState } from "react"
import { AppFrameComposer } from "@/components/blocks/app-frame/app-frame-composer"
import { createHubClient, type HubClient } from "@/hub/client"
import type { SkillCard } from "@/hub/schemas"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { LocaleProvider } from "@/i18n/context"
import type { SelectedSkill } from "@/ui/composer/selected-skill-pill"
import { settle } from "../engine/fakes"

const card = (name: string, ref = name.toLowerCase().replaceAll(" ", "-")): SkillCard => ({
  skill_id: `series:${ref}`, installation_id: `installation:${ref}`, revision_skill_id: ref,
  source_ref: `skill:${ref}`, installed_source_ref: `skill:${ref}`,
  name, description: `Owner summary ${name}`, content_hash: "fixture-digest", scope: "personal", enabled: true, source_status: "active",
})
function reader(cards: SkillCard[] = [card("No example"), card("Other owner")]) {
  return { ...createHubClient(), listSkillPool: vi.fn<HubClient["listSkillPool"]>().mockResolvedValue(cards), skillQuota: vi.fn<HubClient["skillQuota"]>().mockResolvedValue(null) }
}
const boundary = { admitted: true, subject: "picker-actor", generation: 1 }
function Harness({ client, currentBoundary = boundary, scopeKey = "direct:null", enabled = true, selectable = true, onSelect = vi.fn(() => true), onSubmit = vi.fn(), onManage = vi.fn(), initialDraft = "before after" }: {
  client: HubClient; currentBoundary?: ProjectReadBoundary; scopeKey?: string; enabled?: boolean; selectable?: boolean
  onSelect?: (skill: SkillCard) => boolean; onSubmit?: () => void; onManage?: () => void; initialDraft?: string
}) {
  const [draft, setDraft] = useState(initialDraft)
  const [selectedSkill, setSelected] = useState<SelectedSkill | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  return <AppFrameComposer
    skills={{ client, boundary: currentBoundary, scopeKey, selectable, onSelect: skill => { if (!onSelect(skill)) return false; setSelected({ name: skill.name, sourceRef: skill.source_ref! }); return true } }}
    preview={false} brandName="Kokoro" projectWorkspace={false} hasMessages={false} creationIntent={null} onCreationIntentDismiss={() => {}}
    workspaceCapabilities={{ instructions: false, connectors: false, resources: true, skills: enabled, projectConversations: false }} onOpenSettings={onManage}
    draft={draft} onDraftChange={setDraft} onKeyDown={event => { if (event.key === "Enter") onSubmit() }} onSubmit={event => { event.preventDefault(); onSubmit() }}
    isStreaming={false} canSend={true} onStop={() => {}} composerRef={composerRef} mode="fast" onModeChange={() => {}} modeLocked={false}
    models={[]} selectedModel={null} onModelChange={() => {}} modelLocked={false} selectedSkill={selectedSkill} onRemoveSelectedSkill={() => setSelected(null)}
  />
}
function input() { return screen.getByRole("textbox", { name: "Chat input" }) }
function slash() { fireEvent.change(input(), { target: { value: "before /after", selectionStart: 8, selectionEnd: 8 } }) }
async function skillsPage() {
  fireEvent.click(screen.getByRole("button", { name: "Skills" }))
  const search = await screen.findByRole("combobox", { name: "Search skills" })
  await act(async () => { await settle() })
  expect(search).toHaveFocus()
}
beforeEach(() => { window.history.replaceState({}, "", "/app"); window.localStorage.setItem("kokoro.web.auth-index-subject", "picker-actor"); window.localStorage.setItem("kokoro.locale", "en") })
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear() })

it("slash selects a no-example installed exact skill on the same draft without auto-send or prompt seeding", async () => {
  const client = reader(), onSelect = vi.fn(() => true), onSubmit = vi.fn()
  render(<Harness client={client} onSelect={onSelect} onSubmit={onSubmit} />, { wrapper: LocaleProvider })
  slash(); await skillsPage()
  fireEvent.click(screen.getByRole("option", { name: /No example/ }))
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ source_ref: "skill:no-example", revision_skill_id: "no-example" }))
  expect(input()).toHaveValue("before after")
  expect(screen.getByText("No example")).toBeVisible()
  expect(onSubmit).not.toHaveBeenCalled()
  expect(screen.queryByRole("combobox", { name: "Search skills" })).toBeNull()
  await waitFor(() => expect(input()).toHaveFocus())
  expect((input() as HTMLTextAreaElement).selectionStart).toBe(7)
})

it("the existing plus entry opens the same searchable installed picker; keyboard selection does not submit", async () => {
  const client = reader(), onSelect = vi.fn(() => true), onSubmit = vi.fn()
  render(<Harness client={client} onSelect={onSelect} onSubmit={onSubmit} />, { wrapper: LocaleProvider })
  fireEvent.click(screen.getByRole("button", { name: "Files and resources" }))
  await skillsPage()
  const search = screen.getByRole("combobox", { name: "Search skills" })
  fireEvent.change(search, { target: { value: "Other" } })
  expect(screen.queryByRole("option", { name: /No example/ })).toBeNull()
  fireEvent.keyDown(search, { key: "ArrowDown" })
  fireEvent.keyDown(search, { key: "Enter" })
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ source_ref: "skill:other-owner" }))
  expect(input()).toHaveValue("before after")
  expect(onSubmit).not.toHaveBeenCalled()
})

it("Esc and IME confirmation leave the selected source and original draft untouched", async () => {
  const onSelect = vi.fn(() => true)
  render(<Harness client={reader()} onSelect={onSelect} />, { wrapper: LocaleProvider })
  slash(); await skillsPage()
  const search = screen.getByRole("combobox", { name: "Search skills" })
  fireEvent.keyDown(search, { key: "Enter", isComposing: true })
  fireEvent.keyDown(search, { key: "Enter", keyCode: 229 })
  expect(onSelect).not.toHaveBeenCalled()
  fireEvent.keyDown(search, { key: "Escape" })
  expect(input()).toHaveValue("before /after")
  await waitFor(() => expect(input()).toHaveFocus())
  expect(screen.queryByRole("combobox", { name: "Search skills" })).toBeNull()
})

it("does not replace changed text with a retained slash range", async () => {
  const onSelect = vi.fn(() => true)
  render(<Harness client={reader()} onSelect={onSelect} />, { wrapper: LocaleProvider })
  slash(); await skillsPage()
  fireEvent.change(input(), { target: { value: "newer editable text" } })
  const choice = screen.queryByRole("option", { name: /No example/ })
  if (choice) fireEvent.click(choice)
  expect(input()).toHaveValue("newer editable text")
  expect(onSelect).not.toHaveBeenCalled()
})

it("only exposes eligible exact installed pins and keeps search-empty distinct from a read error", async () => {
  const client = reader([card("Good"), { ...card("Disabled"), enabled: false }, { ...card("Withdrawn"), source_status: "withdrawn" }, { ...card("Mismatch"), installed_source_ref: "skill:wrong" }])
  render(<Harness client={client} />, { wrapper: LocaleProvider })
  slash(); await skillsPage()
  expect(screen.getAllByRole("option")).toHaveLength(1)
  fireEvent.change(screen.getByRole("combobox", { name: "Search skills" }), { target: { value: "no-match" } })
  expect(screen.queryAllByRole("option")).toHaveLength(0)
  expect(screen.queryByText("Failed to load the skill pool")).toBeNull()
})

it("shows a real read failure, retries explicitly, and never silently substitutes an empty success", async () => {
  const client = reader()
  client.listSkillPool.mockRejectedValueOnce(new Error("unavailable"))
  render(<Harness client={client} />, { wrapper: LocaleProvider })
  slash(); await skillsPage()
  expect(screen.getByText("Failed to load the skill pool")).toBeVisible()
  expect(screen.queryAllByRole("option")).toHaveLength(0)
  fireEvent.click(screen.getByRole("button", { name: "Retry" }))
  await screen.findByRole("option", { name: /No example/ })
  expect(client.listSkillPool).toHaveBeenCalledTimes(2)
})

it("retires an open request and late results on scope replacement and actor storage changes", async () => {
  const client = reader(), onSelect = vi.fn(() => true)
  let finish!: (cards: SkillCard[]) => void
  client.listSkillPool.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const view = render(<Harness client={client} onSelect={onSelect} />, { wrapper: LocaleProvider })
  slash(); await skillsPage()
  view.rerender(<Harness client={client} scopeKey="project:other:null" onSelect={onSelect} />)
  await act(async () => { finish([card("Late old scope")]); await settle() })
  expect(screen.queryByText("Late old scope")).toBeNull()
  expect(screen.queryByRole("combobox", { name: "Search skills" })).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Files and resources" })); await skillsPage()
  act(() => {
    window.localStorage.setItem("kokoro.web.auth-index-subject", "other-actor")
    window.dispatchEvent(new StorageEvent("storage", { key: "kokoro.web.auth-index-subject", newValue: "other-actor" }))
  })
  expect(screen.queryByRole("combobox", { name: "Search skills" })).toBeNull()
  expect(onSelect).not.toHaveBeenCalled()
})

it.each([{ admitted: false, enabled: true, selectable: true }, { admitted: true, enabled: false, selectable: true }, { admitted: true, enabled: true, selectable: false }])("does not read or open a retired or disabled Skill capability %j", async ({ admitted, enabled, selectable }) => {
  const client = reader()
  render(<Harness client={client} currentBoundary={{ ...boundary, admitted }} enabled={enabled} selectable={selectable} />, { wrapper: LocaleProvider })
  slash(); await act(async () => { await settle() })
  expect(screen.queryByRole("combobox", { name: "Search skills" })).toBeNull()
  expect(client.listSkillPool).not.toHaveBeenCalled()
  expect(screen.queryByRole("button", { name: "Skills" })).toBeNull()
})


it("management is an explicit existing Settings handoff and neither selects nor sends the draft", async () => {
  const onManage = vi.fn(), onSelect = vi.fn(() => true), onSubmit = vi.fn()
  render(<Harness client={reader()} onManage={onManage} onSelect={onSelect} onSubmit={onSubmit} />, { wrapper: LocaleProvider })
  slash(); await skillsPage()
  fireEvent.click(screen.getByRole("button", { name: "Manage skills" }))
  expect(onManage).toHaveBeenCalledWith("skills", expect.any(HTMLButtonElement))
  expect(onSelect).not.toHaveBeenCalled()
  expect(onSubmit).not.toHaveBeenCalled()
  expect(input()).toHaveValue("before /after")
})

// Independent review reproduced a mounted picker that stayed disabled after returning.
it("current picker can reopen and select after stable-actor route A to B to A", async () => {
  const client = reader(), onSelect = vi.fn(() => true), onSubmit = vi.fn()
  render(<Harness client={client} onSelect={onSelect} onSubmit={onSubmit} />, { wrapper: LocaleProvider })
  fireEvent.click(screen.getByRole("button", { name: "Files and resources" }))
  await skillsPage()
  act(() => {
    window.history.pushState({}, "", "/app?settings=skills")
    window.dispatchEvent(new PopStateEvent("popstate"))
  })
  expect(screen.queryByRole("combobox", { name: "Search skills" })).toBeNull()
  act(() => {
    window.history.replaceState({}, "", "/app")
    window.dispatchEvent(new PopStateEvent("popstate"))
  })
  fireEvent.click(screen.getByRole("button", { name: "Files and resources" }))
  expect(await screen.findByRole("button", { name: "Skills" })).toBeVisible()
  await skillsPage()
  fireEvent.click(screen.getByRole("option", { name: /Other owner/ }))
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ source_ref: "skill:other-owner" }))
  expect(screen.queryByRole("combobox", { name: "Search skills" })).toBeNull()
  expect(input()).toHaveValue("before after")
  expect(onSubmit).not.toHaveBeenCalled()
})

it("retired-marker keyboard root cannot start installed metadata reads before a storage event", async () => {
  const client = reader()
  render(<Harness client={client} />, { wrapper: LocaleProvider })
  fireEvent.click(screen.getByRole("button", { name: "Files and resources" }))
  const entry = screen.getByRole("button", { name: "Skills" })
  window.localStorage.setItem("kokoro.web.auth-index-subject", "other-actor")
  fireEvent.click(entry)
  await act(async () => { await settle() })
  expect(client.listSkillPool).not.toHaveBeenCalled()
  fireEvent.keyDown(entry, { key: "ArrowRight" })
  await act(async () => { await settle() })
  expect(client.listSkillPool).not.toHaveBeenCalled()
})

it("route epochs never revive an actor-retired picker without a new admitted generation", async () => {
  const client = reader()
  const view = render(<Harness client={client} />, { wrapper: LocaleProvider })
  fireEvent.click(screen.getByRole("button", { name: "Files and resources" }))
  act(() => {
    window.localStorage.setItem("kokoro.web.auth-index-subject", "other-actor")
    window.dispatchEvent(new StorageEvent("storage", { key: "kokoro.web.auth-index-subject", newValue: "other-actor" }))
    window.localStorage.setItem("kokoro.web.auth-index-subject", "picker-actor")
    window.dispatchEvent(new StorageEvent("storage", { key: "kokoro.web.auth-index-subject", newValue: "picker-actor" }))
    window.history.pushState({}, "", "/app?settings=skills")
    window.dispatchEvent(new PopStateEvent("popstate"))
    window.history.replaceState({}, "", "/app")
    window.dispatchEvent(new PopStateEvent("popstate"))
  })
  fireEvent.click(screen.getByRole("button", { name: "Files and resources" }))
  expect(screen.queryByRole("button", { name: "Skills" })).toBeNull()
  expect(client.listSkillPool).not.toHaveBeenCalled()
  view.rerender(<Harness client={client} currentBoundary={{ ...boundary, generation: 2 }} />)
  fireEvent.click(screen.getByRole("button", { name: "Files and resources" }))
  await skillsPage()
  expect(screen.getByRole("option", { name: /No example/ })).toBeVisible()
})
