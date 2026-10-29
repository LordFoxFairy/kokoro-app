"use client"

import { useCallback, useRef, useState } from "react"
import { Cable, Plus, SlidersHorizontal } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useT } from "@/i18n/context"
import type { ComposerConnectionsController } from "@/ui/shell/use-composer-connections"
import { McpAvailabilityStatus } from "@/ui/mcp/mcp-availability-status"
import styles from "./composer-connections.module.css"

/** Presentation only: toggles draft intent; management is a separate, explicit action. */
export function ComposerConnections({ controller, onAdd, onManage }: {
  controller: ComposerConnectionsController
  onAdd: (returnTarget: HTMLElement | null) => void
  onManage: (returnTarget: HTMLElement | null) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState("top")
  // Follow Radix's resolved collision placement; DOM order matches visual and
  // keyboard order, including when the panel flips below the composer.
  const observePlacement = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const read = () => setSide(node.dataset.side ?? "top")
    read()
    const observer = new MutationObserver(read)
    observer.observe(node, { attributes: true, attributeFilter: ["data-side"] })
    return () => observer.disconnect()
  }, [])
  const trigger = useRef<HTMLButtonElement>(null)
  const openingManagement = useRef(false)
  const pointerOpening = useRef(false)
  const selected = new Set(controller.selectedIds)
  const selectedItems = controller.items.filter(item => selected.has(item.id))
  const missing = controller.selectedIds.filter(id => !controller.items.some(item => item.id === id))
  const openDestination = (action: typeof onManage) => { openingManagement.current = true; setOpen(false); action(trigger.current) }
  const actions = [
    { key: "add", icon: Plus, label: t("mcp.addConnector"), action: onAdd },
    { key: "manage", icon: SlidersHorizontal, label: t("plugins.manageConnectors"), action: onManage },
  ]
  if (side === "top") actions.reverse()
  const footer = <div className={styles.footer}>
    {actions.map(({ key, icon: Icon, label, action }) => <button key={key} type="button" className={styles.row} onClick={() => openDestination(action)}><Icon aria-hidden="true" /><span>{label}</span></button>)}
  </div>
  return (
    <Popover open={open && controller.status !== "disabled"} onOpenChange={next => { setOpen(next); if (next && controller.status !== "loading") controller.refresh() }}>
      <PopoverTrigger ref={trigger} className={styles.trigger} disabled={controller.status === "disabled"} aria-label={`${t("firstSite.connectors")} (${selected.size})`} title={t("firstSite.connectors")} data-composer-control="connections" onPointerDown={() => { pointerOpening.current = true }} onKeyDown={() => { pointerOpening.current = false }}>
        {selectedItems.length ? selectedItems.slice(0, 2).map(item => <span key={item.id} className={styles.glyph} aria-hidden="true">{Array.from(item.name)[0]}</span>) : <Cable aria-hidden="true" />}
        {selected.size > 2 ? <span className={styles.count} aria-hidden="true">+{selected.size - 2}</span> : null}
      </PopoverTrigger>
      <PopoverContent ref={observePlacement} onOpenAutoFocus={event => { if (pointerOpening.current) event.preventDefault() }} onCloseAutoFocus={event => { if (openingManagement.current) { event.preventDefault(); openingManagement.current = false } }} aria-label={t("firstSite.connectors")} side="top" sideOffset={8} align="start" collisionPadding={12} className={styles.panel}>
        {side === "top" ? footer : null}
        <div className={styles.list} aria-busy={controller.status === "loading"}>
          {controller.items.map(item => <button type="button" role="switch" aria-checked={selected.has(item.id)} aria-label={item.name} title={item.name} disabled={!selected.has(item.id) && (!item.selectable || selected.size >= 16)} className={styles.row} key={item.id} onClick={() => controller.toggle(item.id)}>
            <span className={styles.glyph} aria-hidden="true">{Array.from(item.name)[0]}</span>
            <span className={styles.name}>{item.name}</span>
            {!item.selectable ? <McpAvailabilityStatus availability={item.availability === "available" ? "unavailable" : item.availability} className={styles.availability} /> : null}
            <span className={styles.switch} data-checked={selected.has(item.id)} aria-hidden="true"><span /></span>
          </button>)}
          {missing.map(id => <button type="button" role="switch" aria-checked="true" aria-label={id} className={styles.row} key={id} onClick={() => controller.toggle(id)}><Cable aria-hidden="true" /><span className={styles.name}>{id}</span><span className={styles.switch} data-checked="true" aria-hidden="true"><span /></span></button>)}
          {controller.status === "loading" && controller.items.length === 0 ? <span className="sr-only" role="status">{t("mcp.loading")}</span> : null}
          {controller.status === "ready" && controller.items.length === 0 && !missing.length ? <p className={styles.empty}>{t("firstSite.noConnectors")}</p> : null}
          {controller.status === "error" ? <span className="sr-only" role="status">{t("mcp.loadError")}</span> : null}
          {controller.nextCursor && controller.status === "ready" ? <button type="button" className={styles.row} onClick={controller.loadMore}>{t("data.more")}</button> : null}
        </div>
        {side !== "top" ? footer : null}
      </PopoverContent>
    </Popover>
  )
}
