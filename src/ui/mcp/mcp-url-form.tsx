"use client"

import { useState } from "react"
import type { McpPrivateServerRegistration } from "@/hub/mcp-connector.schema"
import { Button } from "@/components/ui/button"
import { DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ChevronDown, Link2, Settings2 } from "lucide-react"
import { useT } from "@/i18n/context"
import type { HubClient } from "@/hub/client"

import styles from "./mcp-create-dialog.module.css"

function isMcpEndpointUrl(value: string): boolean {
  try {
    const endpoint = new URL(value)
    return value.trim() === value && endpoint.protocol === "https:" && endpoint.hostname.length > 0 && endpoint.username === "" && endpoint.password === "" && endpoint.hash === "" && endpoint.toString() === value
  } catch {
    return false
  }
}

export function UrlMcpForm({ client, onCancel, onDone, onAuthorizationNavigate }: { client: HubClient; onCancel: () => void; onDone: () => Promise<void>; onAuthorizationNavigate?: (url: string) => void }) {
  const t = useT()
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [advanced, setAdvanced] = useState(false)
  const [registration, setRegistration] = useState<McpPrivateServerRegistration | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const canSubmit = name.trim().length > 0 && isMcpEndpointUrl(url.trim()) && !submitting

  const submit = async (enabled: boolean): Promise<void> => {
    if (!canSubmit) return
    setError("")
    setSubmitting(true)
    try {
      const result = registration ?? await (async () => {
        if (!client.registerPrivateMcpServer) throw new Error("private MCP registration is unavailable")
        const created = await client.registerPrivateMcpServer({ display_name: name.trim(), server_url: url.trim() })
        setRegistration(created)
        return created
      })()
      if (enabled && result.connector.status === "pending") {
        const started = await client.beginMcpConnectorAuthorization(result.connector.connector_id, {
          server_id: result.server.server_id,
          expected_state_version: result.connector.state_version,
        })
        ;(onAuthorizationNavigate ?? ((authorizationUrl: string) => window.location.assign(authorizationUrl)))(started.authorization.authorization_url)
      }
    } catch {
      setError(t("mcp.error"))
    } finally {
      setSubmitting(false)
    }
  }

  if (registration !== null) return <section className={styles.urlMcpForm} aria-live="polite">
    <DialogTitle className={styles.urlMcpTitle}>{registration.server.display_name}</DialogTitle>
    <p className={styles.urlWarning}>{registration.connector.status === "pending" ? t("mcp.pending") : t("mcp.active")}</p>
    {registration.connector.status === "pending"
      ? <Button type="button" disabled={submitting} onClick={() => void submit(true)}>{t("settings.connect")}</Button>
      : <Button type="button" onClick={() => void onDone()}>{t("mcp.save")}</Button>}
  </section>

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
