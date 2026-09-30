"use client"

import { useEffect, useRef, useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import type { HubClient } from "@/hub/client"
import { createSkillPublishClient } from "@/hub/skill-publish-client"
import type { PersonalSkillPage, PublishedPersonalSkill } from "@/hub/schemas"
import { useT } from "@/i18n/context"
import { PersonalSkillPublishDialog } from "./personal-skill-publish-dialog"

type PageState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; page: PersonalSkillPage }
type DetailState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; skill: PublishedPersonalSkill } | null
const publishClient = createSkillPublishClient()

export function PersonalSkillsRead({ client, embedded = false, onOpenSettings }: {
  client: HubClient
  embedded?: boolean
  onOpenSettings?: (section: "skills", trigger: HTMLElement) => void
}) {
  const t = useT()
  const [cursor, setCursor] = useState<string | null>(null)
  const [history, setHistory] = useState<Array<string | null>>([])
  const [generation, setGeneration] = useState(0)
  const [pageState, setPageState] = useState<PageState>({ kind: "loading" })
  const [detail, setDetail] = useState<DetailState>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const detailRequest = useRef(0)

  useEffect(() => () => { detailRequest.current += 1 }, [])

  useEffect(() => {
    let current = true
    void client.listPersonalSkills(cursor ?? undefined).then(
      (page) => { if (current) setPageState({ kind: "ready", page }) },
      () => { if (current) setPageState({ kind: "error" }) },
    )
    return () => { current = false }
  }, [client, cursor, generation])

  const openDetail = (sourceRef: string) => {
    const id = sourceRef.slice("skill:".length)
    const request = ++detailRequest.current
    setDetail({ kind: "loading" })
    void client.getPublishedPersonalSkill(id).then(
      (skill) => { if (request === detailRequest.current) setDetail(skill.source_ref === sourceRef ? { kind: "ready", skill } : { kind: "error" }) },
      () => { if (request === detailRequest.current) setDetail({ kind: "error" }) },
    )
  }

  const page = pageState.kind === "ready" ? pageState.page : null
  return (
    <section className="space-y-4" data-testid="personal-skills-read">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t("skills.title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => setPublishOpen(true)}>{t("skills.publishTitle")}</Button>
          {!embedded && onOpenSettings ? <Button type="button" variant="outline" onClick={(event) => onOpenSettings("skills", event.currentTarget)}>{t("skills.mySkills")}</Button> : null}
        </div>
      </header>
      {pageState.kind === "loading" ? <div role="status" className="flex items-center gap-2"><Spinner aria-hidden="true" />{t("skills.loading")}</div> : null}
      {pageState.kind === "error" ? <Alert variant="destructive" role="alert"><AlertDescription>{t("skills.loadError")}</AlertDescription><Button type="button" variant="outline" onClick={() => { setPageState({ kind: "loading" }); setGeneration((value) => value + 1) }}>{t("skills.retry")}</Button></Alert> : null}
      {page?.skills.length === 0 ? <p className="text-muted-foreground">{t("skills.noMatch")}</p> : null}
      {page ? <div className="grid gap-3 sm:grid-cols-2" data-testid="personal-skills-grid">{page.skills.map((skill) => (
        <Card key={skill.source_ref}>
          <CardContent className="space-y-2 p-4">
            <Button type="button" variant="ghost" className="h-auto px-0 text-left font-semibold" onClick={() => openDetail(skill.source_ref)}>{skill.name}</Button>
            <p className="text-sm text-muted-foreground">{skill.description}</p>
            <p className="text-xs text-muted-foreground" data-testid="personal-skill-provenance">{skill.source_ref} · {skill.revision}</p>
          </CardContent>
        </Card>
      ))}</div> : null}
      {page ? <nav className="flex gap-2" aria-label="Skill pages">
        <Button type="button" variant="outline" disabled={history.length === 0} onClick={() => {
          const previous = history.at(-1) ?? null
          setPageState({ kind: "loading" })
          setHistory((items) => items.slice(0, -1))
          setCursor(previous)
        }}>{t("plugins.previous")}</Button>
        <Button type="button" variant="outline" disabled={!page.next_cursor} onClick={() => {
          if (!page.next_cursor) return
          setPageState({ kind: "loading" })
          setHistory((items) => [...items, cursor])
          setCursor(page.next_cursor ?? null)
        }}>{t("plugins.next")}</Button>
      </nav> : null}
      <Dialog open={detail !== null} onOpenChange={(open) => { if (!open) { detailRequest.current += 1; setDetail(null) } }}>
        <DialogContent data-testid="personal-skill-detail">
          <DialogTitle>{detail?.kind === "ready" ? detail.skill.name : t("skills.title")}</DialogTitle>
          <DialogDescription>{detail?.kind === "ready" ? detail.skill.summary : t("skills.loading")}</DialogDescription>
          {detail?.kind === "ready" ? <div className="space-y-2 text-sm">
            <p>{detail.skill.source_ref} · {detail.skill.revision}</p>
            <p>{detail.skill.status}</p>
            <p>{detail.skill.tags.join(", ")}</p>
          </div> : null}
          {detail?.kind === "error" ? <Alert variant="destructive" role="alert"><AlertDescription>{t("skills.loadError")}</AlertDescription></Alert> : null}
        </DialogContent>
      </Dialog>
      <PersonalSkillPublishDialog open={publishOpen} onOpenChange={setPublishOpen} client={publishClient} onPublished={() => { setCursor(null); setHistory([]); setPageState({ kind: "loading" }); setGeneration((value) => value + 1) }} />
    </section>
  )
}
