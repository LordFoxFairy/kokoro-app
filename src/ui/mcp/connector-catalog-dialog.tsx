"use client"

import Image from "next/image"
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent, type RefObject } from "react"
import {
  Braces,
  Cable,
  Check,
  ChevronDown,
  Globe2,
  ImageIcon,
  Info,
  KeyRound,
  Plus,
  Search,
  Server,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { useT } from "@/i18n/context"
import type { HubClient } from "@/hub/client"

import { API_CONNECTORS, APP_CONNECTORS, type ConnectorCatalogItem } from "./connector-catalog-data"
import styles from "./connector-catalog-dialog.module.css"

type CatalogTab = "apps" | "api" | "mcp" | "projects"

export function ConnectorCatalogDialog({
  open,
  onOpenChange,
  onCustomMcp,
  client,
  returnFocusRef,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCustomMcp: (mode?: "form" | "json" | "url") => void
  client: HubClient
  returnFocusRef?: RefObject<HTMLButtonElement | null>
}) {
  const t = useT()
  const [tab, setTab] = useState<CatalogTab>("apps")
  const [query, setQuery] = useState("")
  const [added, setAdded] = useState<Set<string>>(() => new Set())
  const [customApiOpen, setCustomApiOpen] = useState(false)
  const createRef = useRef<HTMLButtonElement | null>(null)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const catalogItems = tab === "api" ? API_CONNECTORS : APP_CONNECTORS
  const items = useMemo(
    () => catalogItems.filter((item) => normalizedQuery === ""
      || item.name.toLocaleLowerCase().includes(normalizedQuery)
      || t(item.description).toLocaleLowerCase().includes(normalizedQuery)),
    [catalogItems, normalizedQuery, t],
  )

  const openCustomMcp = (): void => {
    onCustomMcp("form")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${styles.dialog} p-0 box-border`}
        closeLabel={t("connectorCatalog.close")}
        overlayClassName={styles.overlay}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current
          if (!target?.isConnected) return
          event.preventDefault()
          target.focus({ preventScroll: true })
        }}
      >
        <DialogTitle className={styles.title}>{t("connectorCatalog.title")}</DialogTitle>
        <div className={styles.searchField}>
          <Search aria-hidden="true" />
          <Input
            className={styles.searchInput}
            value={query}
            type="search"
            aria-label={t("connectorCatalog.search")}
            placeholder={t("connectorCatalog.search")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Tabs value={tab} onValueChange={(value) => setTab(value as CatalogTab)} className={styles.tabs}>
          <div className={styles.toolbar}>
            <TabsList className={styles.tabList}>
              <TabsTrigger className={styles.tab} value="apps">{t("connectorCatalog.apps")}</TabsTrigger>
              <TabsTrigger className={styles.tab} value="api">{t("connectorCatalog.customApi")}</TabsTrigger>
              <TabsTrigger className={styles.tab} value="mcp">{t("connectorCatalog.customMcp")}</TabsTrigger>
              <TabsTrigger className={styles.tab} value="projects">{t("connectorCatalog.projects")}</TabsTrigger>
            </TabsList>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button ref={createRef} variant="outline" className={styles.createMenu}>
                  {t("connectorCatalog.create")}
                  <ChevronDown aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={styles.createDropdown}>
                <DropdownMenuItem onSelect={() => setCustomApiOpen(true)}><KeyRound aria-hidden="true" />{t("connectorCatalog.customApi")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={openCustomMcp}><Server aria-hidden="true" />{t("connectorCatalog.customMcp")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onCustomMcp("json")}><Braces aria-hidden="true" />{t("connectorCatalog.importMcpJson")}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onCustomMcp("url")}>
                  <Globe2 aria-hidden="true" />
                  <span>{t("connectorCatalog.addMcpUrl")}</span>
                  <span className={styles.betaBadge}>{t("connectorCatalog.beta")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {(["apps", "api"] as const).map((value) => (
            <TabsContent className={styles.catalogContent} value={value} key={value}>
              <ConnectorGrid
                items={items}
                added={added}
                onToggle={(id) => setAdded((current) => {
                  const next = new Set(current)
                  if (next.has(id)) next.delete(id)
                  else next.add(id)
                  return next
                })}
              />
            </TabsContent>
          ))}

          <TabsContent className={styles.emptyContent} value="mcp">
            <Cable aria-hidden="true" />
            <p>{t("connectorCatalog.customMcpDescription")}</p>
          </TabsContent>
          <TabsContent className={styles.emptyContent} value="projects">
            <Cable aria-hidden="true" />
            <p>{t("connectorCatalog.projectsDescription")}</p>
          </TabsContent>
        </Tabs>
      </DialogContent>
      <CustomApiDialog client={client} open={customApiOpen} onOpenChange={setCustomApiOpen} returnFocusRef={createRef} />
    </Dialog>
  )
}

type ApiSecretDraft = { id: number; name: string; value: string }

export function CustomApiDialog({
  client,
  open,
  onOpenChange,
  returnFocusRef,
}: {
  client: HubClient
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusRef: RefObject<HTMLElement | null>
}) {
  const t = useT()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const nextSecretId = useRef(2)
  const [name, setName] = useState("")
  const [notes, setNotes] = useState("")
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [iconName, setIconName] = useState("")
  const [iconError, setIconError] = useState("")
  const [submitError, setSubmitError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [secrets, setSecrets] = useState<ApiSecretDraft[]>([{ id: 1, name: "", value: "" }])
  const complete = name.trim().length > 0
    && secrets.length > 0
    && secrets.every((secret) => secret.name.trim().length > 0 && secret.value.trim().length > 0)
    && !submitting

  const reset = (): void => {
    setName("")
    setNotes("")
    setIconFile(null)
    setIconName("")
    setIconError("")
    setSubmitError("")
    setSubmitting(false)
    setSecrets([{ id: 1, name: "", value: "" }])
    nextSecretId.current = 2
  }

  const close = (): void => {
    onOpenChange(false)
    reset()
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!complete) return
    setSubmitError("")
    setSubmitting(true)
    try {
      if (!client.registerCustomApi) throw new Error("custom API contract unavailable")
      const asset = iconFile && client.uploadConnectorIcon
        ? await client.uploadConnectorIcon(iconFile)
        : null
      await client.registerCustomApi({
        name: name.trim(),
        notes: notes.trim() || null,
        icon_asset_id: asset?.asset_id ?? null,
        secrets: secrets.map((secret) => ({ name: secret.name.trim(), value: secret.value })),
        enabled: true,
      })
      close()
    } catch {
      setSubmitError(t("mcp.errGeneric"))
    } finally {
      setSubmitting(false)
    }
  }

  const updateSecret = (id: number, field: "name" | "value", value: string): void => {
    setSecrets((current) => current.map((secret) => secret.id === id ? { ...secret, [field]: value } : secret))
  }

  const selectIcon = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setIconName("")
      setIconFile(null)
      setIconError(t("connectorCatalog.iconTypeError"))
      event.target.value = ""
      return
    }
    if (file.size > 1024 * 1024) {
      setIconName("")
      setIconFile(null)
      setIconError(t("connectorCatalog.iconSizeError"))
      event.target.value = ""
      return
    }
    setIconName(file.name)
    setIconFile(file)
    setIconError("")
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) close() }}>
      <DialogContent
        className={`${styles.customApiDialog} p-0 box-border`}
        closeLabel={t("connectorCatalog.customApiClose")}
        overlayClassName={styles.customApiOverlay}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          window.requestAnimationFrame(() => document.getElementById("custom-api-name")?.focus())
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef.current
          if (!target?.isConnected) return
          event.preventDefault()
          target.focus({ preventScroll: true })
        }}
      >
        <DialogTitle className={styles.customApiTitle}>{t("connectorCatalog.customApiCreateTitle")}</DialogTitle>
        <p className={styles.customApiDescription}>{t("connectorCatalog.customApiCreateDescription")}</p>
        <form className={styles.customApiForm} onSubmit={(event) => void submit(event)}>
          <div className={styles.customApiBody}>
            <FieldGroup className={styles.customApiFields}>
              <Field className={styles.customApiField}>
                <FieldLabel htmlFor="custom-api-name">{t("connectorCatalog.name")}</FieldLabel>
                <Input
                  id="custom-api-name"
                  value={name}
                  placeholder={t("connectorCatalog.namePlaceholder")}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>

              <Field className={styles.customApiField}>
                <FieldLabel>{t("connectorCatalog.icon")}</FieldLabel>
                <div className={styles.iconUploadRow}>
                  <button type="button" className={styles.iconPreview} onClick={() => fileRef.current?.click()} aria-label={t("connectorCatalog.uploadIcon")}>
                    <ImageIcon aria-hidden="true" />
                  </button>
                  <div className={styles.iconUploadCopy}>
                    <Button type="button" variant="outline" className={styles.iconUploadButton} onClick={() => fileRef.current?.click()}>
                      {t("connectorCatalog.upload")}
                      <ChevronDown data-icon="inline-end" aria-hidden="true" />
                    </Button>
                    <FieldDescription data-error={iconError ? "true" : undefined} role={iconError ? "alert" : undefined}>
                      {iconError || iconName || t("connectorCatalog.iconHint")}
                    </FieldDescription>
                  </div>
                  <input
                    ref={fileRef}
                    className={styles.hiddenFile}
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={selectIcon}
                  />
                </div>
              </Field>

              <Field className={styles.customApiField}>
                <FieldLabel htmlFor="custom-api-notes">
                  {t("connectorCatalog.notes")}
                  <span>{t("connectorCatalog.optional")}</span>
                </FieldLabel>
                <Textarea
                  id="custom-api-notes"
                  value={notes}
                  placeholder={t("connectorCatalog.notesPlaceholder")}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Field>

              <FieldSet className={styles.secretSet}>
                <FieldLegend className={styles.secretLegend}>
                  {t("connectorCatalog.secrets")}
                  <span>{t("connectorCatalog.environmentVariables")}</span>
                  <Info aria-hidden="true" />
                </FieldLegend>
                <div className={styles.secretList}>
                  {secrets.map((secret, index) => (
                    <div className={styles.secretRow} key={secret.id}>
                      <Field className={styles.customApiField}>
                        <FieldLabel htmlFor={`custom-api-secret-name-${secret.id}`}>{t("connectorCatalog.secretName")}</FieldLabel>
                        <Input
                          id={`custom-api-secret-name-${secret.id}`}
                          value={secret.name}
                          placeholder={t("connectorCatalog.secretNamePlaceholder")}
                          onChange={(event) => updateSecret(secret.id, "name", event.target.value)}
                        />
                      </Field>
                      <Field className={styles.customApiField}>
                        <FieldLabel htmlFor={`custom-api-secret-value-${secret.id}`}>{t("connectorCatalog.secretValue")}</FieldLabel>
                        <Textarea
                          id={`custom-api-secret-value-${secret.id}`}
                          value={secret.value}
                          placeholder={t("connectorCatalog.secretValuePlaceholder")}
                          autoComplete="new-password"
                          onChange={(event) => updateSecret(secret.id, "value", event.target.value)}
                        />
                      </Field>
                      {index > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className={styles.removeSecret}
                          aria-label={t("connectorCatalog.removeSecret")}
                          onClick={() => setSecrets((current) => current.filter((entry) => entry.id !== secret.id))}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className={styles.addSecret}
                  onClick={() => {
                    const id = nextSecretId.current++
                    setSecrets((current) => [...current, { id, name: "", value: "" }])
                  }}
                >
                  <Plus data-icon="inline-start" aria-hidden="true" />
                  {t("connectorCatalog.addSecret")}
                </Button>
              </FieldSet>
            </FieldGroup>
          </div>
          {submitError ? <p className={styles.customApiSubmitError} role="alert">{submitError}</p> : null}
          <div className={styles.customApiActions}>
            <Button type="button" variant="outline" disabled={submitting} onClick={close}>{t("mcp.cancel")}</Button>
            <Button type="submit" disabled={!complete} aria-busy={submitting}>
              {submitting ? <Spinner aria-hidden="true" /> : null}
              {submitting ? t("mcp.submitting") : t("mcp.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ConnectorGrid({
  items,
  added,
  onToggle,
}: {
  items: readonly ConnectorCatalogItem[]
  added: ReadonlySet<string>
  onToggle: (id: string) => void
}) {
  const t = useT()
  return (
    <div className={styles.grid}>
      {items.map((item) => {
        const isAdded = added.has(item.id)
        return (
          <article className={styles.item} key={item.id}>
            <span className={styles.itemIcon}>
              {item.iconUrl
                ? <Image src={item.iconUrl} alt={item.name} width={24} height={24} />
                : <span role="img" aria-label={item.name}>{item.iconText ?? item.name.slice(0, 2)}</span>}
            </span>
            <span className={styles.itemCopy}>
              <strong>{item.name}</strong>
              <span>{t(item.description)}</span>
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              className={styles.add}
              aria-label={t(isAdded ? "connectorCatalog.addedLabel" : "connectorCatalog.addLabel", { name: item.name })}
              onClick={() => onToggle(item.id)}
            >
              {isAdded ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
            </Button>
          </article>
        )
      })}
    </div>
  )
}
