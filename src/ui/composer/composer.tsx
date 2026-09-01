import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  type ReactNode,
  useEffect,
  useRef,
} from "react"
import { ArrowUp, AudioWaveform, ChevronDown, Lock, Mic, Monitor, Sparkles, Square, X, Zap } from "lucide-react"

import type { AgentMode } from "@/core/conversations"
import type { AgentCandidate, ModelCandidate } from "@/contract/http"
import { useT } from "@/i18n/context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import { ComposerMenu } from "./composer-menu"
import { CreationIntentPill, type CreationIntent } from "./creation-intent-pill"
import { isAgentMode, modeLabelText, modeOptions } from "./mode-options"
import { useVoiceInput } from "./use-voice-input"
import styles from "./composer.module.css"

// 输入上限：textarea maxLength 与提交守卫双重把关。
export const MAX_INPUT_LENGTH = 4000

// 自适应高度：归零再贴合 scrollHeight（CSS max-height 硬顶）；jsdom 下 scrollHeight 恒 0 仍不抛错。
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
  /** A paused run is not generating; the stop action cancels the waiting run. */
  isAwaitingApproval?: boolean
  canSend: boolean
  onStop: () => void
  composerRef: RefObject<HTMLTextAreaElement | null>
  // 回应模式：受控于会话。modeLocked 时（已开聊）只读展示、不可切换。
  mode: AgentMode
  onModeChange: (mode: AgentMode) => void
  modeLocked: boolean
  // 固定技能（WEB-SKILLS）：随消息上 wire 为 pinned_skills；chip 可就地取消固定。
  pinnedSkills: readonly string[]
  onUnpinSkill: (name: string) => void
  // 模型候选（MODEL-UX）：空则不渲染选择器；selectedModel=null 时高亮缺省项。
  // 选择随首条消息定死（modelLocked=已开聊）：锁定态只读展示当前模型。
  models: readonly ModelCandidate[]
  /** Site-owned empty surfaces may place model selection in their own topbar. */
  hideModelSelector?: boolean
  /** Empty creation surfaces may choose a synthetic default model per workflow. */
  preferredModelSelector?: string
  selectedModel: string | null
  onModelChange: (selector: string | null) => void
  modelLocked: boolean
  emptyWorkspace?: boolean
  /** The route owns the task context; only its prompt copy changes. */
  placeholder?: string
  // agent 候选（AGENT-PRESET）：单候选（仅 general）不渲染选择器；selectedAgent=null 时高亮缺省（is_default）。
  // 选择随首条消息定死（agentLocked=已开聊）：锁定态只读展示当前 agent。
  agents: readonly AgentCandidate[]
  selectedAgent: string | null
  onAgentChange: (name: string) => void
  agentLocked: boolean
  /** Site/runtime-projected actions that are real in the current surface. */
  leadingActions?: ReactNode
  /** Selected creation context projected by the site shell. */
  creationIntent?: CreationIntent
  /** Clears the selected creation context without changing the current draft. */
  onCreationIntentDismiss: () => void
  /** Runtime-branded, locale-owned environment label; shared UI never hardcodes a site name. */
  environmentLabel?: string
  /** Project workspaces keep the environment label; direct chats use the compact icon control. */
  projectWorkspace?: boolean
  /** Desktop project threads lift the environment affordance above the editor. */
  environmentSelectorPlacement?: "controls" | "floating"
  /** Deterministic browser-free transcription used by the local fixture. */
  voicePreview?: boolean
}

// wire 选择子：与 session resolveRuntime 的 "provider:name" 规约一致。
function modelSelector(model: ModelCandidate): string {
  return `${model.provider}:${model.name}`
}

// 展示名：优先目录 display_name，缺省回落 wire name（保证始终有可读文案）。
function modelLabel(model: ModelCandidate): string {
  return model.display_name ?? model.name
}

function isNewModel(model: ModelCandidate): boolean {
  return model.name.endsWith("-new")
}

// The `-new` suffix is a wire-level marker. Keep it out of the main label so
// the trigger can give the marker its own compact badge without changing the
// catalogue option labels or the model-selection contract.
function modelTriggerLabel(model: ModelCandidate): string {
  const label = modelLabel(model)
  if (!isNewModel(model)) {
    return label
  }

  return label.replace(/\s*(?:[-–—:]\s*)?(?:new|\u65b0)$/iu, "").trim()
    || model.name.replace(/-new$/u, "")
}

function modelNewBadgeLabel(model: ModelCandidate): string | null {
  if (!isNewModel(model)) {
    return null
  }

  // Preserve a localized marker already present in display_name; otherwise
  // fall back to the wire suffix so the badge remains useful without one.
  return modelLabel(model).match(/(?:^|\s)(new|\u65b0)$/iu)?.[1] ?? model.name.slice(-3)
}

export function Composer({
  draft,
  onDraftChange,
  onKeyDown,
  onSubmit,
  isStreaming,
  isAwaitingApproval = false,
  canSend,
  onStop,
  composerRef,
  mode,
  onModeChange,
  modeLocked,
  pinnedSkills,
  onUnpinSkill,
  models,
  hideModelSelector = false,
  preferredModelSelector,
  selectedModel,
  onModelChange,
  modelLocked,
  emptyWorkspace = false,
  placeholder,
  agents,
  selectedAgent,
  onAgentChange,
  agentLocked,
  leadingActions,
  creationIntent,
  onCreationIntentDismiss,
  environmentLabel = "Desktop",
  projectWorkspace = false,
  environmentSelectorPlacement = "controls",
  voicePreview = false,
}: ComposerProps) {
  const t = useT()
  const modeLabel = modeLabelText(t, mode)
  const ModeIcon = mode === "thinking" ? Sparkles : Zap
  const creationIntentLabel = creationIntent === "website"
    ? t("firstSite.websites")
    : creationIntent === "presentation"
      ? t("firstSite.presentationSelected")
      : creationIntent === "design"
        ? t("firstSite.promptDesign")
        : creationIntent === "game"
          ? t("firstSite.promptGame")
          : creationIntent === "app"
            ? t("settings.deploymentAppIntent")
            : null
  const voiceInput = useVoiceInput({
    draft,
    onDraftChange,
    preview: voicePreview,
    previewTranscript: t("composer.voicePreviewTranscript"),
  })
  const voiceActive = voiceInput.state === "listening" || voiceInput.state === "transcribing"
  const voiceStatus = voiceInput.state === "listening"
    ? t("composer.voiceListening")
    : voiceInput.state === "transcribing"
      ? t("composer.voiceTranscribing")
      : voiceInput.state === "error"
        ? t("composer.voiceUnavailable")
        : ""

  // 当前选中模型：selectedModel 命中候选则用之，否则回落缺省项（is_default）。空候选=不渲染选择器。
  const defaultModel = models.find((m) => m.is_default) ?? models[0]
  const currentModel = models.find((m) => modelSelector(m) === selectedModel)
    ?? models.find((m) => modelSelector(m) === preferredModelSelector)
    ?? defaultModel
  const currentSelector = currentModel ? modelSelector(currentModel) : undefined
  const currentModelTriggerLabel = currentModel ? modelTriggerLabel(currentModel) : ""
  const currentModelNewBadgeLabel = currentModel ? modelNewBadgeLabel(currentModel) : null
  const currentModelTriggerTitle = currentModelNewBadgeLabel
    ? `${currentModelTriggerLabel} ${currentModelNewBadgeLabel}`
    : currentModel ? modelLabel(currentModel) : undefined

  // Creation workflows can nominate a model before the first message, but
  // the shell's model selector is the source that the engine reads when it
  // builds the request. Bridge the workflow default into that controlled
  // value only while it is available, and undo only the value this bridge
  // applied when the capsule is dismissed. A user selection always wins.
  const preferredModelAppliedRef = useRef<string | null>(null)
  useEffect(() => {
    const preferredAvailable = preferredModelSelector !== undefined
      && models.some((model) => modelSelector(model) === preferredModelSelector)
    const selectedAvailable = selectedModel !== null
      && models.some((model) => modelSelector(model) === selectedModel)

    if (
      preferredAvailable
      && selectedModel !== preferredModelSelector
      && (!selectedAvailable || selectedModel === preferredModelAppliedRef.current)
    ) {
      preferredModelAppliedRef.current = preferredModelSelector
      onModelChange(preferredModelSelector)
      return
    }

    // An old settings value must not be sent after it disappeared from the
    // catalogue; null restores the server/profile default without picking a
    // different model on the user's behalf.
    if (models.length > 0 && selectedModel !== null && !selectedAvailable) {
      preferredModelAppliedRef.current = null
      onModelChange(null)
      return
    }

    if (
      preferredModelSelector === undefined
      && preferredModelAppliedRef.current !== null
      && selectedModel === preferredModelAppliedRef.current
    ) {
      preferredModelAppliedRef.current = null
      onModelChange(null)
    }
  }, [models, onModelChange, preferredModelSelector, selectedModel])

  // 当前选中 agent：selectedAgent 命中候选则用之，否则回落缺省项（is_default=general）。
  // 单候选（只有 general，无具名预设）=不渲染选择器（无可选项，隐去）。
  const defaultAgent = agents.find((a) => a.is_default) ?? agents[0]
  const currentAgent = agents.find((a) => a.name === selectedAgent) ?? defaultAgent
  const currentAgentName = currentAgent?.name

  // The draft is controlled by the shell and can change without an input
  // event (scenario cards, conversation switching, restored drafts). Keep
  // the textarea geometry in sync for those paths as well as user typing.
  useEffect(() => {
    if (composerRef.current) {
      resizeComposer(composerRef.current)
    }
  }, [composerRef, draft])

  return (
    <div
      className={styles.wrap}
      data-slot="composer-wrap"
      data-desktop-web="true"
      data-empty-workspace={emptyWorkspace ? "true" : undefined}
      data-project-workspace={projectWorkspace ? "true" : undefined}
      data-creation-intent={creationIntent}
    >
      {pinnedSkills.length > 0 ? (
        <div className={styles.pinnedRow} aria-label={t("composer.pinnedAria")}>
          {pinnedSkills.map((name) => (
            <Badge key={name} variant="secondary" className={styles.pinnedChip}>
              <span className={styles.pinnedName} title={name}>{name}</span>
              <Button variant="ghost"
                type="button"
                className={styles.pinnedRemove}
                aria-label={t("composer.pinnedRemove", { name })}
                onClick={() => onUnpinSkill(name)}
              >
                <X data-icon="inline-start" aria-hidden="true" />
              </Button>
            </Badge>
          ))}
        </div>
      ) : null}
      <form
        className={styles.composer}
        aria-label={t("composer.editArea")}
        aria-busy={isStreaming}
        data-state={isStreaming ? "running" : "idle"}
        data-voice-state={voiceActive ? voiceInput.state : undefined}
        onSubmit={onSubmit}
      >
        {projectWorkspace && environmentSelectorPlacement === "floating" ? (
          <span
            className={cn(styles.mode, styles.environmentSelector, styles.floatingEnvironment)}
            role="status"
            aria-label={environmentLabel}
            title={environmentLabel}
            data-slot="floating-environment"
            data-environment-state="static"
          >
            <Monitor className={styles.modeGlyph} data-icon="inline-start" aria-hidden="true" />
            <span>{environmentLabel}</span>
          </span>
        ) : null}
        <Textarea
          ref={composerRef}
          className={styles.input}
          data-settings-return-target="composer"
          aria-label={t("composer.inputAria")}
          placeholder={placeholder ?? t("composer.placeholder")}
          rows={1}
          maxLength={MAX_INPUT_LENGTH}
          value={draft}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
            onDraftChange(event.target.value)
            resizeComposer(event.currentTarget)
          }}
          onKeyDown={onKeyDown}
        />

        {/* 控件行：未接入的附件不占位；语音输入始终保留在同一 32px 槽位，避免录音状态改变布局。 */}
        <div className={styles.controls}>
          {leadingActions ? <div className={styles.leadingActions}>{leadingActions}</div> : null}
          {(emptyWorkspace || models.length === 0) && environmentSelectorPlacement === "controls" ? (
            <span
              className={cn(styles.mode, styles.environmentSelector)}
              role="status"
              aria-label={environmentLabel}
              title={environmentLabel}
              data-environment-state="static"
            >
              <Monitor className={styles.modeGlyph} data-icon="inline-start" aria-hidden="true" />
              <span>{environmentLabel}</span>
            </span>
          ) : null}
          {creationIntent ? (
            <CreationIntentPill
              intent={creationIntent}
              label={creationIntentLabel ?? ""}
              dismissLabel={t("composer.dismissCreationIntent", {
                label: creationIntentLabel ?? "",
              })}
              onDismiss={onCreationIntentDismiss}
            />
          ) : null}
          <div className={styles.cluster}>
            {/* agent 选择器（AGENT-PRESET）：候选来自 namespace profile；单候选（仅 general）不渲染。
                首条消息后锁定为只读展示（与 model 同首条锁语义）。 */}
            {agents.length > 1 && currentAgent ? (
              agentLocked ? (
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(styles.mode, styles.modelSelector, styles.modeLocked)}
                  data-composer-control="agent"
                  disabled
                  aria-label={t("composer.agentLocked", { agent: currentAgent.name })}
                  title={`${currentAgent.name} — ${t("composer.agentLockedTitle")}`}
                >
                  <span>{currentAgent.name}</span>
                  <Lock className={styles.lock} data-icon="inline-end" />
                </Button>
              ) : (
                <ComposerMenu
                  triggerClassName={cn(styles.mode, styles.modelSelector)}
                  dataComposerControl="agent"
                  triggerLabel={t("composer.agentSwitch")}
                  triggerTitle={currentAgent.name}
                  trigger={
                    <>
                      <span>{currentAgent.name}</span>
                      <ChevronDown className={styles.chevron} data-icon="inline-end" />
                    </>
                  }
                  options={agents.map((a) => ({
                    key: a.name,
                    label: a.name,
                    hint: a.description,
                  }))}
                  selectedKey={currentAgentName}
                  onSelect={onAgentChange}
                  align="start"
                />
              )
            ) : null}

            {/* 模型选择器（MODEL-UX）：候选来自 platform 单源；首条消息后锁定为只读展示。空候选=不渲染。 */}
            {!hideModelSelector && models.length > 0 && currentModel ? (
              modelLocked ? (
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(styles.mode, styles.modeLocked)}
                  data-composer-control="model"
                  disabled
                  aria-label={t("composer.modelLocked", { model: modelLabel(currentModel) })}
                  title={`${modelLabel(currentModel)} — ${t("composer.modelLockedTitle")}`}
                >
                  <span>{modelLabel(currentModel)}</span>
                  <Lock className={styles.lock} data-icon="inline-end" />
                </Button>
              ) : (
                <ComposerMenu
                  triggerClassName={styles.mode}
                  dataComposerControl="model"
                  triggerLabel={t("composer.modelSwitch")}
                  triggerTitle={currentModelTriggerTitle}
                  trigger={
                    <>
                      <span data-slot={currentModelNewBadgeLabel ? "new-model-name" : undefined}>
                        {currentModelTriggerLabel}
                      </span>
                      {currentModelNewBadgeLabel ? (
                        <span
                          className={styles.newModelBadge}
                          data-slot="new-model-badge"
                          aria-hidden="true"
                        >
                          {currentModelNewBadgeLabel}
                        </span>
                      ) : null}
                      <ChevronDown className={styles.chevron} data-icon="inline-end" />
                    </>
                  }
                  options={models.map((m) => ({ key: modelSelector(m), label: modelLabel(m) }))}
                  selectedKey={currentSelector}
                  onSelect={onModelChange}
                  align="start"
                />
              )
            ) : null}

            {modeLocked ? (
              <Button variant="ghost"
                type="button"
                className={cn(styles.mode, styles.modeSelect, styles.modeLocked)}
                data-composer-control="mode"
                disabled
                aria-label={t("composer.modeLocked", { mode: modeLabel })}
                title={`${modeLabel} — ${t("composer.modeLockedTitle")}`}
              >
                <ModeIcon className={styles.modeGlyph} data-icon="inline-start" />
                <span>{modeLabel}</span>
                <Lock className={styles.lock} data-icon="inline-end" />
              </Button>
            ) : (
              <ComposerMenu
                triggerClassName={cn(styles.mode, styles.modeSelect)}
                dataComposerControl="mode"
                triggerLabel={t("composer.modeSwitch")}
                triggerTitle={modeLabel}
                trigger={
                  <>
                    <ModeIcon className={styles.modeGlyph} data-icon="inline-start" />
                    <span>{modeLabel}</span>
                    <ChevronDown className={styles.chevron} data-icon="inline-end" />
                  </>
                }
                options={modeOptions(t)}
                selectedKey={mode}
                onSelect={(key) => {
                  if (isAgentMode(key)) {
                    onModeChange(key)
                  }
                }}
                align="start"
              />
            )}

          </div>
          <div className={styles.trailingActions} aria-label={t("composer.voiceInput")}>
            {emptyWorkspace && !projectWorkspace && creationIntent === "website" ? null : (
              <Button type="button" variant="ghost" size="icon-sm" disabled aria-label={t("composer.voiceMode")}>
                <AudioWaveform aria-hidden="true" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={styles.voiceInput}
              data-state={voiceInput.state}
              aria-label={t(voiceActive ? "composer.voiceStop" : "composer.voiceInput")}
              aria-pressed={voiceActive}
              onPointerDown={(event) => {
                // Chromium may keep :focus-visible after a pointer click in
                // the desktop shell. Keep the caret/action state, but do not
                // leave a focus ring flashing around this 32px icon.
                const pointerType = event.pointerType as string
                if (pointerType !== "mouse" && pointerType !== "pen" && pointerType !== "") return
                const target = event.currentTarget
                target.dataset.pointerFocus = "true"
                target.addEventListener("blur", () => {
                  delete target.dataset.pointerFocus
                }, { once: true })
              }}
              onClick={voiceInput.toggle}
            >
              <Mic aria-hidden="true" />
            </Button>
            {voiceStatus ? (
              <span className="sr-only" data-slot="voice-input-status" role="status" aria-live="polite">
                {voiceStatus}
              </span>
            ) : null}
          </div>
          {/* 发送/停止是固定动作锚点，独立于可换行的选择器 cluster。窄栏时选择器可以换行，
              但提交按钮始终贴右下角，不会被 Agent/模型长名称挤走。 */}
          {isStreaming && !canSend ? (
            <Button
              variant="outline"
              size="icon-sm"
              className={cn(styles.send, styles.sendStop)}
              type="button"
              aria-label={t(isAwaitingApproval ? "hitl.cancelWaiting" : "composer.stop")}
              title={t(isAwaitingApproval ? "hitl.cancelWaiting" : "composer.stop")}
              onClick={onStop}
            >
              {isAwaitingApproval ? <X className={styles.glyph} data-icon="inline-start" aria-hidden="true" /> : <Square className={styles.glyph} data-icon="inline-start" />}
            </Button>
          ) : (
            <Button
              variant="default"
              size="icon-sm"
              className={styles.send}
              type="submit"
              aria-label={isStreaming ? t("composer.sendSteer") : t("composer.send")}
              disabled={!canSend}
            >
              <ArrowUp className={styles.glyph} data-icon="inline-start" />
            </Button>
          )}
        </div>
      </form>

      {/* 常驻保留高度：标签延后出现也不改变 composer 位置，避免聊天框跳动。 */}
      {modeLocked ? (
        <p className={styles.disclaimer} data-slot="composer-disclaimer">
          {t("composer.disclaimer")}
        </p>
      ) : null}

    </div>
  )
}
