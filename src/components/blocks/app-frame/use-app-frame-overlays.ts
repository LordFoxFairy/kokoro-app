import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"

import { overlayHandoffDelay } from "@/ui/shell/overlay-handoff"
import type { McpCreateMode } from "@/ui/mcp/mcp-panel"
import type { SettingsTab } from "@/ui/settings/settings-modal"

import {
  COMMAND_SETTINGS_HANDOFF_MS,
  isFocusTargetAvailable,
  settingsTabFromLocation,
} from "./app-frame-helpers"

export type AppFrameOverlayOptions = {
  mounted: boolean
  settingsTab: SettingsTab | null
  setSettingsTab: Dispatch<SetStateAction<SettingsTab | null>>
  settingsHistoryEntryRef: RefObject<boolean | null>
  syncSettingsUrl: (tab: SettingsTab | null, mode: "push" | "replace") => void
  shellRef: RefObject<HTMLDivElement | null>
  composerRef: RefObject<HTMLTextAreaElement | null>
  accountTriggerRef: RefObject<HTMLButtonElement | null>
}

/** Owns modal state, focus handoffs, and command-palette coordination. */
export function useAppFrameOverlays({
  mounted,
  settingsTab,
  setSettingsTab,
  settingsHistoryEntryRef,
  syncSettingsUrl,
  shellRef,
  composerRef,
  accountTriggerRef,
}: AppFrameOverlayOptions) {
  const [commandOpen, setCommandOpen] = useState(false)
  // The command palette is controlled by the shell so every entry point shares
  // one focus-return contract.
  const commandTriggerRef = useRef<HTMLButtonElement | null>(null)
  // Keyboard shortcuts can open the palette without a mounted trigger (the
  // desktop header is intentionally hidden). Remember the actual invoker so
  // Escape closes back to the control the user came from instead of <body>.
  const commandReturnFocusRef = useRef<HTMLElement | null>(null)
  const commandSettingsTimerRef = useRef<number | null>(null)
  const commandNewChatTimerRef = useRef<number | null>(null)
  // Settings is also a controlled Dialog. Keep the invoking control alive for
  // rail and command-menu handoffs before the surface unmounts.
  const settingsReturnFocusRef = useRef<HTMLElement | null>(null)
  const mcpCreateReturnFocusRef = useRef<HTMLElement | null>(null)
  const [mcpCreateMode, setMcpCreateMode] = useState<McpCreateMode | null>(null)
  const customApiReturnFocusRef = useRef<HTMLElement | null>(null)
  const [customApiOpen, setCustomApiOpen] = useState(false)
  const settingsWasOpenRef = useRef(false)

  // The controlled Settings Dialog can unmount before Radix emits its portal
  // close-focus callback. Keep a shell-level handoff as the authoritative
  // fallback.
  useEffect(() => {
    const wasOpen = settingsWasOpenRef.current
    settingsWasOpenRef.current = settingsTab !== null
    if (!wasOpen || settingsTab !== null) return

    const frame = window.requestAnimationFrame(() => {
      const rememberedTarget = settingsReturnFocusRef.current
      const target = isFocusTargetAvailable(rememberedTarget) ? rememberedTarget : composerRef.current
      target?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [composerRef, settingsTab])

  // A command palette can close in the same commit that schedules Settings.
  // Keep the selected Settings tab as the authoritative focus target so the
  // closing palette or a queued Composer handoff cannot leave focus behind it.
  useEffect(() => {
    if (!mounted || settingsTab === null) return
    const focusTab = () => {
      const target = document.querySelector<HTMLElement>(`[data-testid="settings-tab-${settingsTab}"]`)
      target?.focus()
    }
    focusTab()
    const frame = window.requestAnimationFrame(() => {
      focusTab()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [mounted, settingsTab])

  const openSettings = useCallback(
    (tab: SettingsTab, explicitReturnTarget?: HTMLElement | null): void => {
      // A queued command-menu → Composer handoff must not steal focus from a
      // Settings surface opened immediately afterwards.
      if (commandNewChatTimerRef.current !== null) {
        window.clearTimeout(commandNewChatTimerRef.current)
        commandNewChatTimerRef.current = null
      }
      if (isFocusTargetAvailable(explicitReturnTarget ?? null)) {
        settingsReturnFocusRef.current = explicitReturnTarget ?? null
      } else if (commandOpen) {
        settingsReturnFocusRef.current = commandReturnFocusRef.current ?? commandTriggerRef.current
      } else {
        const active = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
          ? document.activeElement
          : null
        // DropdownMenu content is portaled outside the shell and may still be
        // active when the delayed Settings handoff fires. Do not remember a
        // soon-to-be-removed menu item; return to this shell's account trigger.
        const scopedAccountTrigger = accountTriggerRef.current
        settingsReturnFocusRef.current = active
          && shellRef.current?.contains(active)
          && isFocusTargetAvailable(active)
          ? active
          : isFocusTargetAvailable(scopedAccountTrigger)
            ? scopedAccountTrigger
            : null
      }
      const open = () => {
        commandSettingsTimerRef.current = null
        setSettingsTab(tab)
        const hasSettingsUrl = settingsTabFromLocation() !== null
        if (hasSettingsUrl) {
          syncSettingsUrl(tab, "replace")
        } else {
          settingsHistoryEntryRef.current = true
          syncSettingsUrl(tab, "push")
        }
      }
      if (commandOpen) {
        if (commandSettingsTimerRef.current !== null) {
          window.clearTimeout(commandSettingsTimerRef.current)
        }
        commandSettingsTimerRef.current = window.setTimeout(
          open,
          overlayHandoffDelay(COMMAND_SETTINGS_HANDOFF_MS),
        )
        return
      }
      open()
    },
    [accountTriggerRef, commandOpen, shellRef, syncSettingsUrl, setSettingsTab, settingsHistoryEntryRef],
  )

  const closeSettings = useCallback((): void => {
    if (commandSettingsTimerRef.current !== null) {
      window.clearTimeout(commandSettingsTimerRef.current)
      commandSettingsTimerRef.current = null
    }
    // Settings is controlled by AppFrame and therefore unmounts in the same
    // commit as `onClose`. Radix's close-auto-focus cannot reliably restore a
    // trigger that disappears before its portal finishes closing. Capture the
    // stable invoking control (or Composer for a deep link) and restore it
    // after the unmount commit as the final focus handoff.
    const rememberedTarget = settingsReturnFocusRef.current
    setSettingsTab(null)
    if (settingsHistoryEntryRef.current && settingsTabFromLocation() !== null) {
      settingsHistoryEntryRef.current = false
      window.history.back()
    } else {
      syncSettingsUrl(null, "replace")
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        // Re-resolve Composer inside the deferred callback. A viewport change
        // At close time the Composer is the stable return surface.
        const target = isFocusTargetAvailable(rememberedTarget) ? rememberedTarget : composerRef.current
        target?.focus()
      })
    })
  }, [composerRef, setSettingsTab, syncSettingsUrl, settingsHistoryEntryRef])

  useEffect(() => () => {
    if (commandSettingsTimerRef.current !== null) {
      window.clearTimeout(commandSettingsTimerRef.current)
    }
    if (commandNewChatTimerRef.current !== null) {
      window.clearTimeout(commandNewChatTimerRef.current)
    }
  }, [])

  const openMcpCreate = useCallback((mode: McpCreateMode, returnTarget?: HTMLElement | null) => {
    mcpCreateReturnFocusRef.current = returnTarget ?? null
    setMcpCreateMode(mode)
  }, [])

  const openCustomApiCreate = useCallback((returnTarget?: HTMLElement | null) => {
    customApiReturnFocusRef.current = returnTarget ?? null
    setCustomApiOpen(true)
  }, [])

  const openCommand = useCallback(() => {
    // Re-opening the palette during the delayed new-chat handoff means the
    // palette is now the active surface. Cancel that pending Composer focus
    // before it can steal focus from the next command or Settings dialog.
    if (commandNewChatTimerRef.current !== null) {
      window.clearTimeout(commandNewChatTimerRef.current)
      commandNewChatTimerRef.current = null
    }
    const active = document.activeElement
    commandReturnFocusRef.current = active instanceof HTMLElement && active !== document.body
      ? active
      : commandTriggerRef.current
    setCommandOpen(true)
  }, [])

  return {
    commandOpen,
    setCommandOpen,
    commandTriggerRef,
    commandReturnFocusRef,
    commandSettingsTimerRef,
    commandNewChatTimerRef,
    settingsReturnFocusRef,
    mcpCreateReturnFocusRef,
    mcpCreateMode,
    setMcpCreateMode,
    customApiReturnFocusRef,
    customApiOpen,
    setCustomApiOpen,
    openSettings,
    closeSettings,
    openMcpCreate,
    openCustomApiCreate,
    openCommand,
  }
}
