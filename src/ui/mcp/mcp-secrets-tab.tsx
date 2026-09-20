"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useLocale, useT } from "@/i18n/context"
import type { HubClient } from "@/hub/client"
import type { McpSecret } from "@/hub/schemas"

import panelStyles from "./mcp-panel.module.css"
import listStyles from "./mcp-server-list.module.css"
import registerStyles from "./mcp-register-form.module.css"
import { humanizeError } from "./mcp-panel-model"

export function SecretsTab({
  client,
  secrets,
  onChanged,
}: {
  client: HubClient
  secrets: McpSecret[]
  onChanged: () => Promise<void>
}) {
  const t = useT()
  const { locale } = useLocale()
  const [name, setName] = useState("")
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  const nameRef = useRef<HTMLInputElement | null>(null)
  const valueRef = useRef<HTMLInputElement | null>(null)
  const secretDeleteTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const secretConfirmRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const createSecretRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (confirmingDelete === null) return
    const frame = window.requestAnimationFrame(() => {
      secretConfirmRefs.current[confirmingDelete]?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [confirmingDelete])

  const onCreate = useCallback(async () => {
    if (creating || busy !== null) return
    setCreating(true)
    setError(null)
    try {
      await client.createMcpSecret(name.trim(), value)
      setName("")
      setValue("")
      await onChanged()
    } catch (err) {
      setError(humanizeError(t, err))
    } finally {
      setCreating(false)
    }
  }, [busy, client, creating, name, onChanged, t, value])

  const onDelete = useCallback(
    async (secret: McpSecret) => {
      if (creating || busy !== null) return
      setBusy(secret.handle)
      setError(null)
      try {
        await client.deleteMcpSecret(secret.handle)
        await onChanged()
      } catch (err) {
        setError(humanizeError(t, err))
      } finally {
        setBusy(null)
      }
    },
    [busy, client, creating, onChanged, t],
  )

  const canCreate = name.trim().length > 0 && value.length > 0
  const nameInvalid = attempted && name.trim().length === 0
  const valueInvalid = attempted && value.length === 0

  return (
    <div className={panelStyles.secrets}>
      <p className={panelStyles.hintLead}>{t("mcp.secretsHint")}</p>

      <form
        className={registerStyles.registerForm}
        data-testid="mcp-secret-form"
        onSubmit={(e) => {
          e.preventDefault()
          setAttempted(true)
          if (!canCreate) {
            window.requestAnimationFrame(() => {
              (name.trim().length === 0 ? nameRef.current : valueRef.current)?.focus()
            })
            return
          }
          if (!creating) void onCreate()
        }}
      >
        <FieldGroup className={registerStyles.registerFieldGroup}>
        <Field className={registerStyles.registerField} data-invalid={nameInvalid || undefined}>
          <FieldLabel className={registerStyles.registerFieldLabel} htmlFor="mcp-secret-name">{t("mcp.secretName")}</FieldLabel>
          <Input
            ref={nameRef}
            id="mcp-secret-name"
            className={registerStyles.registerInput}
            value={name}
            aria-invalid={nameInvalid || undefined}
            placeholder={t("mcp.secretNamePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
          {nameInvalid ? <FieldError>{t("mcp.required")}</FieldError> : null}
        </Field>
        <Field className={registerStyles.registerField} data-invalid={valueInvalid || undefined}>
          <FieldLabel className={registerStyles.registerFieldLabel} htmlFor="mcp-secret-value">{t("mcp.secretValue")}</FieldLabel>
          <Input
            ref={valueRef}
            id="mcp-secret-value"
            className={registerStyles.registerInput}
            type="password"
            value={value}
            aria-invalid={valueInvalid || undefined}
            placeholder={t("mcp.secretValuePlaceholder")}
            onChange={(e) => setValue(e.target.value)}
          />
          <FieldDescription className={registerStyles.registerFieldHint}>{t("mcp.secretValueHint")}</FieldDescription>
          {valueInvalid ? <FieldError>{t("mcp.required")}</FieldError> : null}
        </Field>
        </FieldGroup>
        <div className={registerStyles.registerFormActions}>
          <Button ref={createSecretRef} variant="default" type="submit" className={registerStyles.registerSubmit} disabled={creating || busy !== null} aria-busy={creating}>
            {creating ? <><Spinner aria-hidden="true" />{t("mcp.secretCreating")}</> : t("mcp.secretCreate")}
          </Button>
        </div>
      </form>

      {error ? (
        <Alert variant="destructive" className={panelStyles.feedback}>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {secrets.length === 0 ? (
        <p className={panelStyles.hint}>{t("mcp.secretsEmpty")}</p>
      ) : (
        <ul className={listStyles.list}>
          {secrets.map((secret) => (
            <li key={secret.handle} className={listStyles.item} data-testid="mcp-secret">
              <div className={listStyles.itemMain}>
                <div className={listStyles.itemHead}>
                  <span className={listStyles.name}>{secret.name}</span>
                </div>
                <p className={listStyles.meta}>
                  {t("mcp.secretCreatedAt", { date: new Date(secret.createdAt).toLocaleDateString(locale) })}
                </p>
              </div>
              <div className={listStyles.itemActions}>
                {confirmingDelete === secret.handle ? (
                  <span className={listStyles.confirmRow}>
                    <Button
                      variant="destructive"
                      type="button"
                      className={listStyles.confirmYes}
                      ref={(element) => { secretConfirmRefs.current[secret.handle] = element }}
                      aria-label={`${t("mcp.secretDeleteConfirm")} ${secret.name}`}
                      disabled={busy !== null || creating}
                      aria-busy={busy === secret.handle}
                      onClick={() => {
                        setConfirmingDelete(null)
                        void onDelete(secret).then(() => {
                          window.requestAnimationFrame(() => createSecretRef.current?.focus())
                        })
                      }}
                    >
                      {busy === secret.handle ? <><Spinner aria-hidden="true" />{t("mcp.secretDeleteConfirm")}</> : t("mcp.secretDeleteConfirm")}
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      className={listStyles.confirmNo}
                      disabled={busy !== null || creating}
                      aria-busy={busy === secret.handle}
                      aria-label={`${t("mcp.cancel")} ${secret.name}`}
                      onClick={() => {
                        setConfirmingDelete(null)
                        window.requestAnimationFrame(() => secretDeleteTriggerRefs.current[secret.handle]?.focus())
                      }}
                    >
                      {t("mcp.cancel")}
                    </Button>
                  </span>
                ) : (
                  <Button variant="ghost"
                    type="button"
                    className={listStyles.dangerGhost}
                    ref={(element) => { secretDeleteTriggerRefs.current[secret.handle] = element }}
                    disabled={busy !== null || creating}
                    aria-busy={busy === secret.handle}
                    aria-label={`${t("mcp.secretDelete")} ${secret.name}`}
                    onClick={() => setConfirmingDelete(secret.handle)}
                  >
                    {t("mcp.secretDelete")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
