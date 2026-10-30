"use client"

import { useId, useRef, type ReactNode } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import styles from "./project-mcp-recommendations-picker.module.css"

export type ProjectMcpRecommendationsPickerProps = {
  open: boolean
  items: readonly { id: string; label: string; icon?: ReactNode }[]
  query: string
  selectedIds: readonly string[]
  readReady: boolean
  pending: boolean
  hasMore: boolean
  writeError?: string
  onQueryChange: (query: string) => void
  onToggle: (id: string) => void
  onSave: () => void
  onOpenChange: (open: boolean) => void
  onMore: () => void
  /** Resolve at close, returning null once the parent's project/subject/window is retired. */
  returnFocus: () => HTMLElement | null
  copy: {
    title: string
    description: string
    searchPlaceholder: string
    cancel: string
    save: string
    close: string
    more: string
    empty: string
  }
}

/** Controlled presentation only; the parent owns source identity, reads and every saved intent. */
export function ProjectMcpRecommendationsPicker({
  open, items, query, selectedIds, readReady, pending, hasMore, writeError,
  onQueryChange, onToggle, onSave, onOpenChange, onMore, returnFocus, copy,
}: ProjectMcpRecommendationsPickerProps) {
  const prefix = useId()
  const panel = useRef<HTMLDivElement>(null)
  const locked = pending || !readReady
  const selected = new Set(selectedIds)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={panel} className={styles.dialog} {...(styles.overlay ? { overlayClassName: styles.overlay } : {})} closeLabel={copy.close} aria-busy={locked}
        onOpenAutoFocus={event => {
          event.preventDefault()
          panel.current?.focus({ preventScroll: true })
        }}
        onCloseAutoFocus={event => {
          // No DialogTrigger owns this controlled surface. Never let Radix return to body,
          // or infer a still-valid project from the DOM presence of an old opener.
          event.preventDefault()
          const target = returnFocus()
          if (!target?.isConnected || target.matches(":disabled, [aria-disabled='true']") ||
            target.closest("[hidden], [inert], [aria-hidden='true']")) return
          for (let node: HTMLElement | null = target; node; node = node.parentElement) {
            const style = window.getComputedStyle(node)
            if (style.display === "none" || style.visibility === "hidden" ||
              style.visibility === "collapse" || style.contentVisibility === "hidden" || style.opacity === "0") return
          }
          target.focus({ preventScroll: true })
        }}>
        <header className={styles.header}>
          <DialogTitle className={styles.title}>{copy.title}</DialogTitle>
          <DialogDescription className={styles.description}>{copy.description}</DialogDescription>
        </header>
        <div className={styles.search}>
          <Search aria-hidden="true" />
          <Input aria-label={copy.searchPlaceholder} placeholder={copy.searchPlaceholder}
            value={query} disabled={pending} onChange={event => onQueryChange(event.target.value)} />
        </div>
        <div className={styles.list}>
          {items.map((item, index) => (
            <label className={styles.row} key={item.id} htmlFor={`${prefix}-${index}`}>
              <span className={styles.icon} aria-hidden="true">{item.icon}</span>
              <span className={styles.name} title={item.label}>{item.label}</span>
              <Checkbox id={`${prefix}-${index}`} aria-label={item.label} checked={selected.has(item.id)}
                disabled={locked} className={styles.checkbox}
                onCheckedChange={() => { if (!locked) onToggle(item.id) }} />
            </label>
          ))}
          {readReady && !pending && items.length === 0 && !hasMore
            ? <p className={styles.empty}>{copy.empty}</p> : null}
          {hasMore ? <Button variant="ghost" className={styles.more} disabled={locked}
            onClick={() => { if (!locked) onMore() }}>{copy.more}</Button> : null}
        </div>
        {writeError ? <p className={styles.feedback} role="alert">{writeError}</p> : null}
        <footer className={styles.footer}>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{copy.cancel}</Button>
          <Button disabled={locked} onClick={() => { if (!locked) onSave() }}>{copy.save}</Button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
