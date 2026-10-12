"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ChevronDown, Link2, Settings2 } from "lucide-react"
import { useT } from "@/i18n/context"
import type { HubClient } from "@/hub/client"

import styles from "./mcp-create-dialog.module.css"

export function UrlMcpForm({ client, onCancel, onDone }: { client: HubClient; onCancel: () => void; onDone: () => Promise<void> }) {
  const t = useT()
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [advanced, setAdvanced] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const canSubmit = name.trim().length > 0 && /^https:\/\//i.test(url.trim()) && !submitting

  const submit = async (enabled: boolean): Promise<void> => {
    if (!canSubmit) return
    setError("")
    setSubmitting(true)
    try {
      if (!client.registerCustomMcp) {
        throw new Error("custom MCP registration is unavailable")
      }
      await client.registerCustomMcp({
        name: name.trim(),
        transport: "streamable_http",
        endpoint_url: url.trim(),
        icon_asset_id: null,
        instructions: null,
        headers: [],
        enabled,
      })
      await onDone()
    } catch {
      setError(t("mcp.error"))
    } finally {
      setSubmitting(false)
    }
  }

  return <form className={styles.urlMcpForm} onSubmit={(event) => { event.preventDefault(); void submit(false) }}>
    <DialogTitle className={styles.urlMcpTitle}>
      {t("mcp.urlTitle")}
      <span>{t("connectorCatalog.beta")}</span>
    </DialogTitle>
    <Field className={styles.urlMcpField}>
      <FieldLabel htmlFor="url-mcp-name">{t("mcp.customName")}<span>*</span></FieldLabel>
      <Input id="url-mcp-name" autoFocus value={name} placeholder={t("mcp.urlNamePlaceholder")} onChange={(event) => setName(event.target.value)} />
    </Field>
    <Field className={styles.urlMcpField}>
      <FieldLabel htmlFor="url-mcp-url">{t("mcp.customServerUrl")}<span>*</span></FieldLabel>
      <div className={styles.urlInput}><Link2 aria-hidden="true" /><Input id="url-mcp-url" value={url} placeholder="https://mcp.yourserver.com/mcp" onChange={(event) => setUrl(event.target.value)} /></div>
    </Field>
    <button type="button" className={styles.advancedToggle} aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>
      <Settings2 aria-hidden="true" />
      <span>{t("mcp.advancedSettings")}</span>
      <small>{t("mcp.optional")}</small>
      <ChevronDown aria-hidden="true" />
    </button>
    {advanced ? <p className={styles.urlWarning}>{t("mcp.urlOAuthDiscovery")}</p> : null}
    {error ? <p className={styles.compactDialogError} role="alert">{error}</p> : null}
    <p className={styles.urlWarning}>{t("mcp.urlWarning")}</p>
    <div className={styles.urlMcpActions}>
      <Button type="button" variant="outline" onClick={onCancel}>{t("mcp.cancel")}</Button>
      <span />
      <Button type="submit" variant="outline" disabled={!canSubmit}>{t("mcp.save")}</Button>
      <Button type="button" disabled={!canSubmit} onClick={() => void submit(true)}>{t("mcp.saveAndPublish")}<ChevronDown aria-hidden="true" /></Button>
    </div>
  </form>
}
