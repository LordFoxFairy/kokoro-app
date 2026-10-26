"use client"

import { useId, type Dispatch, type SetStateAction } from "react"
import { Plus, Rss, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { scheduledRssFeedUrlSchema, scheduledRssFields, scheduledRssOperators, type ScheduledRssCondition } from "@/contract/scheduled"
import { useT } from "@/i18n/context"
import type { ScheduledTaskEditorState } from "./scheduled-task-editor-state"
import styles from "./scheduled-task-editor.module.css"

type Props = { state: ScheduledTaskEditorState; setState: Dispatch<SetStateAction<ScheduledTaskEditorState>> }
const fieldKeys = { title: "scheduled.rssFieldTitle", summary: "scheduled.rssFieldSummary", content: "scheduled.rssFieldContent", author: "scheduled.rssFieldAuthor", category: "scheduled.rssFieldCategory", link: "scheduled.rssFieldLink", domain: "scheduled.rssFieldDomain" } as const
const operatorKeys = { contains: "scheduled.rssContains", not_contains: "scheduled.rssNotContains", equals: "scheduled.rssEquals", not_equals: "scheduled.rssNotEquals", starts_with: "scheduled.rssStartsWith", not_starts_with: "scheduled.rssNotStartsWith", ends_with: "scheduled.rssEndsWith", not_ends_with: "scheduled.rssNotEndsWith", is_empty: "scheduled.rssIsEmpty", is_not_empty: "scheduled.rssIsNotEmpty" } as const
const newCondition = (): ScheduledRssCondition => ({ field: "title", operator: "contains", value: "" })

export function ScheduledTaskRssFields({ state, setState }: Props) {
  const t = useT(), id = useId()
  const invalid = state.feedUrl !== "" && !scheduledRssFeedUrlSchema.safeParse(state.feedUrl).success
  function updateGroup(index: number, group: ScheduledRssCondition[]) {
    setState(current => ({ ...current, conditions: group.length ? current.conditions.map((old, i) => i === index ? group : old) : current.conditions.filter((_, i) => i !== index) }))
  }
  return <div className={styles.rssFields}>
    <label htmlFor={id}><Rss aria-hidden="true" />{t("scheduled.rssFeedUrl")}</label>
    <Input id={id} type="url" value={state.feedUrl} aria-invalid={invalid || undefined} aria-describedby={`${id}-hint`} onChange={event => setState(current => ({ ...current, feedUrl: event.target.value }))} placeholder="https://…" />
    <p id={`${id}-hint`} className={styles.rssHint}>{t(invalid ? "scheduled.rssInvalidUrl" : "scheduled.rssDescription")}</p>
    <p className={styles.rssHint}>{t("scheduled.rssConditionsHint")}</p>
    {state.conditions.map((group, index) => <div key={index}>
      {index > 0 ? <p className={styles.rssOr}>{t("scheduled.rssOr")}</p> : null}
      <fieldset className={styles.rssGroup} aria-label={t("scheduled.rssGroup", { number: index + 1 })}>
        <legend>{t("scheduled.rssGroup", { number: index + 1 })}</legend>
        {group.map((clause, clauseIndex) => <div key={clauseIndex}>
          {clauseIndex > 0 ? <p className={styles.rssAnd}>{t("scheduled.rssAnd")}</p> : null}
          <RssCondition clause={clause} number={clauseIndex + 1} onChange={next => updateGroup(index, group.map((old, i) => i === clauseIndex ? next : old))} onRemove={() => updateGroup(index, group.filter((_, i) => i !== clauseIndex))} />
        </div>)}
        <Button type="button" variant="outline" disabled={group.length >= 16} onClick={() => updateGroup(index, [...group, newCondition()])}><Plus aria-hidden="true" />{t("scheduled.rssAddCondition")}</Button>
      </fieldset>
    </div>)}
    <Button type="button" variant="outline" disabled={state.conditions.length >= 8} onClick={() => setState(current => ({ ...current, conditions: [...current.conditions, [newCondition()]] }))}><Plus aria-hidden="true" />{t("scheduled.rssAddGroup")}</Button>
  </div>
}

function RssCondition({ clause, number, onChange, onRemove }: { clause: ScheduledRssCondition; number: number; onChange: (clause: ScheduledRssCondition) => void; onRemove: () => void }) {
  const t = useT(), hintId = useId()
  const empty = clause.operator === "is_empty" || clause.operator === "is_not_empty"
  const tooLong = new TextEncoder().encode(clause.value ?? "").length > 1024
  return <div className={styles.rssClause}>
    <Select value={clause.field} onValueChange={field => { const parsed = scheduledRssFields.find(item => item === field); if (parsed) onChange({ ...clause, field: parsed }) }}>
      <SelectTrigger aria-label={t("scheduled.rssField")}><SelectValue /></SelectTrigger><SelectContent>{scheduledRssFields.map(field => <SelectItem key={field} value={field}>{t(fieldKeys[field])}</SelectItem>)}</SelectContent>
    </Select>
    <Select value={clause.operator} onValueChange={operator => {
      const parsed = scheduledRssOperators.find(item => item === operator)
      if (parsed) onChange(parsed === "is_empty" || parsed === "is_not_empty" ? { field: clause.field, operator: parsed } : { ...clause, operator: parsed, value: clause.value ?? "" })
    }}><SelectTrigger aria-label={t("scheduled.rssOperator")}><SelectValue /></SelectTrigger><SelectContent>{scheduledRssOperators.map(operator => <SelectItem key={operator} value={operator}>{t(operatorKeys[operator])}</SelectItem>)}</SelectContent></Select>
    {!empty ? <Input aria-label={t("scheduled.rssValue")} value={clause.value ?? ""} aria-invalid={tooLong || undefined} aria-describedby={hintId} onChange={event => onChange({ ...clause, value: event.target.value })} /> : null}
    <Button type="button" variant="ghost" size="icon-sm" aria-label={t("scheduled.rssRemoveCondition", { number })} onClick={onRemove}><Trash2 aria-hidden="true" /></Button>
    {!empty ? <p id={hintId} className={styles.rssValueHint}>{t("scheduled.rssValueHint")}</p> : null}
  </div>
}
