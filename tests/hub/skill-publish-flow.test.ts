import { expect, it, vi } from "vitest"

import { publishPersonalSkill } from "@/ui/skills/personal-skill-publish-flow"
import type { SkillPublishClient } from "@/hub/skill-publish-client"
import { HubClientError } from "@/hub/client"

it("requires an ACTIVE receipt after the single-ZIP owner command chain", async () => {
  const client = {
    createDraft: vi.fn().mockResolvedValue({ skill_id: "mine", series_id: "series", revision: 1, status: "draft", replayed: false }),
    getUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_epoch: "0", phase: "none" }),
    beginUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", transfer_reference: { url: "https://objects.example/upload", method: "PUT", required_headers: { "content-type": "application/zip" }, expires_at: "2999-01-01T00:00:00Z" }, replayed: false }),
    putPackage: vi.fn().mockResolvedValue(undefined),
    completeUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", phase: "uploaded", replayed: false, content_sha256: "a".repeat(64), scan_state: "clean" }),
    validateDraft: vi.fn().mockResolvedValue({ skill_id: "mine", series_id: "series", valid: true, content_digest: "a".repeat(64), manifest_identity: `zip-v1:sha256:${"a".repeat(64)}`, replayed: false }),
    publishDraft: vi.fn().mockRejectedValueOnce(new HubClientError("network", "lost ACK", null, null)).mockResolvedValueOnce({ source_ref: "skill:mine", revision: "1", status: "active", event_id: "550e8400-e29b-41d4-a716-446655440000", replayed: true }),
    getPublished: vi.fn(),
  }
  const file = new File(["zip"], "mine.zip", { type: "application/zip" })
  const signal = new AbortController().signal
  const result = await publishPersonalSkill(client as unknown as SkillPublishClient, { file, display_name: "Mine", summary: "Summary", tags: [] }, {
    signal, hash: async () => "a".repeat(64),
  })
  expect(result).toEqual({ source_ref: "skill:mine", revision: "1" })
  expect(client.createDraft).toHaveBeenCalledTimes(1)
  expect(client.getUpload).toHaveBeenCalledWith("mine", expect.any(AbortSignal))
  expect(client.putPackage).toHaveBeenCalledTimes(1)
  expect(client.publishDraft).toHaveBeenCalledTimes(2)
  expect(client.publishDraft.mock.calls[0]).toEqual(client.publishDraft.mock.calls[1])
})

it("does not publish when the authoritative upload state already has an old attempt", async () => {
  const client = { createDraft: vi.fn().mockResolvedValue({ skill_id: "mine", series_id: "series", revision: 1, status: "draft", replayed: false }), getUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_epoch: "1", phase: "uploaded", attempt_id: "old", upload_id: "old-upload" }), beginUpload: vi.fn() }
  await expect(publishPersonalSkill(client as unknown as SkillPublishClient, { file: new File(["zip"], "mine.zip"), display_name: "Mine", summary: "", tags: [] }, { hash: async () => "a".repeat(64) })).rejects.toMatchObject({ reason: "parse" })
  expect(client.beginUpload).not.toHaveBeenCalled()
})

it("never treats a lost Publish ACK or validation as success without ACTIVE by-ID recovery", async () => {
  const client = {
    createDraft: vi.fn().mockResolvedValue({ skill_id: "mine", series_id: "series", revision: 1, status: "draft", replayed: false }),
    getUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_epoch: "0", phase: "none" }),
    beginUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", transfer_reference: { url: "https://objects.example/put", method: "PUT", required_headers: { "content-type": "application/zip" }, expires_at: "2999-01-01T00:00:00Z" }, replayed: false }),
    putPackage: vi.fn().mockResolvedValue(undefined),
    completeUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", phase: "uploaded", replayed: false, content_sha256: "a".repeat(64), scan_state: "clean" }),
    validateDraft: vi.fn().mockResolvedValue({ skill_id: "mine", series_id: "series", valid: true, content_digest: "a".repeat(64), manifest_identity: `zip-v1:sha256:${"a".repeat(64)}`, replayed: false }),
    publishDraft: vi.fn().mockRejectedValue(new Error("lost ACK")),
    getPublished: vi.fn().mockRejectedValue(new HubClientError("http", "not found", "skill_not_found", 404)),
  }
  const input = { file: new File(["zip"], "mine.zip"), display_name: "Mine", summary: "", tags: [] }
  const options = { hash: async () => "a".repeat(64) }
  await expect(publishPersonalSkill(client as unknown as SkillPublishClient, input, options)).rejects.toMatchObject({ name: "SkillPublishUncertain", skillId: "mine" })
  expect(client.getPublished).toHaveBeenCalledWith("mine", undefined)
  client.getPublished.mockResolvedValueOnce({ skill_id: "mine", source_ref: "skill:mine", revision: "1", status: "active", name: "Mine", summary: "", tags: [] })
  await expect(publishPersonalSkill(client as unknown as SkillPublishClient, input, options)).resolves.toEqual({ source_ref: "skill:mine", revision: "1" })
})

it("does not start a draft after cancellation or reuse any persisted upload reference", async () => {
  const client = { createDraft: vi.fn() }
  const controller = new AbortController()
  controller.abort()
  await expect(publishPersonalSkill(client as unknown as SkillPublishClient, { file: new File(["zip"], "mine.zip"), display_name: "Mine", summary: "", tags: [] }, { signal: controller.signal, hash: async () => "a".repeat(64) })).rejects.toMatchObject({ reason: "aborted" })
  expect(client.createDraft).not.toHaveBeenCalled()
})
