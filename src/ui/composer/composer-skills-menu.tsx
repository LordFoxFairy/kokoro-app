"use client"

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"
import { ChevronLeft, ChevronRight, Plus, Puzzle, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { HubClient } from "@/hub/client"
import type { SkillCard } from "@/hub/schemas"
import { useT } from "@/i18n/context"
import { useResource } from "@/lib/query"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { skillTrialSourceRef } from "@/ui/skills/skills-card-model"
import type { SkillsPool } from "@/ui/skills/skills-pool-model"
import { skillResourceKey, SKILLS_KEY } from "@/ui/skills/skills-resource-cache"
import styles from "./composer-skills-menu.module.css"

export type ComposerSkills = Readonly<{
  client: HubClient
  boundary: ProjectReadBoundary
  scopeKey: string | object
  selectable?: boolean
  onSelect: (skill: SkillCard) => boolean
}>
const route = () => `${window.location.pathname}${window.location.search}${window.location.hash}`
function markerMatches(subject: string | null): boolean {
  try { return subject !== null && window.localStorage.getItem("kokoro.web.auth-index-subject") === subject }
  catch { return false }
}

function InstalledSkills({ client, canAct, onSelect, onManage, onAdd }: {
  client: HubClient; canAct: () => boolean; onSelect: (skill: SkillCard) => void; onManage: () => void; onAdd: () => void
}) {
  const t = useT()
  const [query, setQuery] = useState("")
  const pool = useResource<SkillsPool>(skillResourceKey(SKILLS_KEY, client), useCallback(async () => {
    const [skills, quota] = await Promise.all([client.listSkillPool(), client.skillQuota().catch(() => null)])
    return { skills, quota }
  }, [client]))
  const ready = !pool.loading && pool.error === undefined
  const skills = (pool.data?.skills ?? []).filter(skill => skillTrialSourceRef(skill) !== null)
  return <>
    <Command className={styles.command} label={t("skills.searchPlaceholder")}>
      <CommandInput autoFocus aria-label={t("skills.searchPlaceholder")} placeholder={t("skills.searchPlaceholder")} value={query} onValueChange={setQuery} />
      <CommandList className={styles.list} aria-busy={pool.loading}>
        {pool.loading ? <p className={styles.feedback} role="status">{t("skills.loading")}</p> : null}
        {pool.error !== undefined ? <div className={styles.feedback} role="alert"><p>{t("skills.loadError")}</p><Button variant="ghost" size="sm" onClick={() => { if (canAct()) pool.refetch() }}>{t("skills.retry")}</Button></div> : null}
        {ready ? <>
          <CommandEmpty className={styles.feedback}>{query ? t("skills.noMatch") : t("firstSite.noSkills")}</CommandEmpty>
          {skills.map(skill => <CommandItem className={styles.option} key={skill.source_ref} value={skill.source_ref!} keywords={[skill.name, skill.description]} onSelect={() => { if (canAct()) onSelect(skill) }}>
            <Puzzle aria-hidden="true" />
            <span className={styles.copy}><span className={styles.name}>{skill.name}</span><span className={styles.summary}>{skill.description}</span></span>
          </CommandItem>)}
        </> : null}
      </CommandList>
    </Command>
    <div className={styles.footer}>
      <button type="button" className={styles.row} onClick={onAdd}><Plus aria-hidden="true" />{t("skills.add")}</button>
      <button type="button" className={styles.row} onClick={onManage}><SlidersHorizontal aria-hidden="true" />{t("firstSite.manageSkills")}</button>
    </div>
  </>
}

/** A single picker for both the resources button and a typed slash. It reads
 * existing installed metadata; the shell owns the exact draft selection. */
export function ComposerSkillsMenu({ skills, enabled, open, openFromSlash, onOpenChange, onSelect, onManage, onAdd, triggerRef, onCloseAutoFocus }: {
  skills: ComposerSkills | undefined
  enabled: boolean
  open: boolean
  openFromSlash: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (skill: SkillCard) => boolean
  onManage: () => void
  onAdd: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
  onCloseAutoFocus: (event: Event) => void
}) {
  const t = useT()
  const [page, setPage] = useState<"root" | "skills">("root")
  const [routeEpoch, setRouteEpoch] = useState(0)
  const subject = skills?.boundary.subject ?? null
  const admitted = skills?.boundary.admitted === true
  const scope = useMemo(() => ({ client: skills?.client, key: skills?.scopeKey, admitted, subject, generation: skills?.boundary.generation }), [skills?.client, skills?.scopeKey, admitted, subject, skills?.boundary.generation])
  const live = useRef<{ scope: typeof scope; route: string; epoch: number; active: boolean } | null>(null)
  const actorRetiredScope = useRef<typeof scope | null>(null)
  const managing = useRef(false)
  const available = enabled && admitted && subject !== null && skills !== undefined
  const canAct = () => live.current?.scope === scope && live.current.epoch === routeEpoch && live.current.active && live.current.route === route() && markerMatches(subject)
  const changeOpen = (next: boolean) => {
    setPage("root")
    if (!next || (available && canAct())) onOpenChange(next)
  }
  useLayoutEffect(() => {
    const owner = { scope, route: route(), epoch: routeEpoch, active: actorRetiredScope.current !== scope }
    live.current = owner
    const retire = () => {
      const moved = owner.route !== route()
      const sameActor = markerMatches(subject)
      if (!moved && sameActor) return
      if (!sameActor) actorRetiredScope.current = scope
      owner.active = false
      onOpenChange(false)
      if (moved) setRouteEpoch(epoch => epoch + 1)
    }
    window.addEventListener("storage", retire)
    window.addEventListener("popstate", retire)
    window.addEventListener("kokoro:surface-navigation", retire)
    return () => {
      owner.active = false
      if (live.current === owner) live.current = null
      window.removeEventListener("storage", retire)
      window.removeEventListener("popstate", retire)
      window.removeEventListener("kokoro:surface-navigation", retire)
    }
  }, [scope, subject, onOpenChange, routeEpoch])
  const manage = (action: () => void) => {
    if (!canAct()) return
    managing.current = true
    changeOpen(false)
    action()
  }
  return <Popover open={open && available} onOpenChange={changeOpen}>
    <PopoverTrigger asChild>
      <Button ref={triggerRef} type="button" variant="ghost" size="icon-sm" disabled={!available} aria-label={t("firstSite.filesAndResources")} title={t("firstSite.filesAndResources")}><Plus aria-hidden="true" /></Button>
    </PopoverTrigger>
    <PopoverContent className={styles.panel} data-skills-page={page} side="top" sideOffset={8} align="start" collisionPadding={12} aria-label={t("firstSite.filesAndResources")} onOpenAutoFocus={event => {
      // A slash is a suggestion while the user is still typing, unlike the
      // explicit + action. Only an explicit submenu choice moves editor focus.
      if (openFromSlash) event.preventDefault()
    }} onCloseAutoFocus={event => {
      if (managing.current) { event.preventDefault(); managing.current = false }
      else if (open || live.current?.scope !== scope || live.current.epoch !== routeEpoch || !live.current.active) event.preventDefault()
      else onCloseAutoFocus(event)
    }}>
      <div className={styles.root}>
        <button type="button" className={styles.row} aria-expanded={page === "skills"} onClick={() => { if (canAct()) setPage("skills") }} onKeyDown={event => { if (event.key === "ArrowRight" && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && canAct()) { event.preventDefault(); setPage("skills") } }}><Puzzle aria-hidden="true" />{t("rail.navSkills")}<ChevronRight className={styles.chevron} aria-hidden="true" /></button>
      </div>
      {page === "skills" && skills ? <div className={styles.picker}>
        <button type="button" className={`${styles.row} ${styles.back}`} onClick={() => setPage("root")}><ChevronLeft aria-hidden="true" />{t("rail.navSkills")}</button>
        <InstalledSkills client={skills.client} canAct={canAct} onSelect={skill => { if (onSelect(skill)) changeOpen(false) }} onManage={() => manage(onManage)} onAdd={() => manage(onAdd)} />
      </div> : null}
    </PopoverContent>
  </Popover>
}
