"use client"

import type { RefObject } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useT } from "@/i18n/context"
import { cn } from "@/lib/utils"
import type { HubClient } from "@/hub/client"

import styles from "./mcp-create-dialog.module.css"
import type { McpCreateMode } from "./mcp-panel-model"
import { CustomMcpForm } from "./mcp-custom-form"
import { JsonMcpImportForm } from "./mcp-json-import-form"
import { UrlMcpForm } from "./mcp-url-form"

export function McpCreateDialog({
  client,
  mode,
  open,
  onOpenChange,
  onDone,
  returnFocusRef,
}: {
  client: HubClient
  mode: McpCreateMode
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone?: () => Promise<void>
  returnFocusRef?: RefObject<HTMLElement | null>
}) {
  const t = useT()
  const close = (): void => onOpenChange(false)
  const complete = async (): Promise<void> => {
    await onDone?.()
    close()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          mode === "json" ? styles.jsonImportDialog : mode === "url" ? styles.urlMcpDialog : styles.registerDialog,
          "p-0 box-border",
        )}
        closeLabel={t("mcp.cancel")}
        overlayClassName={styles.createDialogOverlay ?? ""}
        onOpenAutoFocus={(event) => {
          if (mode !== "form") return
          event.preventDefault()
          window.requestAnimationFrame(() => document.getElementById("custom-mcp-name")?.focus())
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current
          if (!target?.isConnected) return
          event.preventDefault()
          target.focus()
        }}
      >
        {mode === "json" ? (
          <JsonMcpImportForm client={client} onCancel={close} onDone={complete} />
        ) : mode === "url" ? (
          <UrlMcpForm client={client} onCancel={close} onDone={complete} />
        ) : (
          <>
            <DialogTitle className={styles.registerDialogTitle}>{t("mcp.registerDialogTitle")}</DialogTitle>
            <CustomMcpForm client={client} onDone={complete} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
