import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"

import type { ComposerProps, ComposerSlashCommand } from "@/ui/composer/composer"
import { Composer } from "@/ui/composer/composer"
import { ComposerConnections } from "@/ui/composer/composer-connections"
import { ComposerSkillsMenu, type ComposerSkills } from "@/ui/composer/composer-skills-menu"
import type { ComposerConnectionsController } from "@/ui/shell/use-composer-connections"
import type { CreationIntent } from "@/ui/composer/creation-intent-pill"
import type { SettingsTab } from "@/ui/settings/settings-modal"
import { useT } from "@/i18n/context"
import type { MessageKey } from "@/i18n/messages"
import { navigateMountedSurface } from "@/ui/navigation/mounted-surface-navigation"

import type { WorkspaceCapabilities } from "./app-frame.types"
import styles from "./app-frame-main.module.css"

type ShellComposerProps = Omit<
  ComposerProps,
  | "creationIntent"
  | "environmentLabel"
  | "environmentSelectorPlacement"
  | "leadingActions"
  | "placeholder"
  | "projectWorkspace"
  | "onCreationIntentDismiss"
  | "voicePreview"
>

export type AppFrameComposerProps = ShellComposerProps & {
  skills?: ComposerSkills
  connections?: ComposerConnectionsController
  connectionsEnabled?: boolean
  localDraftPersistenceFailed?: boolean
  submissionRecoveryFailed?: boolean
  preview: boolean
  brandName: string | undefined
  projectWorkspace: boolean
  hasMessages: boolean
  creationIntent: CreationIntent | null
  onCreationIntentDismiss: () => void
  workspaceCapabilities: WorkspaceCapabilities
  onOpenMcpCatalog: (returnTarget: HTMLElement | null) => void
  onOpenSettings: (tab: SettingsTab, returnTarget?: HTMLElement | null) => void
}

function creationPlaceholder(
  t: (key: MessageKey) => string,
  projectWorkspace: boolean,
  hasMessages: boolean,
  intent: CreationIntent | null,
): string | undefined {
  if (projectWorkspace && !hasMessages) return t("firstSite.startConversation")
  if (projectWorkspace || hasMessages) return undefined
  switch (intent) {
    case "website":
      return t("settings.deploymentWebsitePlaceholder")
    case "app":
      return t("settings.deploymentAppPlaceholder")
    case "presentation":
      return t("firstSite.presentationPlaceholder")
    case "design":
      return t("firstSite.designPlaceholder")
    case "game":
      return t("firstSite.gamePlaceholder")
    default:
      return t("firstSite.homePlaceholder")
  }
}

function preferredCreationModel(projectWorkspace: boolean, hasMessages: boolean, intent: CreationIntent | null): string | undefined {
  if (projectWorkspace || hasMessages) return undefined
  if (intent === "presentation" || intent === "game") return "kokoro:standard-new"
  if (intent === "design") return "openai:gpt-image-2"
  return undefined
}

/** Renders the one shell-owned Composer slot and its site-projected actions. */
export function AppFrameComposer({
  skills,
  connections,
  connectionsEnabled = false,
  localDraftPersistenceFailed = false,
  submissionRecoveryFailed = false,
  preview,
  brandName,
  projectWorkspace,
  hasMessages,
  creationIntent,
  onCreationIntentDismiss,
  workspaceCapabilities,
  onOpenSettings,
  onOpenMcpCatalog,
  ...composerProps
}: AppFrameComposerProps) {
  const composerResourcesTriggerRef = useRef<HTMLButtonElement | null>(null)
  const resourceScope = useMemo(() => ({ client: skills?.client, boundary: skills?.boundary, key: skills?.scopeKey, selectable: skills?.selectable, enabled: workspaceCapabilities.skills, preview }), [skills?.client, skills?.boundary, skills?.scopeKey, skills?.selectable, workspaceCapabilities.skills, preview])
  const [resourceMenu, setResourceMenu] = useState<{ scope: typeof resourceScope; slash: ComposerSlashCommand | null } | null>(null)
  const liveScope = useRef<typeof resourceScope | null>(null)
  const returnCaret = useRef<{ scope: typeof resourceScope; caret: number } | null>(null)
  const focusAttempt = useRef<object | null>(null)
  useLayoutEffect(() => {
    liveScope.current = resourceScope
    return () => { if (liveScope.current === resourceScope) liveScope.current = null }
  }, [resourceScope])
  // Retire, rather than hide-and-resurrect, a menu belonging to an older draft
  // or engine/actor scope. This is UI intent only, not a second skill selection.
  if (resourceMenu && (resourceMenu.scope !== resourceScope || resourceMenu.slash !== null && resourceMenu.slash.draft !== composerProps.draft)) setResourceMenu(null)
  const changeResourceMenu = useCallback((open: boolean) => {
    if (open) { returnCaret.current = null; focusAttempt.current = null }
    setResourceMenu(open ? { scope: resourceScope, slash: null } : null)
  }, [resourceScope])
  const resourcesEnabled = !preview && workspaceCapabilities.skills && skills?.boundary.admitted === true && skills.boundary.subject !== null && skills.selectable !== false
  // `Composer` owns the full copy contract. The shell only needs the small
  // translation function for values that shape the shell-projected slot.
  // Importing the hook here keeps AppFrame itself free of Composer copy logic.
  const translate = useT()
  const placeholder = creationPlaceholder(
    translate,
    projectWorkspace,
    hasMessages,
    creationIntent,
  )
  const preferredModelSelector = preferredCreationModel(projectWorkspace, hasMessages, creationIntent)

  return (
    <div data-slot="composer" className="shrink-0">
      {submissionRecoveryFailed ? <p role="alert" className={styles.submissionError}>{translate("chat.submissionRecoveryFailed")}</p> : null}
      {localDraftPersistenceFailed ? <p role="alert" className={styles.submissionError}>{translate("chat.localDraftPersistenceFailed")}</p> : null}
      <Composer
        {...composerProps}
        {...(placeholder === undefined ? {} : { placeholder })}
        {...(preferredModelSelector === undefined ? {} : { preferredModelSelector })}
        {...(creationIntent === null || hasMessages ? {} : { creationIntent })}
        onCreationIntentDismiss={onCreationIntentDismiss}
        environmentLabel={translate("settings.desktopApp", { brand: brandName ?? "Kokoro" })}
        projectWorkspace={projectWorkspace}
        environmentSelectorPlacement={projectWorkspace && hasMessages ? "floating" : "controls"}
        voicePreview={preview}
        onDraftChange={value => { setResourceMenu(null); composerProps.onDraftChange(value) }}
        onResourceMenuRequest={command => {
          if (!resourcesEnabled) return
          focusAttempt.current = null
          returnCaret.current = { scope: resourceScope, caret: command.end }
          setResourceMenu({ scope: resourceScope, slash: command })
        }}
        onKeyDown={event => {
          if (resourceMenu?.scope === resourceScope && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && ["Enter", "ArrowDown", "ArrowUp", "Escape"].includes(event.key)) {
            event.preventDefault()
            if (event.key === "Escape") changeResourceMenu(false)
            return
          }
          composerProps.onKeyDown(event)
        }}
        leadingActions={
          <>
            {workspaceCapabilities.resources || workspaceCapabilities.skills ? (
              <ComposerSkillsMenu skills={skills} enabled={resourcesEnabled} open={resourceMenu?.scope === resourceScope}
                openFromSlash={resourceMenu?.slash != null} onOpenChange={changeResourceMenu} triggerRef={composerResourcesTriggerRef}
                onSelect={skill => {
                  const command = resourceMenu?.slash
                  if (!resourceMenu || resourceMenu.scope !== resourceScope || !skills || command && command.draft !== composerProps.draft || !skills.onSelect(skill)) return false
                  returnCaret.current = { scope: resourceScope, caret: command ? command.start : composerProps.composerRef.current?.selectionStart ?? composerProps.draft.length }
                  if (command) composerProps.onDraftChange(command.draft.slice(0, command.start) + command.draft.slice(command.end))
                  return true
                }}
                onManage={() => onOpenSettings("skills", composerResourcesTriggerRef.current)}
                onAdd={() => navigateMountedSurface("/app/skills")}
                onCloseAutoFocus={event => {
                  const target = returnCaret.current
                  returnCaret.current = null
                  if (target === null) return
                  event.preventDefault()
                  if (target.scope !== resourceScope) return
                  const node = composerProps.composerRef.current
                  // Continued typing or Escape already owns the current caret.
                  if (document.activeElement === node) return
                  const attempt = {}
                  focusAttempt.current = attempt
                  window.requestAnimationFrame(() => {
                    if (node?.isConnected && liveScope.current === target.scope && focusAttempt.current === attempt) {
                      focusAttempt.current = null
                      node.focus({ preventScroll: true }); node.setSelectionRange(target.caret, target.caret)
                    }
                  })
                }} />
            ) : null}
            {connectionsEnabled && connections ? (
              <ComposerConnections controller={connections} onAdd={onOpenMcpCatalog} onManage={(returnTarget) => onOpenSettings("mcp", returnTarget)} />
            ) : null}
          </>
        }
      />
    </div>
  )
}
