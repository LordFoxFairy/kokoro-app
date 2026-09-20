"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ChevronDown, Folder, ImageIcon, Plus, Trash2, Upload } from "lucide-react"
import { useT } from "@/i18n/context"
import { cn } from "@/lib/utils"
import type { HubClient } from "@/hub/client"
import type { McpTransport } from "@/hub/schemas"

import styles from "./mcp-custom-form.module.css"
import { humanizeError } from "./mcp-panel-model"

type CustomHeaderDraft = { id: number; name: string; value: string }

export function CustomMcpForm({
  client,
  onDone,
}: {
  client: HubClient
  onDone: () => Promise<void>
}) {
  const t = useT()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [name, setName] = useState("")
  const [transport, setTransport] = useState<McpTransport>("http")
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [instructions, setInstructions] = useState("")
  const [url, setUrl] = useState("")
  const [headers, setHeaders] = useState<CustomHeaderDraft[]>([])
  const [nextHeaderId, setNextHeaderId] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = name.trim().length > 0 && url.trim().length > 0 && !submitting

  const updateHeader = (id: number, field: "name" | "value", value: string): void => {
    setHeaders((current) => current.map((header) => header.id === id ? { ...header, [field]: value } : header))
  }

  const addHeader = (): void => {
    setHeaders((current) => [...current, { id: nextHeaderId, name: "", value: "" }])
    setNextHeaderId((current) => current + 1)
  }

  const submit = async (enabled: boolean): Promise<void> => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      if (!client.registerCustomMcp) {
        throw new Error("custom connector contract unavailable")
      }
      const asset = iconFile && client.uploadConnectorIcon
        ? await client.uploadConnectorIcon(iconFile)
        : null
      await client.registerCustomMcp({
        name: name.trim(),
        transport,
        endpoint_url: url.trim(),
        icon_asset_id: asset?.asset_id ?? null,
        instructions: instructions.trim() || null,
        headers: headers
          .map((header) => ({ name: header.name.trim(), value: header.value }))
          .filter((header) => header.name.length > 0 && header.value.length > 0),
        enabled,
      })
      await onDone()
    } catch (caught) {
      setError(humanizeError(t, caught))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      className={styles.customMcpForm}
      data-testid="custom-mcp-form"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault()
        void submit(true)
      }}
    >
      <div className={styles.customMcpFields}>
        <Field className={styles.customMcpField}>
          <FieldLabel htmlFor="custom-mcp-name">{t("mcp.customName")}</FieldLabel>
          <Input
            id="custom-mcp-name"
            value={name}
            placeholder={t("mcp.customNamePlaceholder")}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field className={styles.customMcpField}>
          <FieldLabel htmlFor="custom-mcp-transport">{t("mcp.customTransport")}</FieldLabel>
          <Select value={transport} onValueChange={(value) => setTransport(value as McpTransport)}>
            <SelectTrigger id="custom-mcp-transport" aria-label={t("mcp.customTransport")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="http">HTTP</SelectItem>
                <SelectItem value="streamable_http">Streamable HTTP</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field className={cn(styles.customMcpField, styles.customMcpWide)}>
          <FieldLabel>{t("mcp.customIcon")}</FieldLabel>
          <div className={styles.iconUploadRow}>
            <button type="button" className={styles.iconPreview} onClick={() => fileRef.current?.click()} aria-label={t("mcp.customUpload")}>
              <ImageIcon aria-hidden="true" />
            </button>
            <div className={styles.iconUploadCopy}>
              <Button variant="outline" type="button" className={styles.uploadButton} onClick={() => fileRef.current?.click()}>
                <Upload aria-hidden="true" />
                {t("mcp.customUpload")}
                <ChevronDown aria-hidden="true" />
              </Button>
              <span>{iconFile?.name ?? t("mcp.customIconHint")}</span>
            </div>
            <input
              ref={fileRef}
              className={styles.hiddenFile}
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null
                if (next && next.size > 1024 * 1024) {
                  setError(t("mcp.customIconTooLarge"))
                  event.target.value = ""
                  return
                }
                setError(null)
                setIconFile(next)
              }}
            />
          </div>
        </Field>

        <Field className={cn(styles.customMcpField, styles.customMcpWide, styles.customMcpNotes)}>
          <FieldLabel htmlFor="custom-mcp-instructions">{t("mcp.customInstructions")}<span>{t("mcp.optional")}</span></FieldLabel>
          <Textarea
            id="custom-mcp-instructions"
            value={instructions}
            placeholder={t("mcp.customInstructionsPlaceholder")}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </Field>

        <Field className={cn(styles.customMcpField, styles.customMcpWide)}>
          <FieldLabel htmlFor="custom-mcp-url">{t("mcp.customServerUrl")}</FieldLabel>
          <Input
            id="custom-mcp-url"
            value={url}
            placeholder="https://mcp.yourserver.com/mcp"
            onChange={(event) => setUrl(event.target.value)}
          />
        </Field>

        <div className={cn(styles.customMcpField, styles.customMcpWide)}>
          <FieldLabel>{t("mcp.customHeaders")}<span>{t("mcp.optional")}</span></FieldLabel>
          {headers.length > 0 ? <div className={styles.headerRows}>
            {headers.map((header, index) => (
              <div className={styles.headerRow} key={header.id}>
                <Input
                  value={header.name}
                  name={`custom-mcp-header-name-${header.id}`}
                  autoComplete="off"
                  aria-label={t("mcp.customHeaderName", { count: index + 1 })}
                  placeholder={t("mcp.customHeaderNamePlaceholder")}
                  onChange={(event) => updateHeader(header.id, "name", event.target.value)}
                />
                <Input
                  value={header.value}
                  type="password"
                  name={`custom-mcp-header-value-${header.id}`}
                  autoComplete="new-password"
                  aria-label={t("mcp.customHeaderValue", { count: index + 1 })}
                  placeholder={t("mcp.customHeaderValuePlaceholder")}
                  onChange={(event) => updateHeader(header.id, "value", event.target.value)}
                />
                <Button variant="ghost" size="icon-sm" type="button" onClick={() => setHeaders((current) => current.filter((entry) => entry.id !== header.id))} aria-label={t("mcp.customRemoveHeader")}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div> : null}
          <Button variant="outline" type="button" className={styles.addHeaderButton} onClick={addHeader}>
            <Plus aria-hidden="true" />
            {t("mcp.customAddHeader")}
          </Button>
        </div>
      </div>

      {error ? <p className={styles.customMcpError} role="alert">{error}</p> : null}

      <div className={styles.customMcpActions}>
        <div className={styles.splitSave}>
          <Button type="submit" disabled={!canSubmit}>{submitting ? t("mcp.submitting") : t("mcp.save")}</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" disabled={!canSubmit} aria-label={t("mcp.customSaveOptions")}><ChevronDown aria-hidden="true" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className={styles.publishMenu} align="end" side="top" sideOffset={4}>
              <DropdownMenuItem onSelect={() => void submit(false)}>
                <Folder aria-hidden="true" />
                {t("mcp.customPublishToProjects")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </form>
  )
}
