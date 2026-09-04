import { type ChangeEvent, type FormEvent, type KeyboardEvent, type RefObject, type ReactNode, useEffect, useRef } from "react"

import type { AgentMode } from "@/core/conversations"
import type { AgentCandidate, ModelCandidate } from "@/contract/http"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/i18n/context"

import { CreationIntentPill, type CreationIntent } from "./creation-intent-pill"
import { ComposerEnvironment } from "./composer-environment"
import { modelLabel, modelNewBadgeLabel, modelSelector, modelTriggerLabel } from "./composer-model"
import { ComposerPinnedSkills } from "./composer-pinned-skills"
import { ComposerSelectors } from "./composer-selectors"
import { ComposerSubmitAction } from "./composer-submit-action"
import { ComposerVoiceActions } from "./composer-voice-actions"
import { modeLabelText } from "./mode-options"
import { useVoiceInput } from "./use-voice-input"
import styles from "./composer.module.css"

export const MAX_INPUT_LENGTH = 4000

function resizeComposer(node: HTMLTextAreaElement) {
  node.style.height = "auto"
  node.style.height = `${node.scrollHeight}px`
}

export type ComposerProps = {
  draft: string
  onDraftChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isStreaming: boolean
  isAwaitingApproval?: boolean
  canSend: boolean
  onStop: () => void
  composerRef: RefObject<HTMLTextAreaElement | null>
  mode: AgentMode
  onModeChange: (mode: AgentMode) => void
  modeLocked: boolean
  pinnedSkills: readonly string[]
  onUnpinSkill: (name: string) => void
  models: readonly ModelCandidate[]
  hideModelSelector?: boolean
  preferredModelSelector?: string
  selectedModel: string | null
  onModelChange: (selector: string | null) => void
  modelLocked: boolean
  emptyWorkspace?: boolean
  placeholder?: string
  agents: readonly AgentCandidate[]
  selectedAgent: string | null
  onAgentChange: (name: string) => void
  agentLocked: boolean
  leadingActions?: ReactNode
  creationIntent?: CreationIntent
  onCreationIntentDismiss: () => void
  environmentLabel?: string
  projectWorkspace?: boolean
  environmentSelectorPlacement?: "controls" | "floating"
  voicePreview?: boolean
}

function creationLabel(t: ReturnType<typeof useT>, intent: CreationIntent | undefined): string | null {
  if (intent === "website") return t("firstSite.websites")
  if (intent === "presentation") return t("firstSite.presentationSelected")
  if (intent === "design") return t("firstSite.promptDesign")
  if (intent === "game") return t("firstSite.promptGame")
  if (intent === "app") return t("settings.deploymentAppIntent")
  return null
}

export function Composer({ draft, onDraftChange, onKeyDown, onSubmit, isStreaming, isAwaitingApproval = false, canSend, onStop, composerRef, mode, onModeChange, modeLocked, pinnedSkills, onUnpinSkill, models, hideModelSelector = false, preferredModelSelector, selectedModel, onModelChange, modelLocked, emptyWorkspace = false, placeholder, agents, selectedAgent, onAgentChange, agentLocked, leadingActions, creationIntent, onCreationIntentDismiss, environmentLabel = "Desktop", projectWorkspace = false, environmentSelectorPlacement = "controls", voicePreview = false }: ComposerProps) {
  const t = useT()
  const modeLabel = modeLabelText(t, mode)
  const creationIntentLabel = creationLabel(t, creationIntent)
  const voiceInput = useVoiceInput({ draft, onDraftChange, preview: voicePreview, previewTranscript: t("composer.voicePreviewTranscript") })
  const defaultModel = models.find((model) => model.is_default) ?? models[0]
  const currentModel = models.find((model) => modelSelector(model) === selectedModel) ?? models.find((model) => modelSelector(model) === preferredModelSelector) ?? defaultModel
  const currentSelector = currentModel ? modelSelector(currentModel) : undefined
  const currentModelTriggerLabel = currentModel ? modelTriggerLabel(currentModel) : ""
  const currentModelNewBadgeLabel = currentModel ? modelNewBadgeLabel(currentModel) : null
  const currentModelTriggerTitle = currentModelNewBadgeLabel ? `${currentModelTriggerLabel} ${currentModelNewBadgeLabel}` : currentModel ? modelLabel(currentModel) : ""
  const defaultAgent = agents.find((agent) => agent.is_default) ?? agents[0]
  const currentAgent = agents.find((agent) => agent.name === selectedAgent) ?? defaultAgent
  const preferredModelAppliedRef = useRef<string | null>(null)

  useEffect(() => {
    const preferredAvailable = preferredModelSelector !== undefined && models.some((model) => modelSelector(model) === preferredModelSelector)
    const selectedAvailable = selectedModel !== null && models.some((model) => modelSelector(model) === selectedModel)
    if (preferredAvailable && selectedModel !== preferredModelSelector && (!selectedAvailable || selectedModel === preferredModelAppliedRef.current)) {
      preferredModelAppliedRef.current = preferredModelSelector
      onModelChange(preferredModelSelector)
      return
    }
    if (models.length > 0 && selectedModel !== null && !selectedAvailable) {
      preferredModelAppliedRef.current = null
      onModelChange(null)
      return
    }
    if (preferredModelSelector === undefined && preferredModelAppliedRef.current !== null && selectedModel === preferredModelAppliedRef.current) {
      preferredModelAppliedRef.current = null
      onModelChange(null)
    }
  }, [models, onModelChange, preferredModelSelector, selectedModel])

  useEffect(() => {
    if (composerRef.current) resizeComposer(composerRef.current)
  }, [composerRef, draft])

  return (
    <div className={styles.wrap} data-slot="composer-wrap" data-desktop-web="true" data-empty-workspace={emptyWorkspace ? "true" : undefined} data-project-workspace={projectWorkspace ? "true" : undefined} data-creation-intent={creationIntent}>
      <ComposerPinnedSkills skills={pinnedSkills} onUnpinSkill={onUnpinSkill} />
      <form className={styles.composer} aria-label={t("composer.editArea")} aria-busy={isStreaming} data-state={isStreaming ? "running" : "idle"} data-voice-state={voiceInput.state === "listening" || voiceInput.state === "transcribing" ? voiceInput.state : undefined} onSubmit={onSubmit}>
        {projectWorkspace && environmentSelectorPlacement === "floating" ? <ComposerEnvironment label={environmentLabel} floating /> : null}
        <Textarea ref={composerRef} className={styles.input} data-slot="composer-input" data-settings-return-target="composer" aria-label={t("composer.inputAria")} placeholder={placeholder ?? t("composer.placeholder")} rows={1} maxLength={MAX_INPUT_LENGTH} value={draft} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => { onDraftChange(event.target.value); resizeComposer(event.currentTarget) }} onKeyDown={onKeyDown} />
        <div className={styles.controls} data-testid="composer-controls" data-slot="composer-controls">
          {leadingActions ? <div className={styles.leadingActions}>{leadingActions}</div> : null}
          {(emptyWorkspace || models.length === 0) && environmentSelectorPlacement === "controls" ? <ComposerEnvironment label={environmentLabel} /> : null}
          {creationIntent ? <CreationIntentPill intent={creationIntent} label={creationIntentLabel ?? ""} dismissLabel={t("composer.dismissCreationIntent", { label: creationIntentLabel ?? "" })} onDismiss={onCreationIntentDismiss} /> : null}
          <ComposerSelectors mode={mode} modeLabel={modeLabel} onModeChange={onModeChange} modeLocked={modeLocked} agents={agents} currentAgent={currentAgent} currentAgentName={currentAgent?.name ?? ""} onAgentChange={onAgentChange} agentLocked={agentLocked} models={models} hideModelSelector={hideModelSelector} currentModel={currentModel} currentSelector={currentSelector} currentModelTriggerLabel={currentModelTriggerLabel} currentModelNewBadgeLabel={currentModelNewBadgeLabel} currentModelTriggerTitle={currentModelTriggerTitle} onModelChange={onModelChange} modelLocked={modelLocked} />
          <ComposerVoiceActions emptyWorkspace={emptyWorkspace} projectWorkspace={projectWorkspace} creationIntent={creationIntent} state={voiceInput.state} onToggle={voiceInput.toggle} />
          <ComposerSubmitAction isStreaming={isStreaming} isAwaitingApproval={isAwaitingApproval} canSend={canSend} onStop={onStop} />
        </div>
      </form>
      {modeLocked ? <p className={styles.disclaimer} data-slot="composer-disclaimer">{t("composer.disclaimer")}</p> : null}
    </div>
  )
}
