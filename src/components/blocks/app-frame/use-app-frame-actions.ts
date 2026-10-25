import {
  type FormEvent,
  type KeyboardEvent,
  type MutableRefObject,
  useCallback,
} from "react"

import type { SessionEngine } from "@/engine/machine"
import type { SkillCard } from "@/hub/schemas"
import { useT } from "@/i18n/context"
import { MAX_INPUT_LENGTH } from "@/ui/composer/composer"
import type { CreationIntent } from "@/ui/composer/creation-intent-pill"
import { stashConversationDraft } from "@/ui/shell/use-draft"
import { browserEngine, readBrowserAuthIndexSubject, retainBrowserEngine } from "@/ui/shell/page-clients"
import { DIRECT_SESSION_SCOPE } from "@/engine/session-scope"
import { navigateMountedSurface } from "@/ui/navigation/mounted-surface-navigation"
import { overlayHandoffDelay } from "@/ui/shell/overlay-handoff"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { useAppFrameMcpTrial } from "./use-app-frame-mcp-trial"
import { useAppFrameSkillTrial } from "./use-app-frame-skill-trial"

import { COMMAND_SETTINGS_HANDOFF_MS, conversationIdFromLocation } from "./app-frame-helpers"

export type AppFrameActionsOptions = {
  preview?: boolean
  readBoundary?: ProjectReadBoundary
  engine: SessionEngine | null
  projectWorkspace: boolean
  projectRef?: string
  routedConversationId?: string | null
  standaloneSurface: boolean
  chatHref: string
  activeId: string | null
  draft: string
  clearDraft: () => void
  updateDraft: (value: string) => void
  setDeploymentIntent: (intent: CreationIntent | null) => void
  syncConversationUrl: (id: string | null, mode: "push" | "replace") => void
  setConversationRouteId: (id: string | null) => void
  focusComposer: () => void
  closeSettings: (mode?: "close" | "handoff") => void
  brandName: string | undefined
  commandNewChatTimerRef: MutableRefObject<number | null>
}

/** Owns user actions that bridge the shell state to session and Composer commands. */
export function useAppFrameActions({
  preview = false,
  readBoundary,
  engine,
  projectWorkspace,
  projectRef,
  routedConversationId,
  standaloneSurface,
  chatHref,
  activeId,
  draft,
  clearDraft,
  updateDraft,
  setDeploymentIntent,
  syncConversationUrl,
  setConversationRouteId,
  focusComposer,
  closeSettings,
  brandName,
  commandNewChatTimerRef,
}: AppFrameActionsOptions) {
  const t = useT()
  const startNewChat = useCallback(() => {
    if (!engine) return false
    const previousId = engine.getSnapshot().store?.activeId
    engine.newConversation()
    if (engine.getSnapshot().store?.activeId === previousId) return false
    focusComposer()
    return true
  }, [engine, focusComposer])
  const selectConversation = useCallback((id: string) => {
    engine?.openConversation(id)
    focusComposer()
  }, [engine, focusComposer])
  const { startTrial, selectCurrentDraft: selectSkillForCurrentDraft, submitCurrentDraft, selectedSkill, clearSelectedSkill } = useAppFrameSkillTrial({ engine, preview, boundary: readBoundary })

  const directSelectionAtRender = engine?.getSnapshot().store?.activeId ?? null
  const conversationAtRender = conversationIdFromLocation()
  const routeAtRender = typeof window === "undefined" ? null : `${window.location.pathname}${window.location.search}`
  let actorAtRender: string | null | undefined
  try { actorAtRender = typeof window === "undefined" ? undefined : window.localStorage.getItem("kokoro.web.auth-index-subject") }
  catch { actorAtRender = undefined }

  const submitDraft = useCallback(() => {
    const content = draft.trim()
    if (!engine || !content || content.length > MAX_INPUT_LENGTH) {
      return
    }
    if (typeof window === "undefined" || (projectWorkspace && `${window.location.pathname}${window.location.search}` !== routeAtRender)) return
    try {
      if (actorAtRender === undefined || window.localStorage.getItem("kokoro.web.auth-index-subject") !== actorAtRender) return
    } catch { return }
    const snapshot = engine.getSnapshot()
    if (!projectWorkspace) {
      // History can change before the mounted shell commits its next render.
      // A retained direct Send must not create an inbox task on a project or
      // publish the previous draft into another selected conversation.
      const direct = new URL(chatHref, window.location.href)
      const requested = conversationIdFromLocation()
      const currentId = snapshot.store?.activeId ?? null
      if (direct.origin !== window.location.origin ||
        window.location.pathname.replace(/\/$/u, "") !== direct.pathname.replace(/\/$/u, "") ||
        currentId !== directSelectionAtRender ||
        (requested !== null && requested !== currentId)) return
      // The navigation hook may canonically publish this same draft's ID
      // without a new render. That is not a user selection change.
      if (requested !== conversationAtRender &&
        !(conversationAtRender === null && requested === directSelectionAtRender)) return
    }
    if (snapshot.hydrating && conversationIdFromLocation() !== null) return
    if (snapshot.missingSessionId !== undefined && conversationIdFromLocation() === snapshot.missingSessionId
      && snapshot.store?.activeId === snapshot.missingSessionId) return
    if (projectWorkspace) {
      const url = new URL(window.location.href)
      if (!projectRef || url.pathname !== `/app/project/${encodeURIComponent(projectRef)}` ||
        url.searchParams.get("conversation") !== (routedConversationId ?? null)) return
      const current = engine.getSnapshot()
      if (routedConversationId !== null && routedConversationId !== undefined) {
        if (current.store?.activeId !== routedConversationId || current.hydrating) return
      } else {
        // A root composer must not RESET a hidden POST, unknown receipt, or run.
        if (!current.canSubmitMessage || current.hydrating || current.connection.status !== "connected" ||
          current.machine.phase !== "idle" || current.hasPendingSubmission || current.canRetryPendingSubmission) return
      }
    }
    // 流式中提交继续沿现有 create-message 路径；queued/steer 的正式
    // owner 语义尚未发布，本层只消费 engine 的同步接纳结果。
    const accepted = submitCurrentDraft(content, projectWorkspace && routedConversationId == null)
    if (!accepted) {
      // A synchronous guard (for example, a create receipt still in flight)
      // leaves the user's draft and creation/route intent untouched.
      focusComposer()
      return
    }
    clearDraft()
    if (projectWorkspace) {
      // A first project message creates its opaque conversation in the shared
      // engine before the next render. Update both URL and route projection at
      // the user action boundary; replaceState alone does not notify App
      // Router, so waiting for a route effect would leave the overview painted
      // beside a newly-created conversation.
      const projectConversationId = engine.getSnapshot().store?.activeId ?? null
      if (projectConversationId !== null) {
        syncConversationUrl(projectConversationId, "replace")
        setConversationRouteId(projectConversationId)
      }
    }
    // Creation intent belongs to the empty composer only. Clear its persisted
    // projection as soon as the user commits the first message so a later
    // blank conversation cannot inherit a stale Website/App capsule.
    setDeploymentIntent(null)
    focusComposer()
  }, [actorAtRender, chatHref, conversationAtRender, directSelectionAtRender, routeAtRender, clearDraft, draft, engine, focusComposer, projectWorkspace, projectRef, routedConversationId, setConversationRouteId, setDeploymentIntent, submitCurrentDraft, syncConversationUrl])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submitDraft()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // IME 的 229 按键同样只确认候选词，即使该事件的 isComposing 已为 false。
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
      event.preventDefault()
      submitDraft()
    }
  }

  const handlePrompt = useCallback((prompt: string, intent?: CreationIntent) => {
    setDeploymentIntent(intent ?? null)
    updateDraft(prompt)
    // Radix restores focus to the DropdownMenu trigger after its close
    // commit. One frame is too early in a real browser: the textarea receives
    // focus and is then immediately replaced by the trigger. Hand off after
    // two frames so every prompt starter leaves the caret in the Composer.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => focusComposer())
    })
  }, [focusComposer, setDeploymentIntent, updateDraft])

  const handleCreationIntentSelect = useCallback((intent: CreationIntent) => {
    // A capability capsule is a mode switch, not a prompt starter. Manus
    // keeps the editor empty after this click so the selected workflow can
    // provide its own placeholder, model and examples below the Composer.
    setDeploymentIntent(intent)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => focusComposer())
    })
  }, [focusComposer, setDeploymentIntent])

  const startNewChatWithUrl = useCallback(() => {
    if (projectWorkspace) {
      // The global New task action belongs to the direct inbox, not to the
      // current project. Keep its draft, unknown POST and run untouched.
      if (!preview) {
        try {
          if (!readBoundary?.admitted || !readBoundary.subject
            || readBrowserAuthIndexSubject() !== readBoundary.subject) return false
        } catch { return false }
      }
      const direct = browserEngine({ preview, scope: DIRECT_SESSION_SCOPE })
      if (!direct) return false
      const release = retainBrowserEngine(direct)
      try {
        // Reset the target before navigation can publish its retained engine;
        // otherwise the previous direct thread would reclaim the clean URL.
        const previousId = direct.getSnapshot().store?.activeId
        direct.newConversation()
        if (direct.getSnapshot().store?.activeId === previousId) return false
        setDeploymentIntent(null)
        navigateMountedSurface(chatHref)
      } finally { release() }
      return true
    }
    if (!startNewChat()) return false
    setDeploymentIntent(null)
    // Catalog pages share this mounted shell with the direct inbox. Starting
    // a conversation from Agent/Skills/etc. must leave the catalog surface; merely
    // clearing `conversation` keeps the catalog mounted and looks like a
    // dead button because its landing content has no Composer.
    // A retained callback can outlive that render's standalone projection.
    if (standaloneSurface || (typeof window !== "undefined" && window.location.pathname !== new URL(chatHref, window.location.href).pathname)) {
      navigateMountedSurface(chatHref)
    }
    syncConversationUrl(null, "push")
    setConversationRouteId(null)
    return true
  }, [chatHref, preview, projectWorkspace, readBoundary, setConversationRouteId, setDeploymentIntent, standaloneSurface, startNewChat, syncConversationUrl])

  const selectConversationWithUrl = useCallback((id: string) => {
    // A creation mode is a pending action for the current direct-chat draft,
    // not a property of the conversation being opened. Clear both the shell
    // projection and its persisted fallback before activating another direct
    // session so the next empty composer starts neutral.
    if (!projectWorkspace && id !== activeId) {
      setDeploymentIntent(null)
    }
    if (standaloneSurface && typeof window !== "undefined") {
      // Library/other catalog pages share this shell, but the conversation
      // timeline only exists on the direct Chat route. Move the mounted
      // surface first and carry the selected id in the canonical query so an
      // "open source" action cannot appear to do nothing on the catalog.
      const next = new URL(chatHref, window.location.href)
      next.searchParams.set("conversation", id)
      navigateMountedSurface(`${next.pathname}${next.search}${next.hash}`)
    }
    syncConversationUrl(id, "push")
    setConversationRouteId(id)
    selectConversation(id)
  }, [activeId, chatHref, projectWorkspace, selectConversation, setConversationRouteId, setDeploymentIntent, standaloneSurface, syncConversationUrl])

  // CommandDialog 的 workspace action 会抑制默认焦点回收；新对话仍需
  // 在关闭动画完成后把焦点交给 Composer，否则焦点会落到 body。
  const startNewChatFromCommand = useCallback(() => {
    if (commandNewChatTimerRef.current !== null) {
      window.clearTimeout(commandNewChatTimerRef.current)
    }
    startNewChatWithUrl()
    commandNewChatTimerRef.current = window.setTimeout(() => {
      commandNewChatTimerRef.current = null
      focusComposer()
    }, overlayHandoffDelay(COMMAND_SETTINGS_HANDOFF_MS))
  }, [commandNewChatTimerRef, focusComposer, startNewChatWithUrl])

  const startNewChatAndFocus = useCallback(() => {
    // Rail buttons and the keyboard shortcut do not have a closing Dialog to
    // hand off from; focus the fresh Composer in the same interaction instead
    // of leaving it on the document body or on a stale navigation action.
    const surfaceHandoff = standaloneSurface || projectWorkspace
      || (typeof window !== "undefined" && window.location.pathname !== new URL(chatHref, window.location.href).pathname)
    if (!startNewChatWithUrl()) return
    if (surfaceHandoff) {
      // Catalog navigation and leaving a project both replace the empty
      // surface in the next React commit. Let the fresh Composer mount before
      // handing it focus; otherwise the click succeeds but focus stays on the
      // rail (or falls back to document.body).
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => focusComposer())
      })
    } else {
      focusComposer()
    }
  }, [chatHref, focusComposer, projectWorkspace, standaloneSurface, startNewChatWithUrl])

  const handOffChatPrompt = useCallback((prompt: string) => {
    // A workflow handoff replaces the Settings fragment rather than replaying
    // its history entry. This keeps the direct-chat navigation authoritative
    // and prevents a delayed browser back traversal from restoring the
    // catalogue after the prompt has already been staged.
    closeSettings("handoff")
    if (projectWorkspace) {
      // An explicit project Skill trial is scoped work, unlike the global
      // rail's New task. Preserve its project binding and selected Skill.
      if (!startNewChat()) return false
      const id = engine?.getSnapshot().store?.activeId ?? null
      syncConversationUrl(id, "push")
      setConversationRouteId(id)
    } else if (!startNewChatWithUrl()) return false
    const nextSessionId = engine?.getSnapshot().store?.activeId ?? null
    if (nextSessionId) stashConversationDraft(nextSessionId, prompt)
    else updateDraft(prompt)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        focusComposer()
      })
    })
    return true
  }, [closeSettings, engine, focusComposer, projectWorkspace, setConversationRouteId, startNewChat, startNewChatWithUrl, syncConversationUrl, updateDraft])

  const startSkillCreationFromSettings = useCallback((creationPrompt?: string) => {
    // Manus treats “create with AI” as a prompt starter, not an upload form:
    // return to a fresh direct Composer and seed the skill creator command.
    handOffChatPrompt(creationPrompt ?? t("skills.createPrompt"))
  }, [handOffChatPrompt, t])

  const startMcpTrial = useAppFrameMcpTrial({ engine, preview, boundary: readBoundary, handOffPrompt: handOffChatPrompt })

  const startSkillUseFromSettings = useCallback((skill: SkillCard, prompt?: string) => {
    return startTrial(skill, prompt ?? t("skills.tryPrompt", { brand: brandName ?? "Kokoro", name: skill.name }), handOffChatPrompt)
  }, [brandName, handOffChatPrompt, t, startTrial])

  const dismissCreationIntent = useCallback(() => {
    setDeploymentIntent(null)
    // The pill is removed synchronously. Hand the caret back after the commit
    // so the next keystroke continues in the same composer without a second
    // click, matching the reference's inline control handoff.
    window.requestAnimationFrame(() => focusComposer())
  }, [focusComposer, setDeploymentIntent])

  return {
    submitDraft,
    handleSubmit,
    handleKeyDown,
    handlePrompt,
    handleCreationIntentSelect,
    startNewChatWithUrl,
    selectConversationWithUrl,
    startNewChatFromCommand,
    startNewChatAndFocus,
    startSkillCreationFromSettings,
    startSkillUseFromSettings,
    selectSkillForCurrentDraft,
    startMcpTrial,
    selectedSkill,
    clearSelectedSkill,
    dismissCreationIntent,
  }
}
