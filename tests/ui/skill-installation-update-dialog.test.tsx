import { useRef, useSyncExternalStore } from "react"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { HubClientError, type SkillInstallationClient } from "@/hub/client"
import type { PersonalInstallation } from "@/hub/schemas"
import { LocaleProvider } from "@/i18n/context"
import { createSkillInstallationUpdateFlow, type SkillInstallationUpdateFlow } from "@/ui/skills/skill-installation-update-flow"
import { SkillInstallationUpdateDialog } from "@/ui/skills/skill-installation-update-dialog"

const boundary = { admitted: true, subject: "actor", generation: 1 }
beforeEach(() => window.localStorage.setItem("kokoro.locale", "zh"))
afterEach(cleanup)

function UpdateDialog({ flow, onAbandoned, onOpenChange }: {
  flow: SkillInstallationUpdateFlow
  onAbandoned: () => void
  onOpenChange: (open: boolean) => void
}) {
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot)
  const focus = useRef<HTMLElement | null>(null)
  return <LocaleProvider><SkillInstallationUpdateDialog flow={flow} boundary={boundary} state={state}
    admitted open onOpenChange={onOpenChange} onAbandoned={onAbandoned}
    returnFocusRef={focus} fallbackFocusRef={focus} /></LocaleProvider>
}

it("stopping an unknown update requires explicit confirmation, while cancelling preserves the original request", async () => {
  const installation: PersonalInstallation = {
    installation_id: "installation", series_id: "series", source_ref: "skill:a", revision: "1",
    installed: true, enabled: false, source_status: "active", display_name: "Pinned", summary: "Exact installation",
    installed_at: "2026-10-17T00:00:00Z", updated_at: "2026-10-17T00:00:00Z", skill_updated_at: "2026-10-17T00:00:00Z",
    tags: [], category_keys: [], example_prompts: [], product: { publication_audience: "owner", state_version: "1" },
    available_update: { source_ref: "skill:b", revision: "2" },
  }
  const get = vi.fn<SkillInstallationClient["get"]>().mockResolvedValue(installation)
  const update = vi.fn<SkillInstallationClient["update"]>().mockRejectedValue(new HubClientError("network", "lost ACK", null, null))
  const flow = createSkillInstallationUpdateFlow({ client: { get, update }, boundary, key: () => "original-key" })
  flow.select({ installation_id: installation.installation_id, skill_id: installation.series_id,
    source_ref: installation.source_ref, installed_source_ref: installation.source_ref,
    available_update: installation.available_update!, name: installation.display_name,
    description: installation.summary, scope: "personal", content_hash: installation.series_id }, boundary)
  await flow.readCurrent(boundary)
  await flow.confirm(boundary)
  const unknown = flow.getSnapshot()
  const onAbandoned = vi.fn(), onOpenChange = vi.fn()
  render(<UpdateDialog flow={flow} onAbandoned={onAbandoned} onOpenChange={onOpenChange} />)
  fireEvent.click(screen.getByRole("button", { name: "停止等待" }))
  const confirmation = screen.getByRole("alertdialog", { name: "停止等待此次更新？" })
  expect(confirmation).toHaveTextContent("不会撤销已提交的更新")
  expect(onAbandoned).not.toHaveBeenCalled()
  fireEvent.click(within(confirmation).getByRole("button", { name: "取消" }))
  expect(flow.getSnapshot()).toBe(unknown)
  expect(onAbandoned).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "停止等待" }))
  fireEvent.click(within(screen.getByRole("alertdialog", { name: "停止等待此次更新？" })).getByRole("button", { name: "停止等待" }))
  expect(flow.getSnapshot()).toEqual({ kind: "idle", acknowledged: false })
  expect(onAbandoned).toHaveBeenCalledOnce()
  expect(onOpenChange).toHaveBeenCalledWith(false)
  expect(get).toHaveBeenCalledTimes(1)
  expect(update).toHaveBeenCalledTimes(1)
})
