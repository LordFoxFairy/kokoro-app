"use client"

import { useRef, useState, type ReactNode } from "react"
import { Cable, Plus, SlidersHorizontal } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useT } from "@/i18n/context"
import type { ComposerConnectionsController } from "@/ui/shell/use-composer-connections"
import { McpAvailabilityStatus } from "@/ui/mcp/mcp-availability-status"
import { McpBoundIcon } from "@/ui/mcp/mcp-bound-icon"
import type { McpIconBinding } from "@/hub/mcp-icon.schema"
import styles from "./composer-connections.module.css"

function ConnectionRow({ name, checked, disabled, icon, availability, onToggle }: {
  name: string; checked: boolean; disabled?: boolean; icon?: McpIconBinding | undefined; availability?: ReactNode; onToggle: () => void
}) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={name} title={name} disabled={disabled} className={styles.row} onClick={onToggle}>
    <span className={styles.glyph} aria-hidden="true"><McpBoundIcon icon={icon} alt="" fallback={Array.from(name)[0]} /></span>
    <span className={styles.name}>{name}</span>{availability}
    <span className={styles.switch} data-checked={checked} aria-hidden="true"><span /></span>
  </button>
}

/** Presentation only: toggles draft intent; management is a separate, explicit action. */
export function ComposerConnections({ controller, onAdd, onManage }: {
  controller: ComposerConnectionsController
  onAdd: (returnTarget: HTMLElement | null) => void
  onManage: (returnTarget: HTMLElement | null) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const openingManagement = useRef(false)
  const pointerOpening = useRef(false)
  const selectedApis = new Set((controller.selectedCustomApiProfiles ?? []).map(value => value.profileId))
  const apiItems = controller.customApiItems ?? []
  const missingApis = [...selectedApis].filter(id => !apiItems.some(item => item.id === id))
  const selected = new Set(controller.selectedIds)
  const selectedItems = [...controller.items.filter(item => selected.has(item.id)).map(item => ({ ...item, icon: undefined, selectionKey: `mcp:${item.id}` })), ...apiItems.filter(item => selectedApis.has(item.id)).map(item => ({ ...item, selectionKey: `api:${item.id}` }))]
  const selectedCount = selected.size + selectedApis.size
  const missing = controller.selectedIds.filter(id => !controller.items.some(item => item.id === id))
  const openDestination = (action: typeof onManage) => { openingManagement.current = true; setOpen(false); action(trigger.current) }
  const actions = [
    { key: "add", icon: Plus, label: t("mcp.addConnector"), action: onAdd },
    { key: "manage", icon: SlidersHorizontal, label: t("plugins.manageConnectors"), action: onManage },
  ]
  const footer = <div className={styles.footer}>
    {actions.map(({ key, icon: Icon, label, action }) => <button key={key} type="button" className={styles.row} onClick={() => openDestination(action)}><Icon aria-hidden="true" /><span>{label}</span></button>)}
  </div>
  return (
    <Popover open={open && controller.status !== "disabled"} onOpenChange={next => { setOpen(next); if (next && controller.status !== "loading") controller.refresh() }}>
      <PopoverTrigger ref={trigger} className={styles.trigger} disabled={controller.status === "disabled"} aria-label={`${t("firstSite.connectors")} (${selectedCount})`} title={t("firstSite.connectors")} data-composer-control="connections" onPointerDown={() => { pointerOpening.current = true }} onKeyDown={() => { pointerOpening.current = false }}>
        {selectedItems.length ? selectedItems.slice(0, 2).map(item => <span key={item.selectionKey} className={styles.glyph} aria-hidden="true"><McpBoundIcon icon={item.icon} alt="" fallback={Array.from(item.name)[0]} /></span>) : <Cable aria-hidden="true" />}
        {selectedCount > 2 ? <span className={styles.count} aria-hidden="true">+{selectedCount - 2}</span> : null}
      </PopoverTrigger>
      <PopoverContent onOpenAutoFocus={event => { if (pointerOpening.current) event.preventDefault() }} onCloseAutoFocus={event => { if (openingManagement.current) { event.preventDefault(); openingManagement.current = false } }} aria-label={t("firstSite.connectors")} side="top" sideOffset={8} align="start" collisionPadding={12} className={styles.panel}>
        <div className={styles.list} aria-busy={controller.status === "loading" || controller.customApiStatus === "loading"}>
          {controller.items.map(item => <ConnectionRow key={`mcp:${item.id}`} name={item.name} checked={selected.has(item.id)} disabled={!selected.has(item.id) && (!item.selectable || selected.size >= 16)} onToggle={() => controller.toggle(item.id)} availability={!item.selectable ? <McpAvailabilityStatus availability={item.availability === "available" ? "unavailable" : item.availability} className={styles.availability} /> : null} />)}
          {apiItems.map(item => <ConnectionRow key={`api:${item.id}`} name={item.name} icon={item.icon} checked={selectedApis.has(item.id)} disabled={!selectedApis.has(item.id) && (item.selectable === false || selectedApis.size >= 32)} onToggle={() => controller.toggleCustomApi?.(item.id)} />)}
          {missingApis.map(id => <ConnectionRow key={`api:${id}`} name={id} checked onToggle={() => controller.toggleCustomApi?.(id)} />)}
          {missing.map(id => <button type="button" role="switch" aria-checked="true" aria-label={id} className={styles.row} key={`mcp:${id}`} onClick={() => controller.toggle(id)}><Cable aria-hidden="true" /><span className={styles.name}>{id}</span><span className={styles.switch} data-checked="true" aria-hidden="true"><span /></span></button>)}
          {(controller.status === "loading" || controller.customApiStatus === "loading") && controller.items.length === 0 && apiItems.length === 0 ? <span className="sr-only" role="status">{t("mcp.loading")}</span> : null}
          {controller.status === "ready" && controller.items.length === 0 && !missing.length && apiItems.length === 0 && !missingApis.length && (controller.customApiStatus === undefined || controller.customApiStatus === "ready" || controller.customApiStatus === "disabled") ? <p className={styles.empty}>{t("firstSite.noConnectors")}</p> : null}
          {(controller.status === "error" || controller.customApiStatus === "error") ? <span className="sr-only" role="status">{t("mcp.loadError")}</span> : null}
          {((controller.nextCursor && controller.status === "ready") || (controller.customApiNextCursor && controller.customApiStatus === "ready")) ? <button type="button" className={styles.row} onClick={controller.loadMore}>{t("data.more")}</button> : null}
        </div>
        {footer}
      </PopoverContent>
    </Popover>
  )
}
