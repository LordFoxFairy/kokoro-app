import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { getProjectResource, deleteProjectResource } from "@/features/app/project-resource-access"
import { useProjectResourceActions } from "@/features/app/use-project-resource-actions"
const id = "asset-one"
const item = { asset_id: id, filename: "notes.txt", mime_type: "text/plain", size_bytes: "3", content_sha256: "a".repeat(64), scan_state: "clean" }
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "cache-control": "private, no-store, max-age=0" } })
const metadata = () => json({ data: { resource: item }, meta: { request_id: "request-1" } })
afterEach(() => vi.restoreAllMocks())
it("gets fresh scoped metadata and rejects a different asset rather than trusting the list view", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(metadata())
    .mockResolvedValueOnce(json({ data: { resource: { ...item, asset_id: "other" } }, meta: { request_id: "r" } }))
  expect(await getProjectResource("project-one", id, new AbortController().signal)).toEqual(item)
  expect(fetcher.mock.calls[0]?.[0]).toBe("/api/hub/projects/project-one/resources/asset-one")
  await expect(getProjectResource("project-one", id, new AbortController().signal)).rejects.toThrow()
})
it("does not turn malformed409 into a terminal rejection or accept another asset deletion ACK", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(json({ error: { code: "mystery" } }, 409))
    .mockResolvedValueOnce(json({ data: { asset_id: "other", deleted_at: "2026-10-26T00:00:00.000Z", replayed: false }, meta: { request_id: "r" } }))
  const command = { projectRef: "project-one", assetId: id, key: "original-key", body: null }
  await expect(deleteProjectResource(command, new AbortController().signal)).rejects.toMatchObject({ verifiedOwner: false })
  await expect(deleteProjectResource(command, new AbortController().signal)).rejects.toMatchObject({ verifiedOwner: false })
})
it("retains exact unknown command through close/reopen; ACK removes only its asset without waiting for fresh list", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(metadata())
    .mockResolvedValueOnce(json({ error: { code: "project_resource_delete_unknown", message: "unknown" }, meta: { request_id: "r" } }, 503))
    .mockResolvedValueOnce(metadata())
    .mockResolvedValueOnce(json({ data: { asset_id: id, deleted_at: "2026-10-26T00:00:00.000Z", replayed: true }, meta: { request_id: "r" } }))
  const onDeleted = vi.fn()
  const context = {}
  const view = renderHook(() => useProjectResourceActions("project-one", context, true, onDeleted))
  act(() => view.result.current.open(id))
  await waitFor(() => expect(view.result.current.metadata?.asset_id).toBe(id))
  act(() => view.result.current.askDelete())
  act(() => view.result.current.confirmDelete())
  await waitFor(() => expect(view.result.current.deleteState).toBe("unknown"))
  act(() => view.result.current.close())
  expect(fetcher).toHaveBeenCalledTimes(2)
  act(() => view.result.current.open(id))
  await waitFor(() => expect(view.result.current.metadata?.asset_id).toBe(id))
  expect(view.result.current.deleteState).toBe("unknown")
  act(() => view.result.current.confirmDelete())
  await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(id))
  const writes = fetcher.mock.calls.filter(([, init]) => init?.method === "DELETE")
  expect(writes).toHaveLength(2)
  expect(new Headers(writes[0]?.[1]?.headers).get("idempotency-key")).toBe(new Headers(writes[1]?.[1]?.headers).get("idempotency-key"))
  expect(writes.every(([, init]) => init?.body === undefined)).toBe(true)
})
it("retires old actor scope and ignores its late metadata", async () => {
  let resolve!: (response: Response) => void
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementationOnce(
    () =>
      new Promise<Response>((done) => {
        resolve = done
      }),
  )
  const deleted = vi.fn()
  const a = {},
    b = {}
  const view = renderHook(({ context }) => useProjectResourceActions("project-one", context, true, deleted), { initialProps: { context: a } })
  act(() => view.result.current.open(id))
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
  view.rerender({ context: b })
  expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  await act(async () => {
    resolve(metadata())
    await Promise.resolve()
  })
  expect(view.result.current.metadata).toBeNull()
  expect(view.result.current.selected).toBeNull()
  expect(deleted).not.toHaveBeenCalled()
})
it.each([
  [400, { error: { code: "invalid_project_resource", message: "bad" }, meta: { request_id: "r" } }, true],
  [403, { error: { code: "session_forbidden", message: "denied" }, meta: { request_id: "r" } }, true],
  [409, { error: { code: "project_resource_conflict", message: "conflict" }, meta: { request_id: "r" } }, false],
  [409, { error: { code: "idempotency_in_progress", message: "pending" }, meta: { request_id: "r" } }, false],
  [403, { error: { code: "session_forbidden", message: "denied", retryable: false }, meta: { request_id: "r" } }, false],
  [400, { error: { code: "project_resource_conflict", message: "wrong status" }, meta: { request_id: "r" } }, false],
])("binds terminal deletion classification to the actual exact owner error profile %s", async (status, body, verifiedOwner) => {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(body, status))
  await expect(deleteProjectResource({ projectRef: "p", assetId: id, key: "same-key", body: null }, new AbortController().signal)).rejects.toMatchObject({
    verifiedOwner,
  })
})
it("HTML403 remains an unknown result, not authority to retire the original command", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response("<html>gateway</html>", { status: 403, headers: { "content-type": "text/html", "cache-control": "private, no-store, max-age=0" } }),
  )
  await expect(deleteProjectResource({ projectRef: "p", assetId: id, key: "same-key", body: null }, new AbortController().signal)).rejects.toMatchObject({
    verifiedOwner: false,
  })
})
it("closing an in-flight deletion cancels transport but retains its original command for explicit recovery", async () => {
  let complete!: (response: Response) => void
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(metadata())
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve
        }),
    )
    .mockResolvedValueOnce(metadata())
    .mockResolvedValueOnce(json({ data: { asset_id: id, deleted_at: "2026-10-26T00:00:00.000Z", replayed: true }, meta: { request_id: "r" } }))
  const removed = vi.fn(),
    context = {}
  const view = renderHook(() => useProjectResourceActions("p", context, true, removed))
  act(() => view.result.current.open(id))
  await waitFor(() => expect(view.result.current.metadata).not.toBeNull())
  act(() => view.result.current.askDelete())
  act(() => view.result.current.confirmDelete())
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  act(() => view.result.current.close())
  expect(fetcher.mock.calls[1]?.[1]?.signal?.aborted).toBe(true)
  await act(async () => {
    complete(json({ data: { asset_id: id, deleted_at: "2026-10-26T00:00:00.000Z", replayed: false }, meta: { request_id: "r" } }))
    await Promise.resolve()
  })
  expect(removed).not.toHaveBeenCalled()
  act(() => view.result.current.open(id))
  await waitFor(() => expect(view.result.current.metadata).not.toBeNull())
  expect(view.result.current.deleteState).toBe("unknown")
  act(() => view.result.current.confirmDelete())
  await waitFor(() => expect(removed).toHaveBeenCalledWith(id))
  const commands = fetcher.mock.calls.filter(([, init]) => init?.method === "DELETE")
  expect(new Headers(commands[0]?.[1]?.headers).get("idempotency-key")).toBe(new Headers(commands[1]?.[1]?.headers).get("idempotency-key"))
})
it.each(["typed403", "html403", "read503"])("a fresh metadata admission profile %s retires only real revoked authority", async (kind) => {
  const readFailure =
    kind === "typed403"
      ? json({ error: { code: "session_forbidden", message: "revoked" }, meta: { request_id: "r" } }, 403)
      : kind === "html403"
        ? new Response("gateway", { status: 403, headers: { "content-type": "text/html", "cache-control": "private, no-store, max-age=0" } })
        : json({ error: { code: "business_store_unavailable", message: "offline" }, meta: { request_id: "r" } }, 503)
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(metadata())
    .mockResolvedValueOnce(json({ error: { code: "project_resource_delete_unknown", message: "unknown" }, meta: { request_id: "r" } }, 503))
    .mockResolvedValueOnce(readFailure)
    .mockResolvedValueOnce(json({ data: { asset_id: id, deleted_at: "2026-10-26T00:00:00.000Z", replayed: true }, meta: { request_id: "r" } }))
  const context = {},
    removed = vi.fn()
  const view = renderHook(() => useProjectResourceActions("p", context, true, removed))
  act(() => view.result.current.open(id))
  await waitFor(() => expect(view.result.current.metadata).not.toBeNull())
  act(() => view.result.current.askDelete())
  act(() => view.result.current.confirmDelete())
  await waitFor(() => expect(view.result.current.deleteState).toBe("unknown"))
  const originalKey = new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("idempotency-key")
  act(() => view.result.current.close())
  act(() => view.result.current.open(id))
  await waitFor(() => expect(view.result.current.loading).toBe(false))
  act(() => view.result.current.confirmDelete())
  if (kind === "typed403") {
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(removed).not.toHaveBeenCalled()
    expect(view.result.current.deleteState).toBe("forbidden")
  } else {
    await waitFor(() => expect(removed).toHaveBeenCalledWith(id))
    expect(new Headers(fetcher.mock.calls[3]?.[1]?.headers).get("idempotency-key")).toBe(originalKey)
  }
})
it("quiet metadata shell has no visible generic loading or read-error retry panel", async () => {
  const { render, screen } = await import("@testing-library/react")
  const { ProjectResourceDetail } = await import("@/features/app/project-resource-detail")
  const { LocaleProvider } = await import("@/i18n/context")
  const controls = {
    selected: "a",
    metadata: null,
    loading: true,
    error: false,
    deleteState: "idle" as const,
    downloadState: "idle" as const,
    open: vi.fn(),
    close: vi.fn(),
    askDelete: vi.fn(),
    confirmDelete: vi.fn(),
    download: vi.fn(),
  }
  const view = render(
    <LocaleProvider>
      <ProjectResourceDetail actions={controls} onReturnFocus={vi.fn()} />
    </LocaleProvider>,
  )
  const state = screen.queryByRole("status")
  if (state) expect(state).toHaveClass("sr-only")
  view.rerender(
    <LocaleProvider>
      <ProjectResourceDetail actions={{ ...controls, loading: false, error: true }} onReturnFocus={vi.fn()} />
    </LocaleProvider>,
  )
  expect(screen.queryByRole("alert")).toBeNull()
  expect(screen.queryByRole("button", { name: "重试" })).toBeNull()
})
it("tags only the exact Web pre-owner413 as replaceable local validation, not an owner or unknown command", async () => {
  const { uploadProjectResource } = await import("@/features/app/project-resource-upload")
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      Response.json({ error: "request_body_too_large" }, { status: 413, headers: { "x-kokoro-local-upload-validation": "request-body-too-large" } }),
    )
    .mockResolvedValueOnce(Response.json({ error: { code: "request_body_too_large", message: "owner" }, meta: { request_id: "r" } }, { status: 413 }))
    .mockRejectedValueOnce(new Error("connection lost"))
  const file = new File(["abc"], "same.txt", { type: "text/plain" })
  await expect(uploadProjectResource("p", file, "local")).rejects.toMatchObject({ localValidation: true, retryable: false })
  await expect(uploadProjectResource("p", file, "owner")).rejects.toMatchObject({ localValidation: false })
  await expect(uploadProjectResource("p", file, "unknown")).rejects.toMatchObject({ localValidation: false, retryable: true })
})
it("canceling an unwritten delete confirmation requires a fresh confirmation after reopening", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(metadata()).mockResolvedValueOnce(metadata())
  const context = {}, removed = vi.fn()
  const view = renderHook(() => useProjectResourceActions("p", context, true, removed))
  act(() => view.result.current.open(id))
  await waitFor(() => expect(view.result.current.metadata).not.toBeNull())
  act(() => view.result.current.askDelete())
  expect(view.result.current.deleteState).toBe("confirm")
  act(() => view.result.current.close())
  act(() => view.result.current.open(id))
  await waitFor(() => expect(view.result.current.metadata).not.toBeNull())
  expect(view.result.current.deleteState).toBe("idle")
  act(() => view.result.current.confirmDelete())
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(removed).not.toHaveBeenCalled()
  act(() => view.result.current.askDelete())
  expect(view.result.current.deleteState).toBe("confirm")
  expect(fetcher).toHaveBeenCalledTimes(2)
})
