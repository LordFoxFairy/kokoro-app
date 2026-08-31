"use client"

import { useRef, type RefObject } from "react"
import { useRouter } from "next/navigation"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { MessageSquarePlus, Settings2 } from "lucide-react"
import { cn } from "@/lib/utils"

import type { SettingsTab } from "@/ui/settings/settings-modal"
import { useT } from "@/i18n/context"
import type { RuntimeFeatureFlag, RuntimeNavigationItem } from "@/system/runtime-navigation"
import { isRuntimeNavigationEnabled, navigationIcon, registeredNavigationRoute } from "@/ui/navigation/runtime-navigation-registry"

import styles from "./app-command-menu.module.css"

function isFocusTargetAvailable(target: HTMLElement | null): target is HTMLElement {
  if (!target || !target.isConnected || target.hasAttribute("disabled")) {
    return false
  }
  const style = window.getComputedStyle(target)
  // Do not use a rect-size check here: jsdom has no layout, while the real
  // responsive shell already expresses an unavailable trigger with
  // display:none. This keeps focus restoration testable and still excludes
  // controls hidden by the media-query shell.
  return style.display !== "none" && style.visibility !== "hidden"
}

export type AppCommandMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNewChat: () => void
  onOpenSettings: (tab: SettingsTab) => void
  navigation?: readonly RuntimeNavigationItem[]
  featureFlags?: readonly RuntimeFeatureFlag[]
  /** A project creates scoped conversations; the direct inbox creates direct chats. */
  projectWorkspace?: boolean
  returnFocusRef?: RefObject<HTMLElement | null>
  /** Optional shell scope for fallback focus recovery when multiple sites are embedded. */
  focusScopeRef?: RefObject<HTMLElement | null>
}

export function AppCommandMenu({
  open,
  onOpenChange,
  onNewChat,
  onOpenSettings,
  navigation,
  featureFlags,
  returnFocusRef,
  focusScopeRef,
}: AppCommandMenuProps) {
  const t = useT()
  const router = useRouter()
  // Settings opens a second modal in the same event. Let that modal perform
  // its own focus handoff instead of briefly returning focus to the command
  // trigger and stealing it back from the newly opened panel.
  const focusHandoffRef = useRef(false)
  const commandNavigation = (navigation === undefined
    ? [
      { key: "agent", label: t("rail.navAgent") },
      { key: "library", label: t("rail.navLibrary") },
      { key: "skills", label: t("rail.navSkills") },
      { key: "mcp", label: t("rail.navMcp") },
      { key: "scheduled", label: t("rail.navScheduled") },
      { key: "credits", label: t("rail.navBilling") },
      { key: "team", label: t("rail.navTeams") },
    ]
    : navigation.filter((item) => isRuntimeNavigationEnabled(item, featureFlags))
  ).flatMap((item) => {
    const route = registeredNavigationRoute(item.key)
    return [{ key: item.key, label: item.label, tab: route?.settingsTab, href: route?.href, icon: navigationIcon(item.key) }]
  })

  const run = (action: () => void, handoffFocus = false) => {
    focusHandoffRef.current = handoffFocus
    onOpenChange(false)
    action()
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("shell.commandTitle")}
      description={t("shell.commandDescription")}
      closeLabel={t("shell.closeDialog")}
      className={cn("sm:max-w-xl", styles.dialogContent)}
      onCloseAutoFocus={(event) => {
        if (focusHandoffRef.current) {
          focusHandoffRef.current = false
          event.preventDefault()
          return
        }
        const rememberedTarget = returnFocusRef?.current ?? null
        const scope = focusScopeRef?.current ?? document
        const fallback = scope.querySelector<HTMLElement>(
          '[data-settings-return-target="composer"]:not([disabled])',
        )
        const target = isFocusTargetAvailable(rememberedTarget)
          ? rememberedTarget
          : isFocusTargetAvailable(fallback)
            ? fallback
            : null
        if (!target) {
          return
        }
        event.preventDefault()
        window.requestAnimationFrame(() => target.focus())
      }}
    >
      <CommandInput placeholder={t("shell.commandPlaceholder")} />
      <CommandList label={t("shell.commandResults")}>
        <CommandEmpty>{t("shell.commandEmpty")}</CommandEmpty>
        <CommandGroup heading={t("shell.commandWorkspace")}>
          <CommandItem onSelect={() => run(onNewChat, true)}>
            <MessageSquarePlus />
            <span>{t("firstSite.newTask")}</span>
            <CommandShortcut>{t("rail.newChatShortcut")}</CommandShortcut>
          </CommandItem>
          {commandNavigation.map(({ key, label, tab, href, icon: Icon }) => (
            <CommandItem key={key} disabled={!tab && !href} onSelect={() => tab ? run(() => onOpenSettings(tab), true) : href ? run(() => router.push(href), true) : undefined}>
              <Icon />
              <span>{label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={t("shell.commandPreferences")}>
          <CommandItem onSelect={() => run(() => onOpenSettings("appearance"), true)}>
            <Settings2 />
            <span>{t("settings.appearanceTitle")}</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
