"use client"

import { Search, SquareCode } from "lucide-react"
import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { PROJECT_WEBSITE_URL_LIMIT, type ProjectWebsitesState } from "@/generated/bff-project-websites"
import { projectWebsitesClient } from "@/hub/project-websites-client"
import { canonicalProjectWebsite, sameProjectWebsites } from "@/hub/project-websites.schema"
import { useT } from "@/i18n/context"
import { AUTH_INDEX_SUBJECT_KEY } from "@/ui/shell/page-clients"
import styles from "./project-workspace-dialogs.module.css"

type Recovery = { desired: string[]; uncertain: boolean }
type Editor = { phase: "loading" | "failed"; recovery?: Recovery } |
  { phase: "ready" | "saving"; original: ProjectWebsitesState; draft: string[]; notice?: "recovered" | "rejected" }
type Lease = { controller: AbortController; busy: boolean }

export function ProjectWebsitesDialog({ projectId, isCurrent, onClose, readOnly = false }: {
  readOnly?: boolean
  projectId: string
  isCurrent: () => boolean
  onClose: (restoreFocus?: boolean) => void
}) {
  const t = useT()
  const leaseRef = useRef<Lease | null>(null)
  const [editor, setEditor] = useState<Editor>({ phase: "loading" })
  const [search, setSearch] = useState("")
  const [address, setAddress] = useState("")
  const [invalidAddress, setInvalidAddress] = useState(false)
  const current = useCallback((lease: Lease) => leaseRef.current === lease && !lease.controller.signal.aborted && isCurrent(), [isCurrent])
  const read = useCallback(async (lease: Lease, recovery?: Recovery) => {
    if (!current(lease)) return
    lease.busy = true
    const context = recovery === undefined ? {} : { recovery }
    setEditor({ phase: "loading", ...context })
    const result = await projectWebsitesClient.get(projectId, lease.controller.signal)
    if (!current(lease)) return
    lease.busy = false
    if (result.kind !== "ok") { setEditor({ phase: "failed", ...context }); return }
    if (recovery?.uncertain && sameProjectWebsites(result.state.websites, recovery.desired)) {
      // A read proves the current desired state, not receipt of the original write.
      onClose()
      return
    }
    setEditor({ phase: "ready", original: result.state, draft: result.state.websites,
      ...(recovery === undefined ? {} : { notice: "recovered" }) })
  }, [current, onClose, projectId])

  useLayoutEffect(() => {
    const lease = { controller: new AbortController(), busy: false }
    leaseRef.current = lease
    const retire = () => {
      lease.controller.abort()
      if (leaseRef.current === lease) onClose(false)
    }
    const routeChanged = () => { if (!isCurrent()) retire() }
    const storageChanged = (event: StorageEvent) => {
      if (event.storageArea === window.localStorage &&
        (event.key === null || event.key === AUTH_INDEX_SUBJECT_KEY && event.oldValue !== event.newValue || !isCurrent())) retire()
    }
    window.addEventListener("storage", storageChanged)
    window.addEventListener("pagehide", retire)
    window.addEventListener("kokoro:auth-invalidated", retire)
    window.addEventListener("popstate", routeChanged)
    window.addEventListener("kokoro:surface-navigation", routeChanged)
    // Strict Mode's discarded effect cannot dispatch the first read.
    queueMicrotask(() => { void read(lease) })
    return () => {
      lease.controller.abort()
      if (leaseRef.current === lease) leaseRef.current = null
      window.removeEventListener("storage", storageChanged)
      window.removeEventListener("pagehide", retire)
      window.removeEventListener("kokoro:auth-invalidated", retire)
      window.removeEventListener("popstate", routeChanged)
      window.removeEventListener("kokoro:surface-navigation", routeChanged)
    }
  }, [isCurrent, onClose, read])

  const ready = editor.phase === "ready" ? editor : null
  const filtered = ready?.draft.filter(url => url.toLowerCase().includes(search.trim().toLowerCase())) ?? []
  const editing = editor.phase === "saving" || (editor.phase === "loading" && editor.recovery !== undefined)
  const changeOpen = (open: boolean) => { if (!open && !editing) onClose() }
  const add = () => {
    if (readOnly || !ready || ready.draft.length >= PROJECT_WEBSITE_URL_LIMIT) return
    const normalized = canonicalProjectWebsite(address)
    if (normalized === null || ready.draft.includes(normalized)) { setInvalidAddress(true); return }
    setEditor({ ...ready, draft: [...ready.draft, normalized].sort() })
    setAddress("")
    setSearch("")
    setInvalidAddress(false)
  }
  const save = async () => {
    const lease = leaseRef.current
    if (readOnly || !ready || !lease || lease.busy || !current(lease) || sameProjectWebsites(ready.original.websites, ready.draft)) return
    lease.busy = true
    setEditor({ ...ready, phase: "saving" })
    const result = await projectWebsitesClient.replace(ready.original, ready.draft, lease.controller.signal)
    if (!current(lease)) return
    lease.busy = false
    if (result.kind === "ok") { onClose(); return }
    if (result.kind === "rejected") { setEditor({ ...ready, notice: "rejected" }); return }
    if (result.kind === "denied") { setEditor({ phase: "failed" }); return }
    setAddress("")
    setSearch("")
    setInvalidAddress(false)
    await read(lease, { desired: ready.draft, uncertain: result.kind === "unknown" })
  }
  return <Dialog open onOpenChange={changeOpen}>
    <DialogContent className={`${styles.projectPickerDialog} ${styles.websitePickerDialog}`}
      overlayClassName={styles.instructionsOverlay ?? ""} closeLabel={t("shell.closeDialog")} showCloseButton={!editing}>
      <DialogTitle className={styles.projectPickerTitle}>{t("firstSite.addWebsiteToProject")}</DialogTitle>
      <DialogDescription>{t("firstSite.websitesHint")}</DialogDescription>
      <label className={styles.projectPickerSearch}><Search aria-hidden="true" />
        <Input aria-label={t("firstSite.searchWebsites")} placeholder={t("firstSite.searchWebsites")} value={search}
          disabled={!ready} onChange={event => setSearch(event.target.value)} />
      </label>
      <div className={styles.websiteAddressRow}>
        <Input aria-label={t("firstSite.websiteAddress")} placeholder="https://example.com/" inputMode="url" spellCheck={false}
          autoCapitalize="none" value={address} aria-invalid={invalidAddress || undefined}
          disabled={!ready || ready.draft.length >= PROJECT_WEBSITE_URL_LIMIT}
          onChange={event => { setAddress(event.target.value); setInvalidAddress(false) }}
          onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); add() } }} />
        <Button type="button" variant="outline" disabled={!ready || !address || ready.draft.length >= PROJECT_WEBSITE_URL_LIMIT}
          onClick={add}>{t("firstSite.addWebsiteAddress")}</Button>
      </div>
      {invalidAddress ? <p role="alert">{t("firstSite.invalidWebsiteAddress")}</p> : null}
      {editor.phase === "loading" || editor.phase === "saving" ? <p role="status">{t("firstSite.websitesWorking")}</p> : null}
      {editor.phase === "failed" ? <div role="alert">
        <p>{t(editor.recovery ? "firstSite.websitesOutcomeUnknown" : "firstSite.websitesReadFailed")}</p>
        <Button type="button" variant="outline" onClick={() => {
          const lease = leaseRef.current
          if (lease && !lease.busy) void read(lease, editor.recovery)
        }}>{t("firstSite.retry")}</Button>
      </div> : null}
      {ready?.notice ? <p role="status">{t(ready.notice === "recovered" ? "firstSite.websitesReviewCurrent" : "firstSite.websitesSaveRejected")}</p> : null}
      {ready && filtered.length === 0 ? <p role="status">{t("firstSite.noWebsites")}</p> : null}
      {ready && filtered.length > 0 ? <ul className={styles.websiteList} aria-label={t("firstSite.websites")}>
        {filtered.map(url => <li key={url}><SquareCode aria-hidden="true" /><span>{url}</span>
          <Button type="button" variant="outline" aria-label={`${t("firstSite.unlinkWebsite")} ${url}`}
            onClick={() => setEditor({ ...ready, draft: ready.draft.filter(value => value !== url) })}>{t("firstSite.unlinkWebsite")}</Button>
        </li>)}
      </ul> : null}
      <DialogFooter className={styles.websitePickerFooter}>
        <DialogClose asChild><Button type="button" variant="outline" disabled={editing}>{t("firstSite.cancel")}</Button></DialogClose>
        <Button type="button" disabled={readOnly || !ready || sameProjectWebsites(ready.original.websites, ready.draft)} onClick={() => { void save() }}>
          {t("firstSite.save")}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
