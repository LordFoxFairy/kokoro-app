"use client"

import { Check, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useLocale } from "@/i18n/context"
import styles from "./scheduled-task-editor.module.css"

type DaySelectionProps = { value: number[]; onChange: (value: number[]) => void; monthly?: boolean }

/** The menu stays open for multiple selections; model values remain calendar facts. */
export function ScheduledTaskDaysField({ value, onChange, monthly = false }: DaySelectionProps) {
  const { locale, t } = useLocale()
  const days = monthly ? Array.from({ length: 31 }, (_, index) => index + 1) : [1, 2, 3, 4, 5, 6, 0]
  const format = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" })
  const label = (day: number) =>
    monthly ? t("scheduled.dayOfMonth", { day }) : format.format(new Date(Date.UTC(2000, 0, 2 + day)))
  const selected = days.filter((day) => value.includes(day))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={styles.daysTrigger}
          aria-label={t(monthly ? "scheduled.monthDays" : "scheduled.weekday")}
        >
          <span>
            {selected.length
              ? selected.map(label).join("、")
              : t(monthly ? "scheduled.selectMonthDays" : "scheduled.selectWeekday")}
          </span>
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className={styles.daysMenu} align="start">
        {days.map((day) => (
          <DropdownMenuItem
            key={day}
            role="menuitemcheckbox"
            aria-checked={value.includes(day)}
            onSelect={(event) => {
              event.preventDefault()
              onChange(
                value.includes(day)
                  ? value.filter((item) => item !== day)
                  : [...value, day].sort((left, right) => left - right),
              )
            }}
          >
            {label(day)}
            {value.includes(day) ? <Check className={styles.dayCheck} aria-hidden="true" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
