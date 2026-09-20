"use client"

import { useCallback, useRef, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { useT } from "@/i18n/context"
import type { HubClient } from "@/hub/client"
import { MCP_TRANSPORTS, type McpSecret, type McpTransport } from "@/hub/schemas"

import styles from "./mcp-register-form.module.css"
import { humanizeError, transportLabel } from "./mcp-panel-model"
import { CustomMcpForm } from "./mcp-custom-form"

export function RegisterForm(props: {
  client: HubClient
  secrets: McpSecret[]
  referenceLayout?: boolean
  onCancel: () => void
  onDone: () => Promise<void>
}) {
  return props.referenceLayout
    ? <CustomMcpForm client={props.client} onDone={props.onDone} />
    : <LegacyRegisterForm client={props.client} secrets={props.secrets} onCancel={props.onCancel} onDone={props.onDone} />
}

// Standalone MCP management keeps the lower-level server/credential editor;
// Settings uses the connector composer above it.
function LegacyRegisterForm({
  client,
  secrets,
  onCancel,
  onDone,
}: {
  client: HubClient
  secrets: McpSecret[]
  onCancel: () => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const [name, setName] = useState("")
  const [transport, setTransport] = useState<McpTransport>("streamable_http")
  const [url, setUrl] = useState("")
  const [tools, setTools] = useState("")
  // 凭据选择："none" | handle(srt_...) | "new"（新建则同表单填名值，注册前先创建换 handle）。
  const [secretChoice, setSecretChoice] = useState<string>("none")
  const [newSecretName, setNewSecretName] = useState("")
  const [newSecretValue, setNewSecretValue] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  const nameRef = useRef<HTMLInputElement | null>(null)
  const urlRef = useRef<HTMLInputElement | null>(null)
  const newSecretNameRef = useRef<HTMLInputElement | null>(null)
  const newSecretValueRef = useRef<HTMLInputElement | null>(null)

  const onSubmit = useCallback(async () => {
    setSubmitting(true)
    setError(null)
    try {
      // 凭据 handle 归一化：新建则先创建换句柄；secret_ref 恒为 handle:srt_... 引用或 null。
      let secretRef: string | null = null
      if (secretChoice === "new") {
        const handle = await client.createMcpSecret(newSecretName.trim(), newSecretValue)
        secretRef = `handle:${handle}`
      } else if (secretChoice !== "none") {
        secretRef = `handle:${secretChoice}`
      }
      const allowedTools = tools
        .split(",")
        .map((tool) => tool.trim())
        .filter((tool) => tool.length > 0)
      await client.registerMcpServer({
        name: name.trim(),
        transport,
        url: url.trim(),
        allowed_tools: allowedTools,
        secret_ref: secretRef,
      })
      await onDone()
    } catch (err) {
      setError(humanizeError(t, err))
    } finally {
      setSubmitting(false)
    }
  }, [client, name, newSecretName, newSecretValue, onDone, secretChoice, t, tools, transport, url])

  const canSubmit =
    name.trim().length > 0 &&
    url.trim().length > 0 &&
    (secretChoice !== "new" || (newSecretName.trim().length > 0 && newSecretValue.length > 0))
  const nameInvalid = attempted && name.trim().length === 0
  const urlInvalid = attempted && url.trim().length === 0
  const newSecretNameInvalid = attempted && secretChoice === "new" && newSecretName.trim().length === 0
  const newSecretValueInvalid = attempted && secretChoice === "new" && newSecretValue.length === 0

  return (
    <form
      className={styles.legacyForm}
      data-testid="mcp-register-form"
      onSubmit={(e) => {
        e.preventDefault()
        setAttempted(true)
        if (!canSubmit) {
          window.requestAnimationFrame(() => {
            const target = name.trim().length === 0
              ? nameRef.current
              : url.trim().length === 0
                ? urlRef.current
                : newSecretName.trim().length === 0
                  ? newSecretNameRef.current
                  : newSecretValueRef.current
            target?.focus()
          })
          return
        }
        if (!submitting) void onSubmit()
      }}
    >
      <FieldGroup className={styles.legacyFieldGroup}>
      <Field className={styles.legacyField} data-invalid={nameInvalid || undefined}>
        <FieldLabel className={styles.legacyFieldLabel} htmlFor="mcp-server-name">{t("mcp.fieldName")}</FieldLabel>
        <Input
          ref={nameRef}
          id="mcp-server-name"
          className={styles.legacyInput}
          value={name}
          aria-invalid={nameInvalid || undefined}
          placeholder={t("mcp.fieldNamePlaceholder")}
          onChange={(e) => setName(e.target.value)}
        />
        <FieldDescription className={styles.legacyFieldHint}>{t("mcp.fieldNameHint")}</FieldDescription>
        {nameInvalid ? <FieldError>{t("mcp.required")}</FieldError> : null}
      </Field>

      <Field className={styles.legacyField}>
        <FieldLabel className={styles.legacyFieldLabel} htmlFor="mcp-transport">{t("mcp.fieldTransport")}</FieldLabel>
        <Select value={transport} onValueChange={(value) => setTransport(value as McpTransport)}>
          <SelectTrigger id="mcp-transport" className={styles.legacyInput} aria-label={t("mcp.fieldTransport")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {MCP_TRANSPORTS.map((value) => (
                <SelectItem key={value} value={value}>
                  {transportLabel(t, value)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <Field className={styles.legacyField} data-invalid={urlInvalid || undefined}>
        <FieldLabel className={styles.legacyFieldLabel} htmlFor="mcp-server-url">{t("mcp.fieldUrl")}</FieldLabel>
        <Input
          ref={urlRef}
          id="mcp-server-url"
          className={styles.legacyInput}
          value={url}
          aria-invalid={urlInvalid || undefined}
          placeholder={t("mcp.fieldUrlPlaceholder")}
          onChange={(e) => setUrl(e.target.value)}
        />
        <FieldDescription className={styles.legacyFieldHint}>{t("mcp.fieldUrlHint")}</FieldDescription>
        {urlInvalid ? <FieldError>{t("mcp.required")}</FieldError> : null}
      </Field>

      <Field className={styles.legacyField}>
        <FieldLabel className={styles.legacyFieldLabel} htmlFor="mcp-tools">{t("mcp.fieldTools")}</FieldLabel>
        <Input
          id="mcp-tools"
          className={styles.legacyInput}
          value={tools}
          placeholder={t("mcp.fieldToolsPlaceholder")}
          onChange={(e) => setTools(e.target.value)}
        />
        <FieldDescription className={styles.legacyFieldHint}>{t("mcp.fieldToolsHint")}</FieldDescription>
      </Field>

      <Field className={styles.legacyField}>
        <FieldLabel className={styles.legacyFieldLabel} htmlFor="mcp-secret-choice">{t("mcp.fieldSecret")}</FieldLabel>
        <Select value={secretChoice} onValueChange={setSecretChoice}>
          <SelectTrigger id="mcp-secret-choice" className={styles.legacyInput} aria-label={t("mcp.fieldSecret")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="none">{t("mcp.secretOptionNone")}</SelectItem>
              {secrets.map((secret) => (
                <SelectItem key={secret.handle} value={secret.handle}>
                  {secret.name}
                </SelectItem>
              ))}
              <SelectItem value="new">{t("mcp.secretOptionNew")}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      {secretChoice === "new" ? (
        <>
          <Field className={styles.legacyField} data-invalid={newSecretNameInvalid || undefined}>
            <FieldLabel className={styles.legacyFieldLabel} htmlFor="mcp-new-secret-name">{t("mcp.secretName")}</FieldLabel>
            <Input
              ref={newSecretNameRef}
              id="mcp-new-secret-name"
              className={styles.legacyInput}
              value={newSecretName}
              aria-invalid={newSecretNameInvalid || undefined}
              placeholder={t("mcp.secretNamePlaceholder")}
              onChange={(e) => setNewSecretName(e.target.value)}
            />
            {newSecretNameInvalid ? <FieldError>{t("mcp.required")}</FieldError> : null}
          </Field>
          <Field className={styles.legacyField} data-invalid={newSecretValueInvalid || undefined}>
            <FieldLabel className={styles.legacyFieldLabel} htmlFor="mcp-new-secret-value">{t("mcp.secretValue")}</FieldLabel>
            <Input
              ref={newSecretValueRef}
              id="mcp-new-secret-value"
              className={styles.legacyInput}
              type="password"
              value={newSecretValue}
              aria-invalid={newSecretValueInvalid || undefined}
              placeholder={t("mcp.secretValuePlaceholder")}
              onChange={(e) => setNewSecretValue(e.target.value)}
            />
            <FieldDescription className={styles.legacyFieldHint}>{t("mcp.secretValueHint")}</FieldDescription>
            {newSecretValueInvalid ? <FieldError>{t("mcp.required")}</FieldError> : null}
          </Field>
        </>
      ) : null}
      </FieldGroup>

      {error ? (
        <Alert variant="destructive" className={styles.legacyFeedback}>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className={styles.legacyFormActions}>
        <Button
          variant="default"
          type="submit"
          className={styles.legacySubmit}
          disabled={submitting}
          aria-busy={submitting}
          data-incomplete={!canSubmit || undefined}
        >
          {submitting ? <><Spinner aria-hidden="true" />{t("mcp.submitting")}</> : t("mcp.save")}
        </Button>
        <Button variant="outline" type="button" className={styles.legacyCancel} onClick={onCancel} disabled={submitting}>
          {t("mcp.cancel")}
        </Button>
      </div>
    </form>
  )
}
