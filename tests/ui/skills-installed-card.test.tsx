import { afterEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { LocaleProvider, useLocale } from "@/i18n/context"
import { LOCALES, type Locale } from "@/i18n/messages"
import { resolveMessage } from "@/i18n/resolve"
import { OVERLAYS } from "@/i18n/overlays"
import { SkillsContent } from "@/ui/skills/skills-panel"
import { SkillCatalogDialog } from "@/ui/skills/skills-catalog-dialog"
import { createPreviewHubClient } from "@/dev/preview-clients"
import { InstalledSkillCard } from "@/ui/skills/skills-installed-card"

afterEach(() => { cleanup(); window.localStorage.removeItem("kokoro.locale") })

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

const timestamp = Date.parse("2026-11-12T00:30:00Z")
const localeCases = [
  { locale: "en", labels: ["All", "Personal", "Official", "Third-party"], updated: "Updated November 12, 2026" },
  { locale: "zh", labels: ["全部", "个人", "官方", "第三方"], updated: "更新于 2026年11月12日" },
  { locale: "de", labels: ["alle", "Persönlich", "offiziell", "Drittanbieter"], updated: "Aktualisiert am 12. November 2026" },
] satisfies { locale: Locale; labels: string[]; updated: string }[]

function ChangeSkillLocale() {
  const { setLocale } = useLocale()
  return <button onClick={() => setLocale("de")}>Change Skill locale</button>
}

it.each(localeCases)("Settings Skills source filters use the existing $locale translations without Chinese fallback", async ({ locale, labels }) => {
  window.localStorage.setItem("kokoro.locale", locale)
  const client = createPreviewHubClient()
  render(<LocaleProvider><SkillsContent readBoundary={{ admitted: false, subject: null, generation: 0 }} client={client} preview embedded pinned={[]} onTogglePin={vi.fn()} /></LocaleProvider>)
  for (const name of labels) expect(await screen.findByRole("radio", { name })).toHaveTextContent(name)
})

it("the two source filter keys have explicit entries in all nine existing locales", () => {
  for (const key of ["skills.filterPersonal", "skills.filterThirdParty"] as const) {
    for (const locale of LOCALES) {
      expect(resolveMessage(locale, key).trim()).not.toBe("")
      if (locale !== "zh") expect(OVERLAYS[locale][key], `${locale}:${key}`).toBeTruthy()
    }
  }
})

it.each(localeCases)("installed cards format Unix seconds in the active $locale and react to an explicit locale change", ({ locale, updated }) => {
  window.localStorage.setItem("kokoro.locale", locale)
  render(<LocaleProvider><InstalledSkillCard skill={{ name: "Localized date", description: "Owner timestamp", scope: "official", content_hash: "localized-date", updated_at: timestamp / 1000 }}
    enabled busy={false} pending={false} locked={false} error={null} detailAvailable onOpenDetail={vi.fn()} onEnabledChange={vi.fn()} onUpdate={vi.fn()} /><ChangeSkillLocale /></LocaleProvider>)
  expect(screen.getByText(updated)).toBeVisible()
  fireEvent.click(screen.getByRole("button", { name: "Change Skill locale" }))
  expect(screen.getByText(localeCases[2]!.updated)).toBeVisible()
})

it.each(localeCases)("the Settings catalog formats legacy millisecond timestamps in $locale without changing catalog actions", async ({ locale, updated }) => {
  window.localStorage.setItem("kokoro.locale", locale)
  const base = createPreviewHubClient(), catalog = await base.listSkillCatalog(), first = catalog.skills[0]
  if (!first) throw Error("catalog fixture required")
  const client = { ...base, listSkillCatalog: vi.fn(async () => ({ ...catalog, skills: [{ ...first, updated_at: timestamp }] })) }
  const action = vi.fn()
  render(<LocaleProvider><SkillCatalogDialog open inline client={client} enabledOverrides={new Map()} installedOverrides={new Map()} busy={null} errorName={null}
    onOpenChange={action} onCloseAutoFocus={action} onOpenUpload={action} onOpenGithub={action} onSetEnabled={action} onOpenDetail={action} /></LocaleProvider>)
  expect(await screen.findByText(updated)).toBeVisible()
  expect(action).not.toHaveBeenCalled()
})
