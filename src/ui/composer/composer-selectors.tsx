import { ChevronDown, Lock, Sparkles, Zap } from "lucide-react"

import type { AgentMode } from "@/core/conversations"
import type { ModelCandidate } from "@/contract/http"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"

import { ComposerMenu } from "./composer-menu"
import { isAgentMode, modeOptions } from "./mode-options"
import { modelLabel, modelSelector } from "./composer-model"
import styles from "./composer-controls.module.css"

type ComposerSelectorsProps = {
  mode: AgentMode
  modeLabel: string
  onModeChange: (mode: AgentMode) => void
  modeLocked: boolean
  models: readonly ModelCandidate[]
  modelCatalogStatus: "loading" | "ready" | "error"
  onRetryModels: (() => void) | undefined
  hideModelSelector: boolean
  currentModel: ModelCandidate | undefined
  currentSelector: string | undefined
  currentModelTriggerLabel: string
  currentModelNewBadgeLabel: string | null
  currentModelTriggerTitle: string
  onModelChange: (selector: string | null) => void
  modelLocked: boolean
}

export function ComposerSelectors({ mode, modeLabel, onModeChange, modeLocked, models, modelCatalogStatus, hideModelSelector, currentModel, currentSelector, currentModelTriggerLabel, currentModelNewBadgeLabel, currentModelTriggerTitle, onModelChange, modelLocked }: ComposerSelectorsProps) {
  const t = useT()
  const ModeIcon = mode === "thinking" ? Sparkles : Zap
  return (
    <div className={styles.cluster} data-slot="composer-selector-cluster" aria-busy={!hideModelSelector && modelCatalogStatus === "loading"}>
      {!hideModelSelector && modelCatalogStatus === "error" ? <span className="sr-only" role="status">{t("settings.modelCatalogFailed")}</span> : null}
      {!hideModelSelector && models.length > 0 && currentModel ? (modelLocked ? (
        <Button type="button" variant="ghost" className={`${styles.mode} ${styles.modeLocked}`} data-composer-control="model" disabled aria-label={t("composer.modelLocked", { model: modelLabel(currentModel) })} title={`${modelLabel(currentModel)} — ${t("composer.modelLockedTitle")}`}>
          <span>{modelLabel(currentModel)}</span><Lock className={styles.lock} data-icon="inline-end" />
        </Button>
      ) : (
        <ComposerMenu triggerClassName={styles.mode ?? ""} dataComposerControl="model" triggerLabel={t("composer.modelSwitch")} triggerTitle={currentModelTriggerTitle} trigger={<><span data-slot={currentModelNewBadgeLabel ? "new-model-name" : undefined}>{currentModelTriggerLabel}</span>{currentModelNewBadgeLabel ? <span className={styles.newModelBadge} data-slot="new-model-badge" aria-hidden="true">{currentModelNewBadgeLabel}</span> : null}<ChevronDown className={styles.chevron} data-icon="inline-end" /></>} options={models.map((model) => ({ key: modelSelector(model), label: modelLabel(model) }))} selectedKey={currentSelector ?? ""} onSelect={onModelChange} align="start" />
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
