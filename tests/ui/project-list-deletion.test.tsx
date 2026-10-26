import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { StrictMode, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Project, ProjectInstructionRevisionWire } from "@/contract/project"
import { useProjectList } from "@/features/app/use-project-list"
import * as owner from "@/features/app/project-list"

vi.mock("@/features/app/project-list", async (original) => ({
  ...await original<typeof import("@/features/app/project-list")>(),
  listProjects: vi.fn(), getProject: vi.fn(), listProjectInstructionRevisions: vi.fn(),
}))

const id = "project_00000000-0000-4000-8000-000000000f21"
const otherId = "project_00000000-0000-4000-8000-000000000f22"
const project: Project = { id, name: "Owner project", slug: "owner", description: "", instruction: "owner instruction", created_at: "2026-10-20T00:00:00Z", updated_at: "2026-10-20T00:00:00Z" }
const other: Project = { ...project, id: otherId, name: "Other owner project" }
const revision: ProjectInstructionRevisionWire = { id: "revision-f2", instruction: "old history", updated_at: "2026-10-20T00:00:00Z", actor_name: "Owner", current: true }
const boundary = { admitted: true, subject: "deletion-reader", generation: 1 }
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

// This is the planned hook boundary, not a mock of its implementation. A missing
// method is reported separately from existing AppFrame/Workspace behavior RED.
type DeletionReads = ReturnType<typeof useProjectList> & {
  acceptProjectDeletion: (target: string) => void
  context: ReturnType<typeof useProjectList>["context"] & { isCurrent: () => boolean }
}
function deletionReads(value: ReturnType<typeof useProjectList>): DeletionReads {
  expect(value, "F2 implementation gap: real useProjectList accepted barrier").toHaveProperty("acceptProjectDeletion", expect.any(Function))
  return value as DeletionReads
}

beforeEach(() => {
  vi.mocked(owner.listProjects).mockReset().mockResolvedValue([project, other])
  vi.mocked(owner.getProject).mockReset().mockResolvedValue(project)
  vi.mocked(owner.listProjectInstructionRevisions).mockReset().mockResolvedValue([revision])
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe("F2 real project read accepted barrier (implementation gap until production release)", () => {
  it("accept retires old collection/history immediately and adopts the fresh owner without a permanent ID filter", async () => {
    const staleList = deferred<Project[]>()
    const staleHistory = deferred<ProjectInstructionRevisionWire[]>()
    vi.mocked(owner.listProjects).mockReturnValueOnce(staleList.promise)
    const view = renderHook(() => useProjectList(false, boundary, id, true))
    await waitFor(() => expect(owner.listProjects).toHaveBeenCalledTimes(1))
    const reads = deletionReads(view.result.current)
    const oldContext = reads.context
    const oldSignal = vi.mocked(owner.listProjects).mock.calls[0]![0]
    vi.mocked(owner.listProjects).mockResolvedValue([other])
    act(() => reads.acceptProjectDeletion(id))
    expect(oldContext.isCurrent()).toBe(false)
    expect(oldSignal.aborted).toBe(true)
    await waitFor(() => expect(view.result.current.list).toEqual({ status: "ready", data: [other] }))
    await act(async () => staleList.resolve([project]))
    expect(view.result.current.list).toEqual({ status: "ready", data: [other] })
    // A subsequent authoritative response is adopted exactly, even if it has
    // the same ID; the Web must not silently maintain a permanent blacklist.
    vi.mocked(owner.listProjects).mockResolvedValue([project, other])
    vi.mocked(owner.listProjectInstructionRevisions).mockReturnValueOnce(staleHistory.promise)
    act(() => view.result.current.refresh())
    await waitFor(() => expect(view.result.current.list).toEqual({ status: "ready", data: [project, other] }))
    await act(async () => staleHistory.resolve([revision]))
  })

  it.each(["detail", "history"] as const)("late %s ignores abort but cannot resurrect the accepted projection", async (kind) => {
    const oldDetail = deferred<Project>()
    const oldHistory = deferred<ProjectInstructionRevisionWire[]>()
    if (kind === "detail") {
      vi.mocked(owner.listProjects).mockResolvedValue([other])
      vi.mocked(owner.getProject).mockReturnValueOnce(oldDetail.promise)
    } else vi.mocked(owner.listProjectInstructionRevisions).mockReturnValueOnce(oldHistory.promise)
    const view = renderHook(() => useProjectList(false, boundary, id, true))
    await waitFor(() => expect(kind === "detail" ? owner.getProject : owner.listProjectInstructionRevisions).toHaveBeenCalledTimes(1))
    const oldSignal = kind === "detail" ? vi.mocked(owner.getProject).mock.calls[0]![1] : vi.mocked(owner.listProjectInstructionRevisions).mock.calls[0]![1]
    const reads = deletionReads(view.result.current)
    vi.mocked(owner.listProjects).mockResolvedValue([other])
    vi.mocked(owner.getProject).mockRejectedValue(new owner.ProjectReadError("http", 404))
    act(() => reads.acceptProjectDeletion(id))
    expect(oldSignal.aborted).toBe(true)
    await waitFor(() => expect(view.result.current.list).toEqual({ status: "ready", data: [other] }))
    await act(async () => { oldDetail.resolve(project); oldHistory.resolve([revision]) })
    expect(view.result.current.current.status).not.toBe("ready")
    expect(view.result.current.instructionHistory.status).not.toBe("ready")
  })

  it("late rename read cannot start a collection GET or publish after accepted deletion", async () => {
    const lateRename = deferred<Project>()
    const view = renderHook(() => useProjectList(false, boundary, id, true))
    await waitFor(() => expect(view.result.current.current.status).toBe("ready"))
    const reads = deletionReads(view.result.current)
    vi.mocked(owner.getProject).mockReturnValueOnce(lateRename.promise).mockRejectedValue(new owner.ProjectReadError("http", 404))
    const rename = reads.refreshRenamedProject(id, new AbortController().signal)
    const observed = rename.catch(error => error)
    vi.mocked(owner.listProjects).mockResolvedValue([other])
    act(() => reads.acceptProjectDeletion(id))
    await waitFor(() => expect(view.result.current.list).toEqual({ status: "ready", data: [other] }))
    const beforeLate = vi.mocked(owner.listProjects).mock.calls.length
    await act(async () => lateRename.resolve({ ...project, name: "stale rename" }))
    expect(await observed).toMatchObject({ name: "AbortError" })
    expect(owner.listProjects).toHaveBeenCalledTimes(beforeLate)
    expect(view.result.current.list).toEqual({ status: "ready", data: [other] })
  })

  it.each(["subject", "generation", "admission", "project", "unmount"] as const)("%s retires captured reads, including A→B→A", async (changed) => {
    const props = { boundary, target: id }
    const view = renderHook(({ boundary: actor, target }) => useProjectList(false, actor, target, true), { initialProps: props })
    await waitFor(() => expect(view.result.current.current.status).toBe("ready"))
    const previous = deletionReads(view.result.current)
    if (changed === "unmount") view.unmount()
    else {
      view.rerender({ boundary: changed === "subject" ? { ...boundary, subject: "actor-b" } : changed === "generation" ? { ...boundary, generation: 2 } : changed === "admission" ? { ...boundary, admitted: false } : boundary, target: changed === "project" ? otherId : id })
      view.rerender(props)
    }
    expect(previous.context.isCurrent()).toBe(false)
    const before = vi.mocked(owner.listProjects).mock.calls.length
    await expect(previous.refreshRenamedProject(id, new AbortController().signal)).rejects.toMatchObject({ name: "AbortError" })
    expect(owner.listProjects).toHaveBeenCalledTimes(before)
  })

  it("StrictMode setup replay keeps the current accepted guard usable without reviving its disposed predecessor", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>
    const view = renderHook(() => useProjectList(false, boundary, id, true), { wrapper })
    await waitFor(() => expect(view.result.current.current.status).toBe("ready"))
    const reads = deletionReads(view.result.current)
    expect(reads.context.isCurrent()).toBe(true)
    vi.mocked(owner.listProjects).mockResolvedValue([other])
    act(() => reads.acceptProjectDeletion(id))
    expect(reads.context.isCurrent()).toBe(false)
    await waitFor(() => expect(view.result.current.list).toEqual({ status: "ready", data: [other] }))
  })
})
