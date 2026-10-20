import { expect, it, vi } from "vitest"
import { HubClientError, type SkillInstallationClient } from "@/hub/client"
import type { PersonalInstallation } from "@/hub/schemas"
import { createSkillInstallationUpdateFlow } from "@/ui/skills/skill-installation-update-flow"

const boundary = { admitted: true, subject: "actor-a", generation: 1 }
const current: PersonalInstallation = {
  installation_id: "installation",
  series_id: "series",
  source_ref: "skill:a",
  revision: "1",
  installed: true,
  enabled: false,
  installed_at: "2026-10-15T00:00:00Z",
  updated_at: "2026-10-15T00:00:00Z",
  skill_updated_at: "2026-10-15T00:00:00Z",
  display_name: "Mine",
  summary: "A",
  source_status: "active",
  tags: [],
  category_keys: [],
  example_prompts: [],
  product: { publication_audience: "owner", state_version: "1" },
  available_update: { source_ref: "skill:b", revision: "2" },
}
const card = {
  installation_id: current.installation_id,
  skill_id: current.series_id,
  source_ref: current.source_ref,
  installed_source_ref: current.source_ref,
  available_update: current.available_update!,
  name: current.display_name,
  description: current.summary,
  scope: "personal",
  content_hash: "series",
}
const updated = {
  ...current,
  source_ref: "skill:b",
  revision: "2",
  updated_at: "2026-10-16T00:00:00Z",
}
delete updated.available_update
const receipt = {
  installation: updated,
  change: "upgraded" as const,
  event_id: "event",
  replayed: false,
}
function fixture(key = () => "frozen") {
  const get = vi
    .fn<SkillInstallationClient["get"]>()
    .mockResolvedValueOnce(current)
    .mockResolvedValue(updated)
  const update = vi
    .fn<SkillInstallationClient["update"]>()
    .mockResolvedValue(receipt)
  const flow = createSkillInstallationUpdateFlow({
    client: { get, update },
    boundary,
    key,
  })
  return { get, update, flow }
}

it("confirms the exact owner target once, preserves false, then reads current facts", async () => {
  const { flow, get, update } = fixture()
  expect(flow.select(card, boundary)).toBe(true)
  await flow.readCurrent(boundary)
  expect(flow.getSnapshot().kind).toBe("selected")
  await flow.confirm(boundary)
  expect(update).toHaveBeenCalledTimes(1)
  expect(update).toHaveBeenCalledWith(
    "installation",
    { expected_source_ref: "skill:a", source_ref: "skill:b" },
    "frozen",
    expect.any(AbortSignal),
  )
  expect(get).toHaveBeenCalledTimes(2)
  expect(flow.getSnapshot()).toMatchObject({
    kind: "completed",
    acknowledged: true,
    current: {
      installation_id: "installation",
      source_ref: "skill:b",
      enabled: false,
    },
  })
})
it("unknown update retains the original command even if GET has moved to B and no longer offers an update", async () => {
  const { flow, update } = fixture()
  update.mockRejectedValueOnce(
    new HubClientError("network", "lost ACK", null, null),
  )
  flow.select(card, boundary)
  await flow.readCurrent(boundary)
  await flow.confirm(boundary)
  expect(flow.getSnapshot().kind).toBe("unknown")
  await flow.readCurrent(boundary)
  expect(flow.getSnapshot().kind).toBe("unknown")
  expect(
    flow.select(
      { ...card, available_update: { source_ref: "skill:c", revision: "3" } },
      boundary,
    ),
  ).toBe(false)
  await flow.confirm(boundary)
  expect(update).toHaveBeenCalledTimes(2)
  expect(update.mock.calls[1]?.slice(0, 3)).toEqual(
    update.mock.calls[0]?.slice(0, 3),
  )
  expect(flow.getSnapshot().kind).toBe("completed")
})
it("explicitly abandoning an unknown update only retires the local intent, without claiming an ACK or issuing I/O", async () => {
  const key = vi.fn().mockReturnValueOnce("original-key").mockReturnValueOnce("new-key")
  const { flow, get, update } = fixture(key)
  get.mockReset().mockResolvedValue(current)
  update.mockRejectedValueOnce(new HubClientError("network", "lost ACK", null, null))
  flow.select(card, boundary)
  await flow.readCurrent(boundary)
  await flow.confirm(boundary)
  const unknown = flow.getSnapshot()
  expect(unknown.kind).toBe("unknown")
  expect(flow.reset(boundary)).toBe(false)
  expect(flow.abandon(boundary, unknown)).toBe(true)
  expect(flow.getSnapshot()).toEqual({ kind: "idle", acknowledged: false })
  await flow.confirm(boundary)
  expect(get).toHaveBeenCalledTimes(1)
  expect(update).toHaveBeenCalledTimes(1)
  expect(flow.abandon(boundary, unknown)).toBe(false)
  expect(flow.select(card, boundary)).toBe(true)
  expect(key.mock.results.map(value => value.value)).toEqual(["original-key", "new-key"])
  expect(update).toHaveBeenCalledTimes(1)
})
it("abandonment is bound to the current unknown snapshot and admission, and a retired late ACK cannot restore it", async () => {
  const { flow, update } = fixture()
  let finish!: (value: typeof receipt) => void
  update.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  flow.select(card, boundary)
  await flow.readCurrent(boundary)
  const pending = flow.confirm(boundary)
  expect(flow.abandon(boundary, flow.getSnapshot())).toBe(false)
  flow.cancel(boundary)
  const oldUnknown = flow.getSnapshot()
  expect(oldUnknown.kind).toBe("unknown")
  const rechecked = { ...boundary, generation: 2 }
  flow.bind({ ...rechecked, admitted: false })
  expect(flow.abandon({ ...rechecked, admitted: false }, flow.getSnapshot())).toBe(false)
  flow.bind(rechecked)
  expect(flow.abandon(boundary, oldUnknown)).toBe(false)
  expect(flow.abandon(rechecked, oldUnknown)).toBe(false)
  expect(flow.abandon(rechecked, flow.getSnapshot())).toBe(true)
  finish(receipt)
  await pending
  expect(flow.getSnapshot()).toEqual({ kind: "idle", acknowledged: false })
  expect(update).toHaveBeenCalledTimes(1)
})
it("an acknowledged update with failed read never sends the write again, including after same-actor recheck", async () => {
  const { flow, get, update } = fixture()
  get
    .mockReset()
    .mockResolvedValueOnce(current)
    .mockRejectedValueOnce(
      new HubClientError("network", "read lost", null, null),
    )
    .mockResolvedValue(updated)
  flow.select(card, boundary)
  await flow.readCurrent(boundary)
  await flow.confirm(boundary)
  expect(flow.getSnapshot()).toMatchObject({
    kind: "read_failed",
    acknowledged: true,
  })
  flow.bind({ ...boundary, admitted: false, generation: 2 })
  expect(flow.getSnapshot().current).toBeUndefined()
  flow.bind({ ...boundary, generation: 2 })
  await flow.confirm({ ...boundary, generation: 2 })
  expect(update).toHaveBeenCalledTimes(1)
  expect(flow.getSnapshot().kind).toBe("completed")
})
it.each(["series_id", "revision"] as const)(
  "rejects a wrong %s ACK and leaves the write unknown",
  async (field) => {
    const { flow, update } = fixture()
    update.mockResolvedValueOnce({
      ...receipt,
      installation: { ...updated, [field]: "other" },
    })
    flow.select(card, boundary)
    await flow.readCurrent(boundary)
    await flow.confirm(boundary)
    expect(flow.getSnapshot()).toMatchObject({
      kind: "unknown",
      acknowledged: false,
    })
  },
)
it("a fresh-binding 412 does not prove rollback, release the command or replace its key", async () => {
  const { flow, update } = fixture()
  update.mockRejectedValueOnce(
    new HubClientError(
      "http",
      "fresh fence",
      "skill_installation_precondition_failed",
      412,
      false,
    ),
  )
  flow.select(card, boundary)
  await flow.readCurrent(boundary)
  await flow.confirm(boundary)
  expect(flow.reset(boundary)).toBe(false)
  await flow.confirm(boundary)
  expect(update.mock.calls[1]?.slice(0, 3)).toEqual(
    update.mock.calls[0]?.slice(0, 3),
  )
})
it("same-actor recheck cancels old work permanently; a late ACK cannot settle a new attempt or its finally", async () => {
  const { flow, update } = fixture()
  let finish!: (value: typeof receipt) => void
  update.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  flow.select(card, boundary)
  await flow.readCurrent(boundary)
  const old = flow.confirm(boundary)
  flow.bind({ ...boundary, admitted: false, generation: 2 })
  expect(update.mock.calls[0]?.[3]?.aborted).toBe(true)
  flow.bind({ ...boundary, generation: 2 })
  await flow.confirm({ ...boundary, generation: 2 })
  finish(receipt)
  await old
  expect(flow.getSnapshot()).toMatchObject({
    kind: "completed",
    acknowledged: true,
  })
  expect(update.mock.calls[1]?.slice(0, 3)).toEqual(
    update.mock.calls[0]?.slice(0, 3),
  )
})
it("retiring actor A through B and back to A never reactivates its command holder", async () => {
  const { flow, update } = fixture()
  flow.select(card, boundary)
  await flow.readCurrent(boundary)
  flow.bind({ ...boundary, subject: "actor-b", generation: 2 })
  flow.bind({ ...boundary, generation: 3 })
  await flow.confirm(boundary)
  await flow.readCurrent(boundary)
  expect(update).not.toHaveBeenCalled()
  expect(flow.getSnapshot()).toEqual({ kind: "idle", acknowledged: false })
  expect(flow.select(card, boundary)).toBe(false)
})
it("a changed authoritative target is not silently substituted into the selected command", async () => {
  const { flow, get, update } = fixture()
  get
    .mockReset()
    .mockResolvedValue({
      ...current,
      available_update: { source_ref: "skill:c", revision: "3" },
    })
  flow.select(card, boundary)
  await flow.readCurrent(boundary)
  await flow.confirm(boundary)
  expect(flow.getSnapshot().kind).toBe("unavailable")
  expect(update).not.toHaveBeenCalled()
})

it("releasing an owner with an unknown write stops I/O immediately and permanently retires it after the StrictMode grace microtask", async () => {
  const { flow, get, update } = fixture()
  update.mockRejectedValueOnce(
    new HubClientError("network", "lost ACK", null, null),
  )
  const release = flow.retain(boundary)
  flow.select(card, boundary)
  await flow.readCurrent(boundary)
  await flow.confirm(boundary)
  expect(flow.getSnapshot().kind).toBe("unknown")
  release()
  await flow.confirm(boundary)
  await flow.readCurrent(boundary)
  expect(update).toHaveBeenCalledTimes(1)
  expect(get).toHaveBeenCalledTimes(1)
  await Promise.resolve()
  flow.bind(boundary)
  await flow.confirm(boundary)
  await flow.readCurrent(boundary)
  expect(flow.select(card, boundary)).toBe(false)
  expect(update).toHaveBeenCalledTimes(1)
  expect(get).toHaveBeenCalledTimes(1)
})
it("StrictMode reacquire retains the holder, but a previous generation callback cannot borrow its new admission", async () => {
  const { flow, update, get } = fixture()
  get
    .mockReset()
    .mockResolvedValueOnce(current)
    .mockResolvedValueOnce(current)
    .mockResolvedValue(updated)
  const release = flow.retain(boundary)
  release()
  const releaseReplay = flow.retain(boundary)
  await Promise.resolve()
  flow.select(card, boundary)
  await flow.readCurrent(boundary)
  const next = { ...boundary, generation: 2 }
  flow.bind(next)
  await flow.confirm(boundary)
  expect(update).not.toHaveBeenCalled()
  await flow.readCurrent(next)
  await flow.confirm(next)
  expect(update).toHaveBeenCalledTimes(1)
  releaseReplay()
})
