import { useSyncExternalStore } from "react"

import { normalizeSettingsTab, type SettingsTab } from "@/ui/settings/settings-modal"
import type { CreationIntent } from "@/ui/composer/creation-intent-pill"
import {
  RAIL_COMPACT_BREAKPOINT,
} from "@/ui/rail/use-rail-resize"
import type { RuntimeFeatureFlag } from "@/system/runtime-navigation"

import type { WorkspaceCapabilities } from "./app-frame.types"

// CommandDialog and SettingsDialog are both modal focus traps. Leave a short
// handoff window between them so the closing command overlay never overlaps
// the newly mounted settings overlay.
export const COMMAND_SETTINGS_HANDOFF_MS = 220

// Keep the narrow desktop state at the same threshold as the reference
// workbench. This is a fine-pointer rule only; mobile presentation remains
// owned by useIsMobile and the Sheet surface.
export const COMPACT_DESKTOP_RAIL_BREAKPOINT = RAIL_COMPACT_BREAKPOINT

const PENDING_CREATION_INTENT_KEY = "kokoro.web.pending-creation-intent"
const PENDING_PROJECT_DRAFT_PREFIX = "kokoro.web.pending-project-draft:"
const PREVIEW_PROJECT_SEQUENCE_KEY = "kokoro.web.preview-project-sequence"
let previewProjectSequence = 0

export function createPreviewProjectRef(): string {
  if (typeof window === "undefined") return "preview-project-1"
  try {
    const persisted = Number.parseInt(window.sessionStorage.getItem(PREVIEW_PROJECT_SEQUENCE_KEY) ?? "0", 10)
    previewProjectSequence = Number.isFinite(persisted) ? Math.max(previewProjectSequence, persisted) : previewProjectSequence
    previewProjectSequence += 1
    window.sessionStorage.setItem(PREVIEW_PROJECT_SEQUENCE_KEY, String(previewProjectSequence))
  } catch {
    previewProjectSequence += 1
  }
  return `preview-project-${previewProjectSequence}`
}

function pendingProjectDraftKey(projectRef: string): string {
  return `${PENDING_PROJECT_DRAFT_PREFIX}${encodeURIComponent(projectRef)}`
}

export function writePendingProjectDraft(projectRef: string, draft: string | undefined): void {
  if (typeof window === "undefined") return
  try {
    const key = pendingProjectDraftKey(projectRef)
    if (draft?.trim()) window.sessionStorage.setItem(key, draft)
    else window.sessionStorage.removeItem(key)
  } catch {
    // The route handoff remains usable when storage is unavailable; the
    // project shell still opens and the caller may provide its own adapter.
  }
}

export function takePendingProjectDraft(projectRef: string): string | null {
  if (typeof window === "undefined") return null
  try {
    const key = pendingProjectDraftKey(projectRef)
    const value = window.sessionStorage.getItem(key)
    window.sessionStorage.removeItem(key)
    return value?.trim() || null
  } catch {
    return null
  }
}

export function readRailCollapsedCookie(): boolean | null {
  if (typeof document === "undefined") return null
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("sidebar_state="))
  if (!cookie) return null
  const value = cookie.slice("sidebar_state=".length)
  return value === "true" ? false : value === "false" ? true : null
}

const CREATION_INTENTS: readonly CreationIntent[] = ["presentation", "website", "design", "game", "app"]

function isCreationIntent(value: string | null): value is CreationIntent {
  return value !== null && CREATION_INTENTS.includes(value as CreationIntent)
}

export function readPendingCreationIntent(): CreationIntent | null {
  if (typeof window === "undefined") return null
  try {
    const value = window.sessionStorage.getItem(PENDING_CREATION_INTENT_KEY)
    return isCreationIntent(value) ? value : null
  } catch {
    return null
  }
}

export function readInitialCreationIntent(): CreationIntent | null {
  const stored = readPendingCreationIntent()
  if (stored !== null) return stored
  // `qa=capsule-final` is a local screenshot fixture, not a product mode. It
  // makes the capsule comparison URL deterministic after a fresh tab while
  // keeping the real `/app` route neutral until the user chooses Website.
  if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    const qa = new URLSearchParams(window.location.search).get("qa")
    if (qa === "capsule-final") return "website"
  }
  return null
}

export function writePendingCreationIntent(value: CreationIntent | null): void {
  if (typeof window === "undefined") return
  try {
    if (value === null) window.sessionStorage.removeItem(PENDING_CREATION_INTENT_KEY)
    else window.sessionStorage.setItem(PENDING_CREATION_INTENT_KEY, value)
  } catch {
    // Storage can be unavailable in a locked-down browser; the in-memory
    // React state still keeps the current tab usable.
  }
  // Remove the pre-sessionStorage key so an upgrade cannot resurrect an old
  // creation capsule from localStorage or leak it to another tab/site.
  try {
    window.localStorage.removeItem(PENDING_CREATION_INTENT_KEY)
  } catch {
    // Ignore storage cleanup failures; it is only compatibility hygiene.
  }
}

export function useCompactDesktopRail(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const query = window.matchMedia(`(max-width: ${COMPACT_DESKTOP_RAIL_BREAKPOINT}px) and (pointer: fine)`)
      query.addEventListener("change", onStoreChange)
      return () => query.removeEventListener("change", onStoreChange)
    },
    () => window.matchMedia(`(max-width: ${COMPACT_DESKTOP_RAIL_BREAKPOINT}px) and (pointer: fine)`).matches,
    () => false,
  )
}

export function isFocusTargetAvailable(target: HTMLElement | null): target is HTMLElement {
  if (!target || !target.isConnected || target.hasAttribute("disabled")) {
    return false
  }
  // Shell-owned return targets are explicitly mounted focus destinations. A
  // portal close can briefly report an empty computed style while the rail is
  // committing its next frame, so do not reject these stable markers.
  if (target.hasAttribute("data-settings-return-target")) {
    return true
  }
  if (target.matches('[data-sidebar="trigger"], [data-slot="sidebar-trigger"]')) {
    const rect = target.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }
  const style = window.getComputedStyle(target)
  return style.display !== "none" && style.visibility !== "hidden"
}

// 新对话快捷键 ⇧⌘O（mac）/ ⇧Ctrl O（其它平台）：与侧栏展示的提示一致。
export function isNewChatShortcut(event: {
  key: string
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}): boolean {
  return (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "o"
}

export function settingsTabFromLocation(): SettingsTab | null {
  if (typeof window === "undefined") {
    return null
  }
  const search = new URLSearchParams(window.location.search)
  // Manus also exposes settings as a hash deep-link (`#settings/general`).
  // Accept both forms so a copied reference URL opens the same panel instead
  // of silently rendering the workspace with no modal.
  const hashSegments = window.location.hash
    .replace(/^#\/?/, "")
    .split(/[\/?#]/)
    .filter(Boolean)
  const settingsIndex = hashSegments.lastIndexOf("settings")
  const hashTab = settingsIndex >= 0 ? hashSegments[settingsIndex + 1] ?? null : null
  const raw = search.get("settings") ?? hashTab
  return raw === null ? null : normalizeSettingsTab(raw)
}

// The address bar is a shareable view state, not an identity boundary. Keep
// the conversation reference opaque and leave tenant/site resolution to the
// server-side host binding.
export function conversationIdFromLocation(): string | null {
  if (typeof window === "undefined") {
    return null
  }
  const queryValue = new URLSearchParams(window.location.search).get("conversation")
  if (queryValue?.trim()) {
    return queryValue.trim()
  }

  // Conversation links can also arrive from the hash router. Keep
  // the accepted forms deliberately narrow so settings/catalog hashes remain
  // untouched: `#conversation=ID` and `#/conversation/ID`.
  const hash = window.location.hash.replace(/^#\/?/, "")
  if (hash.startsWith("conversation=")) {
    const value = new URLSearchParams(hash).get("conversation")
    return value?.trim() || null
  }
  const match = hash.match(/^conversation\/([^/]+)$/)
  if (!match) {
    return null
  }
  const encodedId = match[1]
  if (encodedId === undefined) return null
  try {
    return decodeURIComponent(encodedId).trim() || null
  } catch {
    return null
  }
}

const DEFAULT_WORKSPACE_CAPABILITIES: WorkspaceCapabilities = {
  instructions: true,
  connectors: true,
  resources: true,
  skills: true,
  projectConversations: true,
  websites: true,
  scheduledTasks: true,
}

const WORKSPACE_CAPABILITY_KEYS: Readonly<Record<keyof WorkspaceCapabilities, readonly string[]>> = {
  instructions: ["workspace.instructions", "project.instructions"],
  connectors: ["workspace.connectors", "project.connectors"],
  resources: ["workspace.resources", "project.resources", "workspace.files"],
  skills: ["workspace.skills", "project.skills"],
  projectConversations: ["workspace.conversations", "project.conversations"],
  websites: ["workspace.websites", "project.websites"],
  scheduledTasks: ["workspace.scheduled_tasks", "project.scheduled_tasks"],
} as const

export function projectWorkspaceCapabilities(
  flags: readonly RuntimeFeatureFlag[] | undefined,
  explicit: WorkspaceCapabilities | undefined,
): WorkspaceCapabilities {
  if (explicit) return explicit
  const fallback = flags === undefined ? DEFAULT_WORKSPACE_CAPABILITIES : {
    instructions: false,
    connectors: false,
    resources: false,
    skills: false,
    projectConversations: false,
  }
  return Object.fromEntries(
    Object.entries(WORKSPACE_CAPABILITY_KEYS).map(([capability, keys]) => {
      const flag = flags?.find((candidate) => keys.includes(candidate.key))
      return [capability, flag?.enabled ?? fallback[capability as keyof WorkspaceCapabilities]]
    }),
  ) as WorkspaceCapabilities
}
