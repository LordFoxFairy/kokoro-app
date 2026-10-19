"use client"

import { useId, useMemo } from "react"

import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/context"

import { isIanaTimezone } from "../model/scheduled-task"

export function ScheduledTaskTimezoneField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useT()
  const id = useId()
  const zones = useMemo(() => ["UTC", ...Intl.supportedValuesOf("timeZone")], [])
  const valid = isIanaTimezone(value)
  return <Field>
    <FieldLabel htmlFor={id}>{t("scheduled.timezone")}</FieldLabel>
    <Input id={id} list={`${id}-zones`} value={value} onChange={event => onChange(event.target.value)}
      aria-invalid={!valid} aria-describedby={valid ? undefined : `${id}-error`} autoComplete="off" />
    <datalist id={`${id}-zones`}>{zones.map(zone => <option key={zone} value={zone} />)}</datalist>
    {!valid ? <p id={`${id}-error`} role="status">{t("scheduled.invalidTimezone")}</p> : null}
  </Field>
}
