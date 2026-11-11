import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { KokoroProjectWorkspace } from "@/features/app/kokoro-project-workspace"
import { ProjectTodoSection, type ProjectTodoClient, type ProjectTodoTask, type ProjectTodoWriteResult } from "@/features/app/project-todo-section"
import { LocaleProvider } from "@/i18n/context"

const project = { id: "project_11111111-1111-4111-8111-111111111111", name: "Product", slug: "product", description: "", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" }
const admission = { admitted: true, subject: "subject-a", generation: 1 }

beforeEach(() => {
  window.history.replaceState(null, "", "/app/project/" + project.id)
  window.localStorage.setItem("kokoro.locale", "en")
  window.sessionStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.sessionStorage.clear()
})

it("loads owner-ordered tasks only on the admitted Project Overview", async () => {
  const client = {
    list: vi.fn().mockResolvedValue({ kind: "ok", tasks: [
      { id: "t2", title: "Second alphabetically", status: "in_progress", revision: "r2" },
      { id: "t1", title: "First alphabetically", status: "todo", revision: "r1" },
    ] }),
    write: vi.fn(),
  }
  const props = { onPrompt: vi.fn(), projectRef: project.id, projectDetail: { status: "ready" as const, data: project }, projectReadBoundary: admission, projectTodoClient: client }
  const page = render(<LocaleProvider><KokoroProjectWorkspace {...props} projectConversationContent={<p>Run content</p>} /></LocaleProvider>)
  expect(screen.queryByRole("region", { name: "Project to-do" })).toBeNull()
  expect(client.list).not.toHaveBeenCalled()

  page.rerender(<LocaleProvider><KokoroProjectWorkspace {...props} preview /></LocaleProvider>)
  expect(screen.queryByRole("region", { name: "Project to-do" })).toBeNull()
  expect(client.list).not.toHaveBeenCalled()

  page.rerender(<LocaleProvider><KokoroProjectWorkspace {...props} /></LocaleProvider>)
  const panel = await screen.findByRole("region", { name: "Project to-do" })
  await within(panel).findByText("Second alphabetically")
  expect(within(panel).getAllByRole("listitem").map(row => within(row).getByRole("heading").textContent))
    .toEqual(["Second alphabetically", "First alphabetically"])
  expect(client.list).toHaveBeenCalledWith(project.id, expect.any(AbortSignal))
  expect(client.write).not.toHaveBeenCalled()
})

const task = (id: string, title: string, revision = "r1", status: ProjectTodoTask["status"] = "todo"): ProjectTodoTask => ({ id, title, revision, status })

function fixture(tasks: readonly ProjectTodoTask[] = []) {
  return {
    list: vi.fn<ProjectTodoClient["list"]>().mockResolvedValue({ kind: "ok", tasks }),
    write: vi.fn<ProjectTodoClient["write"]>().mockResolvedValue("ok"),
  }
}

const panelProps = { projectId: project.id, subject: admission.subject, generation: admission.generation }

function renderPanel(client: ProjectTodoClient, props = panelProps) {
  return <LocaleProvider><ProjectTodoSection {...props} client={client} /></LocaleProvider>
}

const button = (name: string) => screen.getByRole("button", { name })
const input = (name: string) => screen.getByRole("textbox", { name })
const type = (name: string, value: string) => fireEvent.change(input(name), { target: { value } })
const action = async (name: string) => {
  await waitFor(() => expect(button(name)).toBeEnabled())
  fireEvent.click(button(name))
}

it("freezes a single write before send, then retries the same intent after refreshing this tab", async () => {
  const client = fixture()
  client.write.mockImplementationOnce(async (_id, intent) => {
    expect(window.sessionStorage.length).toBe(1)
    const key = window.sessionStorage.key(0)
    expect(key).not.toBeNull()
    expect(JSON.parse(window.sessionStorage.getItem(key!)!).intent).toEqual(intent)
    return "unknown"
  })
  const first = render(renderPanel(client))
  await screen.findByText("No project tasks yet.")
  type("New task title", "  Persist this title  ")
  fireEvent.click(button("Add"))
  await screen.findByRole("button", { name: "Retry original change" })
  expect(client.write).toHaveBeenCalledTimes(1)
  const original = client.write.mock.calls[0]![1]
  expect(original).toMatchObject({ kind: "create", title: "Persist this title" })
  expect(button("Add")).toBeDisabled()

  first.unmount()
  client.list.mockResolvedValueOnce({ kind: "ok", tasks: [task("t1", "Persist this title")] })
  render(renderPanel(client))
  await screen.findByRole("heading", { name: "Persist this title" })
  // The same row is a current read, not the old command's acknowledgement.
  expect(client.write).toHaveBeenCalledTimes(1)
  expect(window.sessionStorage.length).toBe(1)
  await action("Retry original change")
  await waitFor(() => expect(window.sessionStorage.length).toBe(0))
  expect(client.write).toHaveBeenCalledTimes(2)
  expect(client.write.mock.calls[1]![1]).toEqual(original)
  expect(client.list).toHaveBeenCalledTimes(3)
})

it("keeps the edit draft on a stale version; only explicit review can save with the new revision", async () => {
  const client = fixture([task("t1", "Original")])
  client.write.mockResolvedValueOnce("stale")
  client.list.mockResolvedValueOnce({ kind: "ok", tasks: [task("t1", "Original")] })
    .mockResolvedValueOnce({ kind: "ok", tasks: [task("t1", "Peer changed it", "r2", "in_progress")] })
    .mockResolvedValueOnce({ kind: "ok", tasks: [task("t1", "My title", "r3", "done")] })
  render(renderPanel(client))
  await screen.findByRole("heading", { name: "Original" })
  await action("Edit")
  type("Title", "My title")
  fireEvent.change(screen.getByRole("combobox", { name: "Task status" }), { target: { value: "done" } })
  await action("Save")
  await screen.findByRole("heading", { name: "Peer changed it" })
  expect(input("Title")).toHaveValue("My title")
  expect(screen.getByRole("combobox", { name: "Task status" })).toHaveValue("done")
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
  expect(client.write).toHaveBeenCalledTimes(1)
  expect(window.sessionStorage.length).toBe(0)
  await action("Continue editing with current version")
  expect(client.write).toHaveBeenCalledTimes(1)
  await action("Save")
  await screen.findByRole("heading", { name: "My title" })
  const [oldIntent, newIntent] = client.write.mock.calls.map(call => call[1])
  expect(oldIntent).toMatchObject({ kind: "update", taskId: "t1", revision: "r1", title: "My title", status: "done" })
  expect(newIntent).toMatchObject({ kind: "update", taskId: "t1", revision: "r2", title: "My title", status: "done" })
  expect(newIntent!.key).not.toBe(oldIntent!.key)
})

it("fails closed when the tab journal cannot be saved and validates Unicode scalars before sending", async () => {
  const client = fixture()
  render(renderPanel(client))
  await screen.findByText("No project tasks yet.")
  type("New task title", "😀".repeat(161))
  expect(button("Add")).toBeDisabled()
  type("New task title", "😀".repeat(160))
  expect(button("Add")).toBeEnabled()
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError") })
  await action("Add")
  expect(screen.getByRole("alert")).toHaveTextContent("Changes are disabled")
  expect(client.write).not.toHaveBeenCalled()
})

it("does not transfer a pending intent or accept its late result after Project/subject changes", async () => {
  const client = fixture()
  let settle!: (result: ProjectTodoWriteResult) => void
  client.write.mockImplementationOnce(() => new Promise(resolve => { settle = resolve }))
  const page = render(renderPanel(client))
  await screen.findByText("No project tasks yet.")
  type("New task title", "Old owner's task")
  await action("Add")
  await waitFor(() => expect(client.write).toHaveBeenCalledTimes(1))
  const previousSignal = client.write.mock.calls[0]![2]
  window.history.replaceState(null, "", "/app/project/project_22222222-2222-4222-8222-222222222222")
  page.rerender(renderPanel(client, { projectId: "project_22222222-2222-4222-8222-222222222222", subject: "subject-b", generation: 2 }))
  await screen.findByText("No project tasks yet.")
  expect(previousSignal.aborted).toBe(true)
  expect(screen.queryByRole("button", { name: "Retry original change" })).toBeNull()
  await act(async () => settle("ok"))
  expect(client.list.mock.calls.map(call => call[0])).toEqual([project.id, "project_22222222-2222-4222-8222-222222222222"])
  expect(client.write).toHaveBeenCalledTimes(1)
  // The old project may have committed; the next scope must not clear its record.
  expect(window.sessionStorage.length).toBe(1)
})

it("uses a confirmation before deleting and reads owner state only after the write acknowledgement", async () => {
  const client = fixture([task("t1", "Remove this")])
  client.list.mockResolvedValueOnce({ kind: "ok", tasks: [task("t1", "Remove this")] })
    .mockResolvedValueOnce({ kind: "ok", tasks: [] })
  render(renderPanel(client))
  await screen.findByRole("heading", { name: "Remove this" })
  await action("Delete task")
  const cancelled = screen.getByRole("alertdialog", { name: "Delete this task?" })
  fireEvent.click(within(cancelled).getByRole("button", { name: "Cancel" }))
  expect(client.write).not.toHaveBeenCalled()
  await waitFor(() => expect(button("Delete task")).toHaveFocus())
  await action("Delete task")
  const confirmed = screen.getByRole("alertdialog", { name: "Delete this task?" })
  fireEvent.click(within(confirmed).getByRole("button", { name: "Delete task" }))
  await screen.findByText("No project tasks yet.")
  expect(client.write).toHaveBeenCalledTimes(1)
  expect(client.write.mock.calls[0]![1]).toMatchObject({ kind: "delete", taskId: "t1", revision: "r1" })
  expect(client.list).toHaveBeenCalledTimes(2)
})

it.each([
  ["capacity", "This project has reached its task limit."],
  ["key-conflict", "The command key was already used. This change was rejected."],
] as const)("distinguishes a definite %s rejection from an unknown submission", async (failure, message) => {
  const client = fixture()
  client.write.mockResolvedValueOnce(failure)
  render(renderPanel(client))
  await screen.findByText("No project tasks yet.")
  type("New task title", "Existing draft")
  await action("Add")
  await screen.findByText(message)
  expect(input("New task title")).toHaveValue("Existing draft")
  expect(window.sessionStorage.length).toBe(0)
  expect(screen.queryByRole("button", { name: "Retry original change" })).toBeNull()
  expect(client.write).toHaveBeenCalledTimes(1)
  expect(client.list).toHaveBeenCalledTimes(1)
})

it.each([
  ["kokoro:surface-navigation", "/app/project/project_22222222-2222-4222-8222-222222222222"],
  ["popstate", "/app/project/" + project.id + "?conversation=conv_owner"],
] as const)("retires a pending command synchronously on %s before React can unmount it", async (eventName, destination) => {
  const client = fixture()
  let settle!: (result: ProjectTodoWriteResult) => void
  client.write.mockImplementationOnce(() => new Promise(resolve => { settle = resolve }))
  render(renderPanel(client))
  await screen.findByText("No project tasks yet.")
  type("New task title", "Keep its original journal")
  await action("Add")
  const signal = client.write.mock.calls[0]![2]
  const storedKey = window.sessionStorage.key(0)!
  const journal = window.sessionStorage.getItem(storedKey)

  window.history.pushState(null, "", destination)
  window.dispatchEvent(new Event(eventName))
  expect(signal.aborted).toBe(true)
  await act(async () => settle("ok"))
  expect(window.sessionStorage.getItem(storedKey)).toBe(journal)
  expect(client.list).toHaveBeenCalledTimes(1)
  expect(client.write).toHaveBeenCalledTimes(1)
})

it("does not dispatch from a stale Overview even when the URL changed without a route event", async () => {
  const client = fixture()
  render(renderPanel(client))
  await screen.findByText("No project tasks yet.")
  type("New task title", "Stale intent")
  window.history.pushState(null, "", "/app/project/" + project.id + "?conversation=conv_owner")
  fireEvent.click(button("Add"))
  expect(client.write).not.toHaveBeenCalled()
  expect(window.sessionStorage.length).toBe(0)
})
