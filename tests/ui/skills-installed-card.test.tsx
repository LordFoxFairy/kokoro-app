import { afterEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { LocaleProvider } from "@/i18n/context"
import { InstalledSkillCard } from "@/ui/skills/skills-installed-card"

afterEach(cleanup)

it("a withdrawn installed version can be inspected or updated, not enabled, while disabling still works", () => {
  const onEnabledChange = vi.fn(), onUpdate = vi.fn(), onOpenDetail = vi.fn()
  const props = {
    skill: { name: "Pinned old version", description: "Original package", scope: "personal", content_hash: "series", source_status: "withdrawn" as const, available_update: { source_ref: "skill:new", revision: "5" } },
    enabled: false, busy: false, pending: false, locked: false, error: null, detailAvailable: true,
    onEnabledChange, onUpdate, onOpenDetail,
  }
  const view = render(<LocaleProvider><InstalledSkillCard {...props} /></LocaleProvider>)
  expect(screen.getByRole("switch")).toBeDisabled()
  expect(screen.getByText("This skill version is currently unavailable.")).toBeVisible()
  fireEvent.click(screen.getByRole("switch"))
  expect(onEnabledChange).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Pinned old version" }))
  expect(onOpenDetail).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole("button", { name: /Update to v5/ }))
  expect(onUpdate).toHaveBeenCalledOnce()
  view.rerender(<LocaleProvider><InstalledSkillCard {...props} enabled /></LocaleProvider>)
  expect(screen.getByRole("switch")).toBeEnabled()
  fireEvent.click(screen.getByRole("switch"))
  expect(onEnabledChange).toHaveBeenCalledWith(false)
})

it("retains a deleted installation but blocks details, enabling and update", () => {
 const onOpenDetail=vi.fn(),onEnabledChange=vi.fn(),onUpdate=vi.fn()
 render(<LocaleProvider><InstalledSkillCard skill={{name:"Deleted",content_hash:"series",scope:"personal",description:"",source_status:"deleted",available_update:{source_ref:"skill:new",revision:"5"}}} enabled={false} busy={false} pending={false} locked={false} error={null} detailAvailable onOpenDetail={onOpenDetail} onEnabledChange={onEnabledChange} onUpdate={onUpdate}/></LocaleProvider>)
 expect(screen.getByRole("button",{name:"Deleted"})).toBeDisabled()
 expect(screen.getByRole("switch")).toBeDisabled()
 expect(screen.getByRole("button",{name:/Update to v5/})).toBeDisabled()
})
