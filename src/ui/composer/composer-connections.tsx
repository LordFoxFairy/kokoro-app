"use client"

import { useRef, useState } from "react"
import { Cable, Plus, RefreshCw, SlidersHorizontal } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useT } from "@/i18n/context"
import type { ComposerConnectionsController } from "@/ui/shell/use-composer-connections"
import { McpAvailabilityStatus } from "@/ui/mcp/mcp-availability-status"
import styles from "./composer-connections.module.css"

/** Presentation only: toggles draft intent; management is a separate, explicit action. */
export function ComposerConnections({ controller, onManage }: {
  controller: ComposerConnectionsController
  onManage: (returnTarget: HTMLElement | null) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const openingManagement = useRef(false)
  const selected = new Set(controller.selectedIds)
  const selectedItems = controller.items.filter(item => selected.has(item.id))
  const missing = controller.selectedIds.filter(id => !controller.items.some(item => item.id === id))
  const manage = () => { openingManagement.current = true; setOpen(false); onManage(trigger.current) }
  return (
    <Popover open={open && controller.status !== "disabled"} onOpenChange={next => { setOpen(next); if (next && controller.status !== "loading") controller.refresh() }}>
      <PopoverTrigger ref={trigger} className={styles.trigger} disabled={controller.status === "disabled"} aria-label={`${t("firstSite.connectors")} (${selected.size})`} title={t("firstSite.connectors")} data-composer-control="connections">
        {selectedItems.length ? selectedItems.slice(0, 2).map(item => <span key={item.id} className={styles.glyph} aria-hidden="true">{Array.from(item.name)[0]}</span>) : <Cable aria-hidden="true" />}
        {selected.size > 2 ? <span className={styles.count} aria-hidden="true">+{selected.size - 2}</span> : null}
      </PopoverTrigger>
      <PopoverContent onCloseAutoFocus={event => { if (openingManagement.current) { event.preventDefault(); openingManagement.current = false } }} aria-label={t("firstSite.connectors")} side="top" sideOffset={8} align="start" collisionPadding={12} className={styles.panel}>
        <div className={styles.list} aria-busy={controller.status === "loading"}>
          {controller.items.map(item => <button type="button" role="switch" aria-checked={selected.has(item.id)} aria-label={item.name} title={item.name} disabled={!selected.has(item.id) && (!item.selectable || selected.size >= 16)} className={styles.row} key={item.id} onClick={() => controller.toggle(item.id)}>
            <span className={styles.glyph} aria-hidden="true">{Array.from(item.name)[0]}</span>
            <span className={styles.name}>{item.name}</span>
            {!item.selectable ? <McpAvailabilityStatus availability={item.availability === "available" ? "unavailable" : item.availability} className={styles.availability} /> : null}
            <span className={styles.switch} data-checked={selected.has(item.id)} aria-hidden="true"><span /></span>
          </button>)}
          {missing.map(id => <button type="button" role="switch" aria-checked="true" aria-label={id} className={styles.row} key={id} onClick={() => controller.toggle(id)}><Cable aria-hidden="true" /><span className={styles.name}>{id}</span><span className={styles.switch} data-checked="true" aria-hidden="true"><span /></span></button>)}
          {controller.status === "loading" && controller.items.length === 0 ? <div className={styles.placeholder} aria-hidden="true"><span /><span /><span /></div> : null}
          {controller.status === "ready" && controller.items.length === 0 && !missing.length ? <p className={styles.empty}>{t("firstSite.noConnectors")}</p> : null}
          {controller.status === "error" ? <div className={styles.feedback} role="status"><span>{t("mcp.loadError")}</span><button type="button" onClick={controller.nextCursor ? controller.loadMore : controller.refresh}>{t("mcp.retry")}</button></div> : null}
          {controller.nextCursor && controller.status === "ready" ? <button type="button" className={styles.row} onClick={controller.loadMore}>{t("data.more")}</button> : null}
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.row} onClick={manage}><Plus aria-hidden="true" /><span>{t("mcp.addConnector")}</span></button>
          <div className={styles.management}><button type="button" className={styles.row} onClick={manage}><SlidersHorizontal aria-hidden="true" /><span>{t("plugins.manageConnectors")}</span></button><button type="button" className={styles.refresh} aria-label={t("billing.retry")} onClick={controller.refresh} disabled={controller.status === "loading"}><RefreshCw aria-hidden="true" /></button></div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
