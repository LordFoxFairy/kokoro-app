import { ChevronDown, Lock, Sparkles, Zap } from "lucide-react"

import type { AgentMode } from "@/core/conversations"
import type { AgentCandidate, ModelCandidate } from "@/contract/http"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"

import { ComposerMenu } from "./composer-menu"
import { isAgentMode, modeOptions } from "./mode-options"
import { modelLabel } from "./composer-model"
import styles from "./composer-controls.module.css"

type ComposerSelectorsProps = {
  mode: AgentMode
  modeLabel: string
  onModeChange: (mode: AgentMode) => void
  modeLocked: boolean
  agents: readonly AgentCandidate[]
  currentAgent: AgentCandidate | undefined
  currentAgentName: string
  onAgentChange: (name: string) => void
  agentLocked: boolean
  models: readonly ModelCandidate[]
  hideModelSelector: boolean
  currentModel: ModelCandidate | undefined
  currentSelector: string | undefined
  currentModelTriggerLabel: string
  currentModelNewBadgeLabel: string | null
  currentModelTriggerTitle: string
  onModelChange: (selector: string | null) => void
  modelLocked: boolean
}

export function ComposerSelectors({ mode, modeLabel, onModeChange, modeLocked, agents, currentAgent, currentAgentName, onAgentChange, agentLocked, models, hideModelSelector, currentModel, currentSelector, currentModelTriggerLabel, currentModelNewBadgeLabel, currentModelTriggerTitle, onModelChange, modelLocked }: ComposerSelectorsProps) {
  const t = useT()
  const ModeIcon = mode === "thinking" ? Sparkles : Zap
  return (
    <div className={styles.cluster} data-slot="composer-selector-cluster">
      {agents.length > 1 && currentAgent ? (agentLocked ? (
        <Button type="button" variant="ghost" className={`${styles.mode} ${styles.modelSelector} ${styles.modeLocked}`} data-composer-control="agent" disabled aria-label={t("composer.agentLocked", { agent: currentAgent.name })} title={`${currentAgent.name} — ${t("composer.agentLockedTitle")}`}>
          <span>{currentAgent.name}</span><Lock className={styles.lock} data-icon="inline-end" />
        </Button>
      ) : (
        <ComposerMenu triggerClassName={`${styles.mode} ${styles.modelSelector}`} dataComposerControl="agent" triggerLabel={t("composer.agentSwitch")} triggerTitle={currentAgent.name} trigger={<><span>{currentAgent.name}</span><ChevronDown className={styles.chevron} data-icon="inline-end" /></>} options={agents.map((agent) => ({ key: agent.name, label: agent.name, hint: agent.description }))} selectedKey={currentAgentName} onSelect={onAgentChange} align="start" />
      )) : null}
      {!hideModelSelector && models.length > 0 && currentModel ? (modelLocked ? (
        <Button type="button" variant="ghost" className={`${styles.mode} ${styles.modeLocked}`} data-composer-control="model" disabled aria-label={t("composer.modelLocked", { model: modelLabel(currentModel) })} title={`${modelLabel(currentModel)} — ${t("composer.modelLockedTitle")}`}>
          <span>{modelLabel(currentModel)}</span><Lock className={styles.lock} data-icon="inline-end" />
        </Button>
      ) : (
        <ComposerMenu triggerClassName={styles.mode ?? ""} dataComposerControl="model" triggerLabel={t("composer.modelSwitch")} triggerTitle={currentModelTriggerTitle} trigger={<><span data-slot={currentModelNewBadgeLabel ? "new-model-name" : undefined}>{currentModelTriggerLabel}</span>{currentModelNewBadgeLabel ? <span className={styles.newModelBadge} data-slot="new-model-badge" aria-hidden="true">{currentModelNewBadgeLabel}</span> : null}<ChevronDown className={styles.chevron} data-icon="inline-end" /></>} options={models.map((model) => ({ key: `${model.provider}:${model.name}`, label: modelLabel(model) }))} selectedKey={currentSelector ?? ""} onSelect={onModelChange} align="start" />
      )) : null}
      {modeLocked ? (
        <Button variant="ghost" type="button" className={`${styles.mode} ${styles.modeSelect} ${styles.modeLocked}`} data-composer-control="mode" disabled aria-label={t("composer.modeLocked", { mode: modeLabel })} title={`${modeLabel} — ${t("composer.modeLockedTitle")}`}>
          <ModeIcon className={styles.modeGlyph} data-icon="inline-start" /><span>{modeLabel}</span><Lock className={styles.lock} data-icon="inline-end" />
        </Button>
      ) : (
        <ComposerMenu triggerClassName={`${styles.mode} ${styles.modeSelect}`} dataComposerControl="mode" triggerLabel={t("composer.modeSwitch")} triggerTitle={modeLabel} trigger={<><ModeIcon className={styles.modeGlyph} data-icon="inline-start" /><span>{modeLabel}</span><ChevronDown className={styles.chevron} data-icon="inline-end" /></>} options={modeOptions(t)} selectedKey={mode} onSelect={(key) => { if (isAgentMode(key)) onModeChange(key) }} align="start" />
      )}
    </div>
  )
}
