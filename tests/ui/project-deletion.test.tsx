import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { StrictMode, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Project } from "@/contract/project"
import type { ProjectReadState } from "@/features/app/use-project-list"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { LocaleProvider } from "@/i18n/context"

const id = "project_00000000-0000-4000-8000-000000000f21"
const otherId = "project_00000000-0000-4000-8000-000000000f22"
const project: Project = { id, name: "Delete owner project", slug: "owner", description: "", created_at: "2026-10-20T00:00:00Z", updated_at: "2026-10-20T00:00:00Z" }
type Snapshot = { project_id: string; logical_release_state: "pending" | "blocked" | "released"; physical_cleanup_state: "pending" }
type Options = {
  projectRef: string; projectWorkspace: boolean; preview: boolean; mounted: boolean
  boundary: ProjectReadBoundary; routeKey: string; current: ProjectReadState<Project>
  onAccepted: (target: string) => void
}
type Control = {
  available: boolean; open: boolean; status: string; problem: string | null
  snapshot: Snapshot | null; focusScopeToken: object
  onOpen: () => void; onClose: () => void; onConfirm: () => void; onRetry: () => void; onRead: () => void
}
type IntentModule = { useAppFrameProjectDeletion: (options: Options) => Control }
// Deliberately dynamic: absence is an implementation gap, not the real
// AppFrame/Workspace semantic RED used by Root for production authorization.
async function intentModule() {
  return vi.importActual<IntentModule>("@/components/blocks/app-frame/use-app-frame-project-deletion")
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function snapshot(state: Snapshot["logical_release_state"] = "pending"): Snapshot {
  return { project_id: id, logical_release_state: state, physical_cleanup_state: "pending" }
}
function response(status: number, data: unknown, extra: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { "cache-control": "private, no-store, max-age=0", "x-request-id": "req-f2-intent", ...extra } })
}
function accepted() { return response(202, { data: snapshot() }, { location: `/v1/projects/${id}/deletion` }) }
function stateReply(state: Snapshot["logical_release_state"] = "pending") { return response(200, { data: snapshot(state) }) }
function options(): Options {
  return { projectRef: id, projectWorkspace: true, preview: false, mounted: true,
    boundary: { admitted: true, subject: "delete-reader", generation: 1 }, routeKey: "project-root",
    current: { status: "ready", data: project }, onAccepted: vi.fn() }
}
async function mountIntent(initial = options(), strict = false) {
  const { useAppFrameProjectDeletion } = await intentModule()
  const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider>{strict ? <StrictMode>{children}</StrictMode> : children}</LocaleProvider>
  return renderHook((props: Options) => useAppFrameProjectDeletion(props), { initialProps: initial, wrapper })
}
function keyOf(call: Parameters<typeof fetch> | undefined) { return new Headers(call?.[1]?.headers).get("Idempotency-Key") }
beforeEach(() => {
  window.history.replaceState({}, "", `/app/project/${id}`)
  window.localStorage.setItem("kokoro.locale", "en")
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState({}, "", "/app") })

describe("F2 intent implementation gap (not the existing wiring RED)", () => {
  it("opening and cancelling are zero IO; pending double confirmation emits one frozen bodyless DELETE", async () => {
    const pending = deferred<Response>()
    const request = vi.spyOn(globalThis, "fetch").mockReturnValueOnce(pending.promise).mockResolvedValue(stateReply())
    const input = options(); const view = await mountIntent(input)
    act(() => view.result.current.onOpen())
    expect(view.result.current.open).toBe(true)
    act(() => view.result.current.onClose())
    expect(request).not.toHaveBeenCalled()
    act(() => { view.result.current.onOpen(); view.result.current.onConfirm(); view.result.current.onConfirm() })
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]).toEqual([`/api/hub/projects/${id}`, expect.objectContaining({ method: "DELETE", signal: expect.any(AbortSignal) })])
    expect(request.mock.calls[0]![1]?.body).toBeUndefined()
    expect(keyOf(request.mock.calls[0])).toMatch(/^[\x21-\x2b\x2d-\x7e]{1,128}$/u)
    await act(async () => pending.resolve(accepted()))
    await waitFor(() => expect(input.onAccepted).toHaveBeenCalledExactlyOnceWith(id))
    expect(request.mock.calls.filter(call => call[1]?.method === "DELETE")).toHaveLength(1)
  })

  it.each(["network", "invalid ACK", "in_progress", "conflict", "429", "503"] as const)("%s preserves one key across close/reopen and ordinary reads, with only explicit recovery", async (failure) => {
    const request = vi.spyOn(globalThis, "fetch")
    if (failure === "network") request.mockRejectedValueOnce(new Error("offline"))
    else if (failure === "invalid ACK") request.mockResolvedValueOnce(response(202, { data: { ...snapshot(), project_id: otherId } }, { location: `/v1/projects/${id}/deletion` }))
    else request.mockResolvedValueOnce(response(failure === "429" ? 429 : failure === "503" ? 503 : 409,
      { error: { code: failure === "in_progress" ? "idempotency_in_progress" : failure === "conflict" ? "idempotency_conflict" : failure === "429" ? "session_rate_limited" : "business_store_unavailable", message: "closed error", retryable: failure !== "conflict" } }))
    request.mockResolvedValue(accepted())
    const input = options(); const view = await mountIntent(input)
    act(() => { view.result.current.onOpen(); view.result.current.onConfirm() })
    await waitFor(() => expect(view.result.current.status).not.toBe("pending"))
    expect(request).toHaveBeenCalledTimes(1)
    const key = keyOf(request.mock.calls[0]); expect(key).not.toBeNull()
    act(() => view.result.current.onClose())
    view.rerender({ ...input, current: { status: "error", retryable: true } })
    view.rerender({ ...input, current: { status: "ready", data: { ...project, name: "fresh read revision" } } })
    act(() => view.result.current.onOpen())
    expect(view.result.current.open).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
    act(() => view.result.current.onRetry())
    await act(async () => { await Promise.resolve() })
    const deletes = request.mock.calls.filter(call => call[1]?.method === "DELETE")
    // Conflict may remain non-retryable, but cannot create another identity.
    if (failure !== "conflict") expect(deletes).toHaveLength(2)
    expect(deletes.every(call => keyOf(call) === key)).toBe(true)
  })

  it.each(["pending", "blocked", "released"] as const)("accepted %s is physical pending, never another DELETE and does not depend on row/detail readiness", async (logical) => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(accepted()).mockResolvedValue(stateReply(logical))
    const input = options(); const view = await mountIntent(input)
    act(() => { view.result.current.onOpen(); view.result.current.onConfirm() })
    await waitFor(() => expect(input.onAccepted).toHaveBeenCalledExactlyOnceWith(id))
    act(() => view.result.current.onRead())
    await waitFor(() => expect(view.result.current.snapshot).toEqual(snapshot(logical)))
    act(() => view.result.current.onClose())
    view.rerender({ ...input, current: { status: "error", retryable: false } })
    act(() => view.result.current.onOpen())
    expect(view.result.current.open).toBe(true)
    expect(view.result.current.snapshot?.physical_cleanup_state).toBe("pending")
    act(() => view.result.current.onRetry())
    await act(async () => { await Promise.resolve() })
    expect(request.mock.calls.filter(call => call[1]?.method === "DELETE")).toHaveLength(1)
    expect(request.mock.calls.filter(call => call[1]?.method === "GET").every(call => call[0] === `/api/hub/projects/${id}/deletion` && keyOf(call) === null)).toBe(true)
  })

  it.each(["404", "network"] as const)("accepted GET %s cannot return to DELETE or claim released", async (failure) => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(accepted())
    if (failure === "404") request.mockResolvedValue(response(404, { error: { code: "project_not_found", message: "not found", retryable: false } }))
    else request.mockRejectedValue(new Error("offline"))
    const input = options(); const view = await mountIntent(input)
    act(() => { view.result.current.onOpen(); view.result.current.onConfirm() })
    await waitFor(() => expect(input.onAccepted).toHaveBeenCalledExactlyOnceWith(id))
    act(() => view.result.current.onRead())
    await waitFor(() => expect(view.result.current.problem).not.toBeNull())
    act(() => view.result.current.onRetry())
    await act(async () => { await Promise.resolve() })
    expect(request.mock.calls.filter(call => call[1]?.method === "DELETE")).toHaveLength(1)
    expect(view.result.current.snapshot?.logical_release_state).not.toBe("released")
  })

  it.each(["preview", "denied", "blank subject", "generation", "not ready", "noncanonical"] as const)("%s cannot create a DELETE intent", async (kind) => {
    const input = options()
    if (kind === "preview") input.preview = true
    if (kind === "denied") input.boundary.admitted = false
    if (kind === "blank subject") input.boundary.subject = " "
    if (kind === "generation") input.boundary.generation = -1
    if (kind === "not ready") input.current = { status: "loading" }
    if (kind === "noncanonical") input.projectRef = "project-slug"
    const request = vi.spyOn(globalThis, "fetch")
    const view = await mountIntent(input)
    expect(view.result.current.available).toBe(false)
    act(() => { view.result.current.onOpen(); view.result.current.onConfirm(); view.result.current.onRetry(); view.result.current.onRead() })
    expect(request).not.toHaveBeenCalled()
  })

  it.each(["subject", "admission", "generation", "project A-B-A", "route A-B-A", "unmount"] as const)("%s permanently retires old callback and ignored-abort ACK without refresh or follow-up GET", async (kind) => {
    const pending = deferred<Response>()
    const request = vi.spyOn(globalThis, "fetch").mockReturnValue(pending.promise)
    const input = options(); const view = await mountIntent(input)
    act(() => { view.result.current.onOpen(); view.result.current.onConfirm() })
    expect(request).toHaveBeenCalledTimes(1)
    const old = view.result.current
    const signal = request.mock.calls[0]![1]?.signal
    if (kind === "unmount") view.unmount()
    else {
      view.rerender({ ...input,
        boundary: kind === "subject" ? { ...input.boundary, subject: "new-reader" } : kind === "admission" ? { ...input.boundary, admitted: false } : kind === "generation" ? { ...input.boundary, generation: 2 } : input.boundary,
        projectRef: kind === "project A-B-A" ? otherId : id,
        routeKey: kind === "route A-B-A" ? "different-route" : input.routeKey })
      view.rerender(input)
    }
    expect(signal?.aborted).toBe(true)
    await act(async () => pending.resolve(accepted()))
    act(() => { old.onRetry(); old.onRead(); old.onConfirm(); old.onOpen() })
    expect(request).toHaveBeenCalledTimes(1)
    expect(input.onAccepted).not.toHaveBeenCalled()
    if (kind !== "unmount") expect(view.result.current.open).toBe(false)
  })

  it("StrictMode setup replay leaves one live intent and one explicit DELETE", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unknown"))
    const view = await mountIntent(options(), true)
    act(() => { view.result.current.onOpen(); view.result.current.onConfirm() })
    await waitFor(() => expect(view.result.current.status).toBe("unknown"))
    expect(request).toHaveBeenCalledTimes(1)
  })
})
