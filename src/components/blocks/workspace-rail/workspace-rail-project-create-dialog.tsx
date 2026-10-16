"use client"

import { useId, useState } from "react"
import { Folder, FolderPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/context"

import styles from "./workspace-rail-project-create-dialog.module.css"

type WorkspaceRailProjectCreateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate?: (input?: Readonly<{ name?: string; draft?: string }>) => void
}

/** Shell-owned project creation form. Folder selection remains visibly disabled
 * until the Computer capability is delivered; it never fabricates a folder. */
export function WorkspaceRailProjectCreateDialog({ open, onOpenChange, onCreate }: WorkspaceRailProjectCreateDialogProps) {
  const t = useT()
  const nameId = useId()
  const [name, setName] = useState("")
  const trimmedName = name.trim()

  const close = () => {
    setName("")
    onOpenChange(false)
  }
  const submit = () => {
    if (!trimmedName || !onCreate) return
    onCreate({ name: trimmedName })
    close()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); else onOpenChange(true) }}>
      <DialogContent className={styles.dialog} closeLabel={t("shell.closeDialog")}>
        <DialogHeader className={styles.header}>
          <span className={styles.icon} aria-hidden="true"><FolderPlus /></span>
          <DialogTitle className={styles.title}>{t("firstSite.projectCreateTitle")}</DialogTitle>
        </DialogHeader>
        <form className={styles.form} onSubmit={(event) => { event.preventDefault(); submit() }}>
          <label className={styles.field} htmlFor={nameId}>
            <span>{t("firstSite.projectName")}</span>
            <Input id={nameId} value={name} maxLength={160} autoFocus placeholder={t("firstSite.projectNamePlaceholder")} onChange={(event) => setName(event.target.value)} />
          </label>
          <div className={styles.folderField} aria-disabled="true">
            <span>{t("firstSite.projectFolder")}</span>
            <Button type="button" variant="secondary" disabled><Folder aria-hidden="true" />{t("firstSite.projectFolderUnavailable")}</Button>
          </div>
          <DialogFooter className={styles.footer}>
            <Button type="button" variant="outline" onClick={close}>{t("firstSite.cancel")}</Button>
            <Button type="submit" disabled={!trimmedName || !onCreate}>{t("firstSite.create")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
