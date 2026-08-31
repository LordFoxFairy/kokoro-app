"use client"

import { ChevronRight, FileText, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

import styles from "./kokoro-project-workspace.module.css"

type ContextCardAction = {
  label: string
  icon: LucideIcon
  trailingIcon?: LucideIcon
  statusDot?: boolean
}

export type ProjectContextSectionProps = {
  title: string
  description?: string
  emptyLabel?: string
  action?: string
  actionIcon?: LucideIcon
  actionIconOnly?: boolean
  icon?: LucideIcon
  actions?: readonly ContextCardAction[]
  footerAction?: ContextCardAction
  emptyVisual?: ReactNode
  showChevron?: boolean
  onClick: () => void
}

type ProjectContextCardProps = ProjectContextSectionProps & {
  kind: "resources" | "skills" | "websites" | "scheduled"
}

export function ProjectContextSection({
  title,
  description,
  emptyLabel,
  action,
  actionIcon,
  actionIconOnly = false,
  icon: Icon = FileText,
  actions,
  footerAction,
  emptyVisual,
  showChevron = false,
  onClick,
}: ProjectContextSectionProps) {
  const ActionIcon = actionIcon ?? Icon
  const FooterIcon = footerAction?.icon

  return (
    <>
      <CardHeader className={styles.cardHeader}>
        <CardTitle className={styles.cardTitle}>
          {showChevron ? (
            <Button type="button" variant="ghost" size="sm" className={styles.cardTitleAction} onClick={onClick}>
              <span className={styles.cardTitleText}>{title}</span>
              <ChevronRight data-icon="inline-end" aria-hidden="true" />
            </Button>
          ) : <span className={styles.cardTitleText}>{title}</span>}
        </CardTitle>
        {action ? actionIconOnly ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={action}
            title={action}
            onClick={onClick}
          >
            <ActionIcon aria-hidden="true" />
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={onClick}>
            <ActionIcon data-icon="inline-start" aria-hidden="true" />
            {action}
          </Button>
        ) : null}
      </CardHeader>
      {description ? <CardContent className={styles.cardDescription}>{description}</CardContent> : null}
      {emptyLabel ? <CardContent className={styles.cardEmpty}>{emptyLabel}</CardContent> : null}
      {emptyVisual ? <div className={styles.emptyVisual}>{emptyVisual}</div> : null}
      {actions ? (
        <CardFooter className={styles.cardActions}>
          {actions.map(({ label, icon: ActionIcon, trailingIcon: TrailingIcon, statusDot }) => (
            <Button key={label} type="button" variant="outline" size="sm" onClick={onClick}>
              <ActionIcon data-icon="inline-start" aria-hidden="true" />
              {label}
              {statusDot ? <span className={styles.actionStatusDot} aria-hidden="true" /> : null}
              {TrailingIcon ? <TrailingIcon data-icon="inline-end" aria-hidden="true" /> : null}
            </Button>
          ))}
        </CardFooter>
      ) : null}
      {footerAction ? (
        <CardFooter className={styles.cardFooter}>
          <Button type="button" variant="outline" size="sm" onClick={onClick}>
            {FooterIcon ? <FooterIcon data-icon="inline-start" aria-hidden="true" /> : null}
            {footerAction.label}
          </Button>
        </CardFooter>
      ) : null}
    </>
  )
}

export function ProjectContextCard({ kind, ...section }: ProjectContextCardProps) {
  return (
    <Card className={styles.contextCard} data-context-kind={kind}>
      <ProjectContextSection {...section} />
    </Card>
  )
}

export type { ProjectContextCardProps }
