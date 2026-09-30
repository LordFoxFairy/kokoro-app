import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import type { SkillPublishClient } from "@/hub/skill-publish-client"
import { PersonalSkillPublishDialog } from "@/ui/skills/personal-skill-publish-dialog"

beforeEach(() => { window.localStorage.clear(); window.localStorage.setItem("kokoro.locale", "zh") })
afterEach(cleanup)

it("keeps one pending scan attempt and its original ZIP across close/reopen, then resumes without a second Draft", async () => {
  const sha = "a".repeat(64)
  const client = {
    createDraft: vi.fn().mockResolvedValue({ skill_id: "mine", series_id: "series", revision: 1, status: "draft", replayed: false }),
    getUpload: vi.fn().mockResolvedValueOnce({ skill_id: "mine", attempt_epoch: "0", phase: "none" }).mockResolvedValue({ skill_id: "mine", attempt_epoch: "1", phase: "uploaded", attempt_id: "attempt", upload_id: "upload" }),
    beginUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", transfer_reference: { url: "https://objects.example/put", method: "PUT", required_headers: { "content-type": "application/zip" }, expires_at: "2999-01-01T00:00:00Z" }, replayed: false }),
    putPackage: vi.fn().mockResolvedValue(undefined),
    completeUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", phase: "uploaded", replayed: false, content_sha256: sha, scan_state: "pending" }),
    validateDraft: vi.fn().mockResolvedValue({ skill_id: "mine", series_id: "series", valid: true, content_digest: sha, manifest_identity: `zip-v1:sha256:${sha}`, replayed: false }),
    publishDraft: vi.fn().mockResolvedValue({ source_ref: "skill:mine", revision: "1", status: "active", event_id: "550e8400-e29b-41d4-a716-446655440000", replayed: false }),
    getPublished: vi.fn(),
  }
  const onPublished = vi.fn()
  function Harness() {
    const [open, setOpen] = useState(true)
    return <LocaleProvider><button type="button" onClick={() => setOpen(true)}>重新打开</button><PersonalSkillPublishDialog open={open} onOpenChange={setOpen} client={client as unknown as SkillPublishClient} onPublished={onPublished} hash={async () => sha} /></LocaleProvider>
  }
  render(<Harness />)
  const dialog = await screen.findByTestId("personal-skill-publish-dialog")
  fireEvent.change(within(dialog).getByLabelText(/ZIP 文件/), { target: { files: [new File(["zip"], "mine.zip", { type: "application/zip" })] } })
  fireEvent.change(within(dialog).getByLabelText("技能名称"), { target: { value: "Mine" } })
  fireEvent.submit(dialog.querySelector("form")!)
  expect(await within(dialog).findByText(/上传正在扫描中/)).toBeInTheDocument()
  expect(onPublished).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getAllByRole("button", { name: "关闭" }).at(-1)!)
  fireEvent.click(screen.getByRole("button", { name: "重新打开" }))
  const reopened = await screen.findByTestId("personal-skill-publish-dialog")
  expect(within(reopened).getByText("mine.zip")).toBeInTheDocument()
  fireEvent.submit(reopened.querySelector("form")!)
  await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1))
  expect(client.createDraft).toHaveBeenCalledTimes(1)
  expect(client.beginUpload).toHaveBeenCalledTimes(1)
  expect(client.completeUpload).toHaveBeenCalledTimes(1)
  expect(client.publishDraft).toHaveBeenCalledTimes(1)
})

it.each([
  [" a.zip", "", /ZIP 文件名不符合要求/],
  ["mine.zip", "S".repeat(65535), /请求总量超过 65,536 字节/],
] as const)("shows an editable local preflight error for %s without creating a Draft", (filename, summary, message) => {
  const createDraft = vi.fn()
  render(<LocaleProvider><PersonalSkillPublishDialog open onOpenChange={vi.fn()} client={{ createDraft } as unknown as SkillPublishClient} onPublished={vi.fn()} /></LocaleProvider>)
  const dialog = screen.getByTestId("personal-skill-publish-dialog")
  fireEvent.change(within(dialog).getByLabelText(/ZIP 文件/), { target: { files: [new File(["zip"], filename, { type: "application/zip" })] } })
  fireEvent.change(within(dialog).getByLabelText("技能名称"), { target: { value: "Mine" } })
  fireEvent.change(within(dialog).getByLabelText("简介"), { target: { value: summary } })
  fireEvent.submit(dialog.querySelector("form")!)
  expect(within(dialog).getByRole("alert")).toHaveTextContent(message)
  expect(within(dialog).getByLabelText(/ZIP 文件/)).not.toBeDisabled()
  expect(createDraft).not.toHaveBeenCalled()
})
