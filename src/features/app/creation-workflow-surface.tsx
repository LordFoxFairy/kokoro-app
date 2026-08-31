"use client"

import { ChevronDown, ChevronRight, LayoutTemplate } from "lucide-react"
import Image from "next/image"

import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"
import type { CreationIntent } from "@/ui/composer/creation-intent-pill"
import type { MessageKey } from "@/i18n/messages"

import styles from "./kokoro-welcome.module.css"

type CreationWorkflowSurfaceProps = {
  intent: Extract<CreationIntent, "presentation" | "design" | "game">
  onPrompt?: (prompt: string, intent?: CreationIntent) => void
}

type WorkflowCard = {
  title: MessageKey
  description: MessageKey
  prompt: MessageKey
  image: string
}

const presentationPrompts: ReadonlyArray<{ label: MessageKey; prompt: MessageKey }> = [
  { label: "firstSite.presentationExampleStatus", prompt: "firstSite.presentationExampleStatus" },
  { label: "firstSite.presentationExampleMarket", prompt: "firstSite.presentationExampleMarket" },
  { label: "firstSite.presentationExampleStrategy", prompt: "firstSite.presentationExampleStrategy" },
  { label: "firstSite.presentationExampleCompetitor", prompt: "firstSite.presentationExampleCompetitor" },
]

const presentationTemplates: ReadonlyArray<{ label: MessageKey; image: string }> = [
  { label: "firstSite.presentationTemplateBriefing", image: "/site-assets/project-website.webp" },
  { label: "firstSite.presentationTemplateReport", image: "/site-assets/game-creation.png" },
  { label: "firstSite.presentationTemplatePlan", image: "/integrations/zapier.webp" },
]

const designCards: ReadonlyArray<WorkflowCard> = [
  {
    title: "firstSite.designCardData",
    description: "firstSite.designCardDataDescription",
    prompt: "firstSite.designCardDataPrompt",
    image: "/site-assets/project-website.webp",
  },
  {
    title: "firstSite.designCardMenu",
    description: "firstSite.designCardMenuDescription",
    prompt: "firstSite.designCardMenuPrompt",
    image: "/site-assets/game-creation.png",
  },
  {
    title: "firstSite.designCardWearable",
    description: "firstSite.designCardWearableDescription",
    prompt: "firstSite.designCardWearablePrompt",
    image: "/integrations/slack.svg",
  },
  {
    title: "firstSite.designCardSaas",
    description: "firstSite.designCardSaasDescription",
    prompt: "firstSite.designCardSaasPrompt",
    image: "/integrations/zapier.webp",
  },
]

const gameCards: ReadonlyArray<WorkflowCard> = [
  {
    title: "scenario.dataTitle",
    description: "firstSite.starterDataDescription",
    prompt: "scenario.dataPrompt",
    image: "/site-assets/project-website.webp",
  },
  {
    title: "scenario.codeTitle",
    description: "firstSite.starterCodeDescription",
    prompt: "scenario.codePrompt",
    image: "/site-assets/game-creation.png",
  },
  {
    title: "scenario.planTitle",
    description: "firstSite.starterPlanDescription",
    prompt: "scenario.planPrompt",
    image: "/integrations/zapier.webp",
  },
  {
    title: "scenario.summaryTitle",
    description: "firstSite.starterSummaryDescription",
    prompt: "scenario.summaryPrompt",
    image: "/integrations/slack.svg",
  },
]

function PromptCard({ label, prompt, onPrompt, intent }: {
  label: MessageKey
  prompt: MessageKey
  onPrompt?: CreationWorkflowSurfaceProps["onPrompt"]
  intent: CreationIntent
}) {
  const t = useT()
  return (
    <Button
      type="button"
      variant="ghost"
      className={styles.presentationPrompt}
      onClick={() => onPrompt?.(t(prompt), intent)}
    >
      <span>{t(label)}</span>
      <ChevronRight aria-hidden="true" />
    </Button>
  )
}

function PresentationWorkflow({ onPrompt }: Pick<CreationWorkflowSurfaceProps, "onPrompt">) {
  const t = useT()
  return (
    <div className={styles.workflowStack}>
      <section className={styles.workflowSection} aria-labelledby="kokoro-presentation-prompts-heading">
        <h2 id="kokoro-presentation-prompts-heading">{t("firstSite.presentationExamples")}</h2>
        <div className={styles.presentationPromptGrid}>
          {presentationPrompts.map(({ label, prompt }) => (
            <PromptCard key={label} label={label} prompt={prompt} onPrompt={onPrompt} intent="presentation" />
          ))}
        </div>
      </section>
      <section className={styles.workflowSection} aria-labelledby="kokoro-presentation-templates-heading">
        <div className={styles.workflowSectionHeader}>
          <h2 id="kokoro-presentation-templates-heading">{t("firstSite.presentationTemplates")}</h2>
          <Button type="button" variant="outline" size="sm" className={styles.templateFilter}>
            <LayoutTemplate aria-hidden="true" />
            <span>8 - 12</span>
            <ChevronDown aria-hidden="true" />
          </Button>
        </div>
        <div className={styles.presentationTemplateGrid}>
          {presentationTemplates.map(({ label, image }) => (
            <Button key={label} type="button" variant="ghost" className={styles.presentationTemplate}>
              <Image src={image} alt="" width={120} height={72} />
              <span>{t(label)}</span>
            </Button>
          ))}
        </div>
      </section>
    </div>
  )
}

function CardWorkflow({ cards, intent, onPrompt }: { cards: ReadonlyArray<WorkflowCard>; intent: CreationIntent; onPrompt?: CreationWorkflowSurfaceProps["onPrompt"] }) {
  const t = useT()
  return (
    <section className={styles.workflowStack} aria-label={t("firstSite.getStarted")}>
      <div className={styles.workflowSection}>
        <h2>{t("firstSite.getStarted")}</h2>
        <div className={styles.workflowCardGrid}>
          {cards.map(({ title, description, prompt, image }) => (
            <Button
              key={title}
              type="button"
              variant="ghost"
              className={styles.desktopSuggestion}
              onClick={() => onPrompt?.(t(prompt), intent)}
            >
              <span className={styles.desktopSuggestionCopy}>
                <span className={styles.desktopSuggestionTitle}>
                  <span>{t(title)}</span>
                  <ChevronRight aria-hidden="true" />
                </span>
                <span className={styles.desktopSuggestionDescription}>{t(description)}</span>
              </span>
              <span className={styles.desktopSuggestionMedia} aria-hidden="true">
                <Image src={image} alt="" width={68} height={90} />
              </span>
            </Button>
          ))}
        </div>
      </div>
    </section>
  )
}

export function CreationWorkflowSurface({ intent, onPrompt }: CreationWorkflowSurfaceProps) {
  if (intent === "presentation") return <PresentationWorkflow onPrompt={onPrompt} />
  return <CardWorkflow cards={intent === "design" ? designCards : gameCards} intent={intent} onPrompt={onPrompt} />
}
