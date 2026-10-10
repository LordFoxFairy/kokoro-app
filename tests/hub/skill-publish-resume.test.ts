import { expect, it, vi } from "vitest"

import { HubClientError } from "@/hub/client"
import type { SkillPublishClient } from "@/hub/skill-publish-client"
import { createPersonalSkillPublishSession, createResumedSkillPublishSession, runPersonalSkillPublishSession } from "@/ui/skills/personal-skill-publish-flow"

function fixture(scanState: "clean" | "pending" | "unknown" = "clean") {
  const sha = "a".repeat(64)
  const client = {
    createDraft: vi.fn().mockResolvedValue({ skill_id: "mine", series_id: "series", revision: 1, status: "draft", state_version: "1", replayed: false }),
    getUpload: vi.fn().mockResolvedValueOnce({ skill_id: "mine", attempt_epoch: "0", phase: "none", state_version: "1" }).mockResolvedValue({ skill_id: "mine", attempt_epoch: "1", phase: "uploaded", state_version: "3", source_version_id: "object-version-1", attempt_id: "attempt", upload_id: "upload" }),
    beginUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", transfer_reference: { url: "https://objects.example/put", method: "PUT", required_headers: { "content-type": "application/zip" }, expires_at: "2999-01-01T00:00:00Z" }, replayed: false, state_version: "2" }),
    putPackage: vi.fn().mockResolvedValue({ source_version_id: "object-version-1" }),
    completeUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", phase: "uploaded", replayed: false, state_version: "3", content_sha256: sha, scan_state: scanState }),
    validateDraft: vi.fn().mockResolvedValue({ skill_id: "mine", series_id: "series", valid: true, state_version: "4", content_digest: sha, manifest_identity: `skill-md-v1:sha256:${sha}`, replayed: false }),
    publishDraft: vi.fn().mockResolvedValue({ source_ref: "skill:mine", revision: "1", status: "active", state_version: "5", event_id: "550e8400-e29b-41d4-a716-446655440000", replayed: false }),
    getPublished: vi.fn(),
  }
  const session = createPersonalSkillPublishSession({ file: new File(["zip"], "mine.zip"), display_name: "Mine", summary: "", tags: [], audience: "owner" as const })
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
  expect(client.validateDraft).toHaveBeenCalledWith("mine", { attempt_id: "attempt", expected_state_version: "3" }, expect.any(String), undefined)
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
  client.getUpload.mockResolvedValueOnce({ skill_id: "mine", attempt_epoch: "2", phase: "uploaded", state_version: "3", source_version_id: "object-version-1", attempt_id: "other", upload_id: "other-upload" })
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, options)).rejects.toMatchObject({ name: "SkillPublishRestartRequired" })
  expect(client.validateDraft).not.toHaveBeenCalled()
  expect(client.publishDraft).not.toHaveBeenCalled()
})

it("rechecks a lost Publish ACK by ID on resume without a new draft or publish key", async () => {
  const { client, session, options } = fixture()
  client.publishDraft.mockRejectedValueOnce(new HubClientError("network", "lost ACK", null, null)).mockRejectedValueOnce(new HubClientError("network", "lost ACK", null, null))
  client.getPublished.mockRejectedValueOnce(new HubClientError("http", "not found", "skill_not_found", 404)).mockResolvedValueOnce({ skill_id: "mine", source_ref: "skill:mine", revision: "1", status: "active", name: "Mine", summary: "", tags: [], series_id: "series", skill_updated_at: "2026-10-10T00:00:00Z", example_prompts: [], category_keys: [], product: { publication_audience: "owner", state_version: "5" } })
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, options)).rejects.toMatchObject({ name: "SkillPublishUncertain" })
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, options)).resolves.toEqual({ source_ref: "skill:mine", revision: "1" })
  expect(client.createDraft).toHaveBeenCalledTimes(1)
  expect(client.publishDraft).toHaveBeenCalledTimes(2)
  expect(client.publishDraft.mock.calls[0]).toEqual(client.publishDraft.mock.calls[1])
})

it("replays the identical frozen JSON Publish body/key after a second authoritative 404, not a new Draft", async () => {
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
  expect(() => createPersonalSkillPublishSession({ file: new File(["zip"], "mine.zip"), display_name: "Mine", summary: "S".repeat(65535), tags: [], audience: "owner" as const })).toThrowError(expect.objectContaining({ code: "request_body_too_large", status: 413 }))
})

it.each([" a.zip", `${"界".repeat(85)}.zip`])("rejects owner-invalid ZIP filename %s before CreateDraft", (filename) => {
  expect(() => createPersonalSkillPublishSession({ file: new File(["zip"], filename), display_name: "Mine", summary: "", tags: [], audience: "owner" as const })).toThrowError(expect.objectContaining({ code: "invalid_skill_request", status: 400 }))
})

it.each([401, 403])("preserves owner authorization status %s during by-ID recovery", async (status) => {
  const { client, session, options } = fixture()
  client.publishDraft.mockRejectedValueOnce(new HubClientError("network", "lost ACK", null, null)).mockRejectedValueOnce(new HubClientError("network", "lost ACK", null, null))
  client.getPublished.mockRejectedValueOnce(new HubClientError("http", "revoked", status === 401 ? "session_authentication_required" : "session_forbidden", status))
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, options)).rejects.toMatchObject({ reason: "http", status })
  expect(client.publishDraft).toHaveBeenCalledTimes(2)
  expect(client.createDraft).toHaveBeenCalledTimes(1)
})

const managedDraft = { skill_id: "mine", source_ref: "skill:mine", series_id: "series", revision: "1", name: "Mine", summary: "", tags: [], status: "draft" as const, skill_updated_at: "2026-10-10T00:00:00Z", example_prompts: [], category_keys: [], product: { state_version: "4", publication_audience: "owner" as const } }

it.each(["uploaded", "validated"] as const)("refresh resumes the authoritative %s phase as a new explicit intention without synthetic old ACKs", async (phase) => {
  const { client } = fixture()
  const resumedClient = { ...client, getManaged: vi.fn().mockResolvedValue(managedDraft), getUpload: vi.fn().mockResolvedValue({ skill_id: "mine", state_version: "4", attempt_epoch: "1", phase, attempt_id: "attempt", upload_id: "upload", source_version_id: "object-version-1" }) }
  const session = createResumedSkillPublishSession(managedDraft, "tenant")
  await expect(runPersonalSkillPublishSession(resumedClient as unknown as SkillPublishClient, session)).resolves.toEqual({ source_ref: "skill:mine", revision: "1" })
  expect(client.createDraft).not.toHaveBeenCalled()
  expect(client.beginUpload).not.toHaveBeenCalled()
  expect(client.putPackage).not.toHaveBeenCalled()
  expect(client.completeUpload).not.toHaveBeenCalled()
  if (phase === "uploaded") expect(client.validateDraft).toHaveBeenCalledWith("mine", { attempt_id: "attempt", expected_state_version: "4" }, session.keys.validate, undefined)
  else { expect(client.validateDraft).not.toHaveBeenCalled(); expect(session.validated).toBeUndefined() }
  expect(client.publishDraft).toHaveBeenCalledWith("mine", { audience: "tenant", expected_state_version: "4" }, session.keys.publish, undefined)
})

it.each(["intent", "upload_pending", "aborted"] as const)("refresh requires explicit replacement for %s and never invents a PUT version", async (phase) => {
  const { client } = fixture()
  const resumedClient = { ...client, getManaged: vi.fn().mockResolvedValue(managedDraft), getUpload: vi.fn().mockResolvedValue({ skill_id: "mine", state_version: "4", attempt_epoch: "1", phase, attempt_id: "attempt", ...(phase === "upload_pending" ? { upload_id: "upload" } : {}) }) }
  const session = createResumedSkillPublishSession(managedDraft, "owner")
  await expect(runPersonalSkillPublishSession(resumedClient as unknown as SkillPublishClient, session)).rejects.toMatchObject({ name: "SkillPublishRestartRequired" })
  expect(client.beginUpload).not.toHaveBeenCalled(); expect(client.putPackage).not.toHaveBeenCalled(); expect(client.publishDraft).not.toHaveBeenCalled()
})

it("does not replace a refreshed attempt when the owner rejects its qualification with 412", async () => {
  const { client } = fixture()
  const resumedClient = { ...client, getManaged: vi.fn().mockResolvedValue(managedDraft), getUpload: vi.fn().mockRejectedValue(new HubClientError("http", "Pending", "skill_precondition_failed", 412)) }
  await expect(runPersonalSkillPublishSession(resumedClient as unknown as SkillPublishClient, createResumedSkillPublishSession(managedDraft, "owner"))).rejects.toMatchObject({ status: 412 })
  expect(client.beginUpload).not.toHaveBeenCalled(); expect(client.publishDraft).not.toHaveBeenCalled()
})

it("keeps the original frozen Validate body/key even when recovery reads a newer state version", async () => {
  const { client, session, options } = fixture()
  client.validateDraft.mockRejectedValueOnce(new HubClientError("network", "lost", null, null)).mockRejectedValueOnce(new HubClientError("network", "lost", null, null))
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, options)).rejects.toMatchObject({ reason: "network" })
  client.getUpload.mockResolvedValue({ skill_id: "mine", state_version: "99", attempt_epoch: "1", phase: "validated", attempt_id: "attempt", upload_id: "upload", source_version_id: "object-version-1" })
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, options)).resolves.toEqual({ source_ref: "skill:mine", revision: "1" })
  expect(client.validateDraft.mock.calls[0]).toEqual(client.validateDraft.mock.calls[2])
  expect(session.validateBody).toEqual({ attempt_id: "attempt", expected_state_version: "3" })
  expect(Object.isFrozen(session.validateBody)).toBe(true)
})

it("freezes replacement identity using only the observed old attempt and current CAS", async () => {
  const { client } = fixture()
  const resumedClient = { ...client, getManaged: vi.fn().mockResolvedValue(managedDraft), getUpload: vi.fn().mockResolvedValue({ skill_id: "mine", state_version: "4", attempt_epoch: "1", phase: "upload_pending", attempt_id: "old", upload_id: "old-upload" }) }
  client.beginUpload.mockResolvedValue({ skill_id: "mine", state_version: "5", attempt_epoch: "2", attempt_id: "attempt", upload_id: "upload", transfer_reference: { url: "https://objects.example/put", method: "PUT", required_headers: { "content-type": "application/zip" }, expires_at: "2999-01-01T00:00:00Z" }, replayed: false })
  client.completeUpload.mockResolvedValue({ skill_id: "mine", state_version: "6", attempt_epoch: "2", attempt_id: "attempt", upload_id: "upload", phase: "uploaded", scan_state: "clean", content_sha256: "a".repeat(64), replayed: false })
  client.validateDraft.mockResolvedValue({ skill_id: "mine", series_id: "series", state_version: "7", valid: true, content_digest: "a".repeat(64), manifest_identity: `skill-md-v1:sha256:${"a".repeat(64)}`, replayed: false })
  client.publishDraft.mockResolvedValue({ source_ref: "skill:mine", revision: "1", status: "active", state_version: "8", event_id: "550e8400-e29b-41d4-a716-446655440000", replayed: false })
  const session = createResumedSkillPublishSession(managedDraft, "catalog", new File(["zip"], "replacement.zip"))
  await expect(runPersonalSkillPublishSession(resumedClient as unknown as SkillPublishClient, session, { hash: async () => "a".repeat(64) })).resolves.toEqual({ source_ref: "skill:mine", revision: "1" })
  expect(client.createDraft).not.toHaveBeenCalled()
  expect(session.beginBody).toMatchObject({ expected_state_version: "4", replaces_attempt_id: "old", filename: "replacement.zip" })
  expect(session.completeBody).toMatchObject({ expected_state_version: "5", source_version_id: "object-version-1" })
  expect(session.publishBody).toEqual({ expected_state_version: "7", audience: "catalog" })
  for (const body of [session.beginBody, session.completeBody, session.validateBody, session.publishBody, session.input, session.keys]) expect(Object.isFrozen(body)).toBe(true)
})

it("does not commit a late Create ACK after cancellation or issue the next command", async () => {
  const { client, session, options } = fixture()
  const controller = new AbortController()
  client.createDraft.mockImplementation(async () => { controller.abort(); return { skill_id: "mine", series_id: "series", revision: 1, status: "draft", state_version: "1", replayed: false } })
  await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient, session, { ...options, signal: controller.signal })).rejects.toMatchObject({ reason: "aborted" })
  expect(session.draft).toBeUndefined(); expect(client.getUpload).not.toHaveBeenCalled(); expect(client.publishDraft).not.toHaveBeenCalled()
})
