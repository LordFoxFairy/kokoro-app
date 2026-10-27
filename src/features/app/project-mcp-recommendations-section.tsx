"use client"

import { useLayoutEffect, useRef, useState } from "react"
import Image from "next/image"
import { Cable, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"
import type { ProjectMcpRecommendationRef } from "@/hub/project-mcp-recommendations-client"
import { McpServerIcon } from "@/ui/mcp/mcp-server-icon"
import { McpBoundIcon } from "@/ui/mcp/mcp-bound-icon"
import { providerArtwork } from "@/ui/mcp/mcp-projection-types"
import { ProjectMcpRecommendationsPicker } from "./project-mcp-recommendations-picker"
import { projectMcpRecommendationKey, type ProjectMcpRecommendationOption } from "./project-mcp-recommendation-options"
import type { ProjectMcpRecommendationsModel } from "./use-project-mcp-recommendations"
import styles from "./project-mcp-recommendations-section.module.css"

function SourceIcon({ item }: { item: ProjectMcpRecommendationOption | undefined }) {
  if (!item) return <Cable aria-hidden="true" />
  const source = item.source, initial = <span>{Array.from(item.label.trim())[0]}</span>
  if (source.kind === "provider") return <Image src={providerArtwork(source.value)} width={20} height={20} alt="" unoptimized />
  if (source.kind === "mcp_connector" && source.value.server_id)
    return <McpServerIcon serverId={source.value.server_id} mediaRevision={0} fallback={initial} />
  if (source.kind === "custom_api") return <McpBoundIcon icon={source.value.icon} alt="" fallback={initial} />
  return initial
}

/** A project configuration editor, separate from account connection management and execution selection. */
export function ProjectMcpRecommendationsSection({ model }: { model?: ProjectMcpRecommendationsModel | undefined }) {
  const t = useT(), opener = useRef<HTMLButtonElement>(null), fallbackFocus = useRef<HTMLElement>(null)
  const context = model?.context
  const [editor, setEditor] = useState<{ context: object | undefined; window: object | null; open: boolean; query: string; draft: readonly ProjectMcpRecommendationRef[]; message: "conflict" | "unconfirmed" | "limit" | null; readVersion: string | null; touched: boolean }>({ context, window: null, open: false, query: "", draft: [], message: null, readVersion: null, touched: false })
  if (editor.context !== context) setEditor({ context, window: null, open: false, query: "", draft: [], message: null, readVersion: null, touched: false })
  else if (editor.open && !editor.touched && model?.configReady && model.facts && editor.readVersion !== model.facts.state_version)
    setEditor({ ...editor, draft: [...model.facts.recommendations], readVersion: model.facts.state_version })
  const view = editor.context === context ? editor : null
  const live = useRef<typeof editor | null>(null)
  useLayoutEffect(() => { live.current = view; return () => { if (live.current === view) live.current = null } }, [view])
  const options = new Map(model?.options.map(item => [item.id, item]))
  const refs = model?.facts?.recommendations ?? []
  const label = (ref: ProjectMcpRecommendationRef) => options.get(projectMcpRecommendationKey(ref))?.label ??
    `${ref.kind === "provider" ? ref.provider_key : ref.kind === "mcp_connector" ? ref.connector_id : ref.profile_id} · ${t("projectMcp.unavailable")}`
  const message = (value: "conflict" | "unconfirmed" | "limit" | null) => value ? t(`projectMcp.${value}`) : undefined
  const open = () => {
    if (!model?.isCurrent() || model.busy) return
    if (!model.configReady || !model.directoryReady) model.refresh()
    setEditor({ context, window: {}, open: true, query: "", draft: [...refs], message: null,
      touched: false, readVersion: model.configReady ? model.facts?.state_version ?? null : null })
  }
  const save = async (draft: readonly ProjectMcpRecommendationRef[], window: object | null) => {
    if (!model?.isCurrent()) return
    setEditor(previous => previous.context === context && previous.window === window ? { ...previous, touched: true } : previous)
    const result = await model.save(draft)
    if (!model.isCurrent() || result === "retired") return
    setEditor(previous => previous.context !== context || previous.window !== window || window !== null && !previous.open ? previous
      : { ...previous, open: result === "current" ? false : previous.open,
        message: result === "current" ? null : result })
  }
  const draft = view?.draft ?? []
  const candidates = new Map(model?.options.map(item => [item.id, item.ref]))
  for (const ref of draft) candidates.set(projectMcpRecommendationKey(ref), ref)
  const query = view?.query.trim().toLocaleLowerCase() ?? ""
  const items = [...candidates].filter(([id, ref]) => !query || (options.get(id)?.search ?? label(ref).toLocaleLowerCase()).includes(query))
    .map(([id, ref]) => ({ id, label: label(ref), icon: <SourceIcon item={options.get(id)} /> }))
  const feedback = message(view?.message ?? null)
  return <section ref={fallbackFocus} tabIndex={-1} className={styles.section} aria-label={t("firstSite.connectors")}>
    <header className={styles.header}><Cable aria-hidden="true" /><span>{t("firstSite.connectors")}</span>
      <Button ref={opener} size="sm" variant="ghost" disabled={!model?.allowed || model.busy} onClick={open}>
        <Plus aria-hidden="true" />{t("firstSite.add")}</Button>
    </header>
    {refs.length ? <ul className={styles.saved}>{refs.map(ref => {
      const id = projectMcpRecommendationKey(ref), name = label(ref)
      return <li key={id}><span className={styles.icon} aria-hidden="true"><SourceIcon item={options.get(id)} /></span>
        <span className={styles.name} title={name}>{name}</span>
        <Button size="icon-xs" variant="ghost" disabled={!model?.configReady || !model.directoryReady || model.busy}
          aria-label={t("projectMcp.remove", { name })} onClick={() => void save(refs.filter(item => projectMcpRecommendationKey(item) !== id), view?.window ?? null)}><X aria-hidden="true" /></Button>
      </li>
    })}</ul> : null}
    {view?.message && !view.open ? <p className={styles.feedback} role="alert">{message(view.message)}</p> : null}
    <ProjectMcpRecommendationsPicker open={view?.open === true} items={items} query={view?.query ?? ""}
      selectedIds={draft.map(projectMcpRecommendationKey)} readReady={model?.configReady === true && model.directoryReady}
      pending={model?.busy ?? false} hasMore={false} onMore={() => undefined}
      {...(feedback ? { writeError: feedback } : {})}
      onQueryChange={query => setEditor(previous => previous.context === context ? { ...previous, query } : previous)}
      onToggle={id => setEditor(previous => {
        if (!model?.isCurrent() || previous.context !== context || !previous.open) return previous
        const selected = previous.draft.some(ref => projectMcpRecommendationKey(ref) === id)
        if (!selected && previous.draft.length >= 16) return { ...previous, message: "limit" }
        const ref = candidates.get(id)
        return ref ? { ...previous, touched: true, message: null, draft: selected ? previous.draft.filter(ref => projectMcpRecommendationKey(ref) !== id) : [...previous.draft, ref] } : previous
      })}
      onSave={() => { if (view?.open) void save(view.draft, view.window) }}
      onOpenChange={open => { if (!open) setEditor(previous => previous.context === context ? { ...previous, open: false } : previous) }}
      returnFocus={() => live.current?.context === context && live.current?.window === view?.window && model?.isCurrent()
        ? opener.current?.disabled ? fallbackFocus.current : opener.current : null}
      copy={{ title: t("projectMcp.title"), description: t("projectMcp.description"), searchPlaceholder: t("firstSite.search"),
        cancel: t("mcp.cancel"), save: t("mcp.save"), close: t("shell.closeDialog"), more: t("data.more"), empty: t("projectMcp.empty") }} />
  </section>
}
