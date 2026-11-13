import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { LocaleProvider } from "@/i18n/context"
import { WorkspaceHeaderProjectShare } from "@/components/blocks/workspace-header/workspace-header-project-share"
import type { ProjectAccessModel } from "@/features/app/use-project-access"
const transport = vi.hoisted(() => ({ call: vi.fn(), members: vi.fn() }))
vi.mock("@/team/client", () => ({ createTeamClient: () => ({ listMembers: transport.members }) }))
vi.mock("@/features/app/project-access-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/app/project-access-client")>()),
  projectAccessCall: transport.call,
}))
const boundary = { tenant: "tenant", subject: "owner", generation: 1, admitted: true }
const model: ProjectAccessModel = {
  boundary,
  projectId: "project-a",
  context: { ...boundary, projectId: "project-a", revision: 0 },
  access: { project_id: "project-a", role: "owner", access_version: "1", expires_at: null, capabilities: ["read", "edit", "manage"] },
  refresh: vi.fn(),
  isCurrent: () => true,
}
const writes = () => transport.call.mock.calls.filter((call) => call[1] === "set")
beforeEach(() => {
  sessionStorage.clear()
  vi.clearAllMocks()
  transport.members.mockResolvedValue({
    items: [
      { user_id: "owner", display_name: "Owner" },
      { user_id: "member", display_name: "A member with a long name" },
    ],
    nextCursor: null,
  })
  transport.call.mockImplementation(async (_project, operation) => {
    if (operation === "list") return { data: [], meta: { request_id: "read", next_cursor: null } }
    throw new TypeError("lost ACK")
  })
})
afterEach(cleanup)
async function open() {
  fireEvent.click(screen.getByRole("button", { name: "Share" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "Save grant" })).toBeInTheDocument())
  await screen.findByRole("option", { name: "A member with a long name" })
}
it("restores a lost-ACK grant after remount and replays only its original member, key, role and CAS after an explicit click", async () => {
  const page = render(<WorkspaceHeaderProjectShare model={model} />, { wrapper: LocaleProvider })
  await open()
  expect(screen.queryByRole("option", { name: "Owner" })).toBeNull()
  fireEvent.change(screen.getByRole("combobox", { name: "Member" }), { target: { value: "member" } })
  fireEvent.click(screen.getByRole("button", { name: "Save grant" }))
  await screen.findByText("The access change is unconfirmed. Resume only the original operation.")
  expect(writes()).toHaveLength(1)
  const original = writes()[0]![3]
  page.unmount()
  render(<WorkspaceHeaderProjectShare model={model} />, { wrapper: LocaleProvider })
  await open()
  expect(writes()).toHaveLength(1)
  expect(screen.getByRole("button", { name: "Save grant" })).toBeDisabled()
  transport.call.mockImplementation(async (_project, operation) =>
    operation === "list"
      ? { data: [], meta: { request_id: "read", next_cursor: null } }
      : {
          data: { project_id: "project-a", subject_id: "member", role: "viewer", expires_at: null, revoked_at: null, access_version: "2" },
          meta: { request_id: "original-ACK" },
        },
  )
  fireEvent.click(screen.getByRole("button", { name: "Resume original command" }))
  await waitFor(() => expect(model.refresh).toHaveBeenCalledOnce())
  expect(writes()).toHaveLength(2)
  const replay = writes()[1]![3]
  expect([replay.subjectId, replay.key, replay.version, replay.body]).toEqual([
    original.subjectId,
    original.key,
    original.version,
    original.body,
  ])
  expect(sessionStorage.length).toBe(0)
})
it("retires the owner's dialog on role loss without deleting an unknown command or exposing member data", async () => {
  const page = render(<WorkspaceHeaderProjectShare model={model} />, { wrapper: LocaleProvider })
  await open()
  fireEvent.change(screen.getByRole("combobox", { name: "Member" }), { target: { value: "member" } })
  fireEvent.click(screen.getByRole("button", { name: "Save grant" }))
  await screen.findByText("The access change is unconfirmed. Resume only the original operation.")
  const stored = sessionStorage.getItem(sessionStorage.key(0)!)
  page.rerender(
    <WorkspaceHeaderProjectShare
      model={{ ...model, context: { ...model.context, revision: 1 }, access: { ...model.access!, role: "viewer", capabilities: ["read"] } }}
    />,
  )
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(screen.getByRole("button", { name: "Share" })).toBeDisabled()
  expect(sessionStorage.getItem(sessionStorage.key(0)!)).toBe(stored)
  expect(writes()).toHaveLength(1)
})
