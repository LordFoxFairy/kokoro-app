import { useRef } from "react"
import { Cable, Plus, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { ComposerProps } from "@/ui/composer/composer"
import { Composer } from "@/ui/composer/composer"
import type { CreationIntent } from "@/ui/composer/creation-intent-pill"
import type { SettingsTab } from "@/ui/settings/settings-modal"
import { useT } from "@/i18n/context"
import type { MessageKey } from "@/i18n/messages"

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
  preview: boolean
  brandName: string | undefined
  projectWorkspace: boolean
  hasMessages: boolean
  creationIntent: CreationIntent | null
  onCreationIntentDismiss: () => void
  workspaceCapabilities: WorkspaceCapabilities
  onOpenSettings: (tab: SettingsTab, returnTarget?: HTMLElement | null) => void
}

function creationPlaceholder(
  t: (key: MessageKey) => string,
  projectWorkspace: boolean,
  hasMessages: boolean,
  intent: CreationIntent | null,
): string | undefined {
  if (projectWorkspace && !hasMessages) return t("firstSite.startTask")
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
  preview,
  brandName,
  projectWorkspace,
  hasMessages,
  creationIntent,
  onCreationIntentDismiss,
  workspaceCapabilities,
  onOpenSettings,
  ...composerProps
}: AppFrameComposerProps) {
  const composerResourcesTriggerRef = useRef<HTMLButtonElement | null>(null)
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
      <Composer
        {...composerProps}
        {...(placeholder === undefined ? {} : { placeholder })}
        {...(preferredModelSelector === undefined ? {} : { preferredModelSelector })}
        {...(creationIntent === null || hasMessages ? {} : { creationIntent })}
        onCreationIntentDismiss={onCreationIntentDismiss}
        environmentLabel={translate("settings.desktopApp", { brand: brandName ?? "Kokoro" })}
        projectWorkspace={projectWorkspace}
        environmentSelectorPlacement={projectWorkspace && hasMessages ? "floating" : "controls"}
        voicePreview={preview || process.env.NODE_ENV !== "production"}
        leadingActions={
          <>
            {workspaceCapabilities.resources ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    ref={composerResourcesTriggerRef}
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={translate("firstSite.filesAndResources")}
                    title={translate("firstSite.filesAndResources")}
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className={styles.contextMenu} align="start" side="top" sideOffset={84}>
                  <DropdownMenuItem onSelect={() => onOpenSettings("skills", composerResourcesTriggerRef.current)}>
                    <Sparkles data-icon="inline-start" />
                    {translate("rail.navSkills")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {workspaceCapabilities.connectors ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={translate("firstSite.connectors")}
                title={translate("firstSite.connectors")}
                onClick={() => onOpenSettings("mcp")}
              >
                <Cable aria-hidden="true" />
              </Button>
            ) : null}
          </>
        }
      />
    </div>
  )
}
