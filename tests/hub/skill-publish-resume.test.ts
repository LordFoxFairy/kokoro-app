import { expect, it, vi } from "vitest"

import { HubClientError } from "@/hub/client"
import type { SkillPublishClient } from "@/hub/skill-publish-client"
import { createPersonalSkillPublishSession, runPersonalSkillPublishSession } from "@/ui/skills/personal-skill-publish-flow"

function fixture(scanState: "clean" | "pending" | "unknown" = "clean") {
  const sha = "a".repeat(64)
  const client = {
    createDraft: vi.fn().mockResolvedValue({ skill_id: "mine", series_id: "series", revision: 1, status: "draft", replayed: false }),
    getUpload: vi.fn().mockResolvedValueOnce({ skill_id: "mine", attempt_epoch: "0", phase: "none" }).mockResolvedValue({ skill_id: "mine", attempt_epoch: "1", phase: "uploaded", attempt_id: "attempt", upload_id: "upload" }),
    beginUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", transfer_reference: { url: "https://objects.example/put", method: "PUT", required_headers: { "content-type": "application/zip" }, expires_at: "2999-01-01T00:00:00Z" }, replayed: false }),
    putPackage: vi.fn().mockResolvedValue(undefined),
    completeUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", phase: "uploaded", replayed: false, content_sha256: sha, scan_state: scanState }),
    validateDraft: vi.fn().mockResolvedValue({ skill_id: "mine", series_id: "series", valid: true, content_digest: sha, manifest_identity: `zip-v1:sha256:${sha}`, replayed: false }),
    publishDraft: vi.fn().mockResolvedValue({ source_ref: "skill:mine", revision: "1", status: "active", event_id: "550e8400-e29b-41d4-a716-446655440000", replayed: false }),
    getPublished: vi.fn(),
  }
  const session = createPersonalSkillPublishSession({ file: new File(["zip"], "mine.zip"), display_name: "Mine", summary: "", tags: [] })
  return { client, session, options: { hash: async () => sha } }
}

it.each(["pending", "unknown"] as const)("retains the same attempt and keys while %s scan is pending, then resumes validation", async (scanState) => {
  const { client, session, options } = fixture(scanState)
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, options)).rejects.toMatchObject({ name: "SkillPublishPending" })
  expect(client.validateDraft).not.toHaveBeenCalled()
  expect(client.publishDraft).not.toHaveBeenCalled()
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, options)).resolves.toEqual({ source_ref: "skill:mine", revision: "1" })
  expect(client.createDraft).toHaveBeenCalledTimes(1)
  expect(client.beginUpload).toHaveBeenCalledTimes(1)
  expect(client.completeUpload).toHaveBeenCalledTimes(1)
  expect(client.validateDraft).toHaveBeenCalledWith("mine", "attempt", expect.any(String), undefined)
})

it("retries a pending validation with the identical attempt and idempotency key", async () => {
  const { client, session, options } = fixture("pending")
  client.validateDraft.mockRejectedValueOnce(new HubClientError("http", "scan pending", "skill_precondition_failed", 412))
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, options)).rejects.toMatchObject({ name: "SkillPublishPending" })
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, options)).rejects.toMatchObject({ name: "SkillPublishPending" })
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, options)).resolves.toEqual({ source_ref: "skill:mine", revision: "1" })
  expect(client.validateDraft.mock.calls[0]).toEqual(client.validateDraft.mock.calls[1])
  expect(client.createDraft).toHaveBeenCalledTimes(1)
})

it("stops a resumed scan when the owner has replaced the attempt", async () => {
  const { client, session, options } = fixture("pending")
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, options)).rejects.toMatchObject({ name: "SkillPublishPending" })
  client.getUpload.mockResolvedValueOnce({ skill_id: "mine", attempt_epoch: "2", phase: "uploaded", attempt_id: "other", upload_id: "other-upload" })
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, options)).rejects.toMatchObject({ name: "SkillPublishRestartRequired" })
  expect(client.validateDraft).not.toHaveBeenCalled()
  expect(client.publishDraft).not.toHaveBeenCalled()
})

it("rechecks a lost Publish ACK by ID on resume without a new draft or publish key", async () => {
  const { client, session, options } = fixture()
  client.publishDraft.mockRejectedValueOnce(new HubClientError("network", "lost ACK", null, null)).mockRejectedValueOnce(new HubClientError("network", "lost ACK", null, null))
  client.getPublished.mockRejectedValueOnce(new HubClientError("http", "not found", "skill_not_found", 404)).mockResolvedValueOnce({ skill_id: "mine", source_ref: "skill:mine", revision: "1", status: "active", name: "Mine", summary: "", tags: [] })
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, options)).rejects.toMatchObject({ name: "SkillPublishUncertain" })
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, options)).resolves.toEqual({ source_ref: "skill:mine", revision: "1" })
  expect(client.createDraft).toHaveBeenCalledTimes(1)
  expect(client.publishDraft).toHaveBeenCalledTimes(2)
  expect(client.publishDraft.mock.calls[0]).toEqual(client.publishDraft.mock.calls[1])
})

it("replays the identical zero-byte Publish key after a second authoritative 404, not a new Draft", async () => {
  const { client, session, options } = fixture()
  client.publishDraft.mockRejectedValueOnce(new HubClientError("network", "lost ACK", null, null))
    .mockRejectedValueOnce(new HubClientError("network", "lost ACK", null, null))
  client.getPublished.mockRejectedValueOnce(new HubClientError("http", "not found", "skill_not_found", 404))
    .mockRejectedValueOnce(new HubClientError("http", "not found", "skill_not_found", 404))
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, options)).rejects.toMatchObject({ name: "SkillPublishUncertain" })
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, options)).resolves.toEqual({ source_ref: "skill:mine", revision: "1" })
  expect(client.getPublished).toHaveBeenCalledTimes(2)
  expect(client.publishDraft).toHaveBeenCalledTimes(3)
  expect(client.publishDraft.mock.calls[0]).toEqual(client.publishDraft.mock.calls[1])
  expect(client.publishDraft.mock.calls[1]).toEqual(client.publishDraft.mock.calls[2])
  expect(client.createDraft).toHaveBeenCalledTimes(1)
})

it.each([401, 403])("never resends Publish when a resumed authoritative read returns %s", async (status) => {
  const { client, session, options } = fixture()
  client.publishDraft.mockRejectedValueOnce(new HubClientError("network", "lost ACK", null, null))
    .mockRejectedValueOnce(new HubClientError("network", "lost ACK", null, null))
  client.getPublished.mockRejectedValueOnce(new HubClientError("http", "not found", "skill_not_found", 404))
    .mockRejectedValueOnce(new HubClientError("http", "revoked", status === 401 ? "session_authentication_required" : "session_forbidden", status))
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, options)).rejects.toMatchObject({ name: "SkillPublishUncertain" })
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, options)).rejects.toMatchObject({ reason: "http", status })
  expect(client.publishDraft).toHaveBeenCalledTimes(2)
  expect(client.createDraft).toHaveBeenCalledTimes(1)
})

it("rejects a Draft command over the owner's 65,536-byte raw-body limit before allocating a publish intention", () => {
  expect(() => createPersonalSkillPublishSession({ file: new File(["zip"], "mine.zip"), display_name: "Mine", summary: "S".repeat(65535), tags: [] })).toThrowError(expect.objectContaining({ code: "request_body_too_large", status: 413 }))
})

it.each([" a.zip", `${"界".repeat(85)}.zip`])("rejects owner-invalid ZIP filename %s before CreateDraft", (filename) => {
  expect(() => createPersonalSkillPublishSession({ file: new File(["zip"], filename), display_name: "Mine", summary: "", tags: [] })).toThrowError(expect.objectContaining({ code: "invalid_skill_request", status: 400 }))
})

it.each([401, 403])("preserves owner authorization status %s during by-ID recovery", async (status) => {
  const { client, session, options } = fixture()
  client.publishDraft.mockRejectedValueOnce(new HubClientError("network", "lost ACK", null, null)).mockRejectedValueOnce(new HubClientError("network", "lost ACK", null, null))
  client.getPublished.mockRejectedValueOnce(new HubClientError("http", "revoked", status === 401 ? "session_authentication_required" : "session_forbidden", status))
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, options)).rejects.toMatchObject({ reason: "http", status })
  expect(client.publishDraft).toHaveBeenCalledTimes(2)
  expect(client.createDraft).toHaveBeenCalledTimes(1)
})
