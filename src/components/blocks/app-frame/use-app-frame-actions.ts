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
import { togglePinned } from "@/ui/shell/use-pinned-skills"
import type { ConversationListController } from "@/ui/shell/use-conversation-list"
import { navigateMountedSurface } from "@/ui/navigation/mounted-surface-navigation"
import { overlayHandoffDelay } from "@/ui/shell/overlay-handoff"

import { COMMAND_SETTINGS_HANDOFF_MS } from "./app-frame-helpers"

export type AppFrameActionsOptions = {
  engine: SessionEngine | null
  projectWorkspace: boolean
  standaloneSurface: boolean
  chatHref: string
  activeId: string | null
  draft: string
  clearDraft: () => void
  updateDraft: (value: string) => void
  setDeploymentIntent: (intent: CreationIntent | null) => void
  syncConversationUrl: (id: string | null, mode: "push" | "replace") => void
  setConversationRouteId: (id: string | null) => void
  conversations: ConversationListController
  focusComposer: () => void
  closeSettings: () => void
  brandName: string | undefined
  pinnedSkills: readonly string[]
  commandNewChatTimerRef: MutableRefObject<number | null>
}

/** Owns user actions that bridge the shell state to session and Composer commands. */
export function useAppFrameActions({
  engine,
  projectWorkspace,
  standaloneSurface,
  chatHref,
  activeId,
  draft,
  clearDraft,
  updateDraft,
  setDeploymentIntent,
  syncConversationUrl,
  setConversationRouteId,
  conversations,
  focusComposer,
  closeSettings,
  brandName,
  pinnedSkills,
  commandNewChatTimerRef,
}: AppFrameActionsOptions) {
  const t = useT()
  const { startNewChat, selectConversation } = conversations

  const submitDraft = useCallback(() => {
    const content = draft.trim()
    if (!engine || !content || content.length > MAX_INPUT_LENGTH) {
      return
    }
    // 流式中提交=运行中插话（engine 识别活跃相位走 steer，不打断本轮）。
    engine.submit(content)
    if (projectWorkspace) {
      // A first project message creates its opaque conversation in the shared
      // engine before the next render. Update both URL and route projection at
      // the user action boundary; replaceState alone does not notify App
      // Router, so waiting for a route effect would leave the overview painted
      // beside a newly-created task.
      const projectConversationId = engine.getSnapshot().store?.activeId ?? null
      if (projectConversationId !== null) {
        syncConversationUrl(projectConversationId, "replace")
        setConversationRouteId(projectConversationId)
      }
    }
    clearDraft()
    // Creation intent belongs to the empty composer only. Clear its persisted
    // projection as soon as the user commits the first message so a later
    // blank conversation cannot inherit a stale Website/App capsule.
    setDeploymentIntent(null)
    focusComposer()
  }, [clearDraft, draft, engine, focusComposer, projectWorkspace, setConversationRouteId, setDeploymentIntent, syncConversationUrl])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submitDraft()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送 / Shift+Enter 换行；IME 合成期（拼音选词）的 Enter 只确认候选词，不发送。
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
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
    setDeploymentIntent(null)
    // Catalog pages share this mounted shell with the direct inbox. Starting
    // a task from Agent/Skills/etc. must leave the catalog surface; merely
    // clearing `conversation` keeps the catalog mounted and looks like a
    // dead button because its landing content has no Composer.
    if (standaloneSurface) {
      navigateMountedSurface(chatHref)
    }
    startNewChat()
    if (projectWorkspace) {
      // The project overview stays at `/app/project/{ref}`. A fresh task gets
      // its own opaque conversation route, which makes task creation and the
      // persistent project surface independently addressable.
      const nextProjectConversationId = engine?.getSnapshot().store?.activeId ?? null
      syncConversationUrl(nextProjectConversationId, "push")
      setConversationRouteId(nextProjectConversationId)
      return
    }
    syncConversationUrl(null, "push")
    setConversationRouteId(null)
  }, [chatHref, engine, projectWorkspace, setConversationRouteId, setDeploymentIntent, standaloneSurface, startNewChat, syncConversationUrl])

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
    startNewChatWithUrl()
    if (standaloneSurface || projectWorkspace) {
      // Catalog navigation and project-task creation both replace the empty
      // surface in the next React commit. Let the fresh Composer mount before
      // handing it focus; otherwise the click succeeds but focus stays on the
      // rail (or falls back to document.body).
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => focusComposer())
      })
    } else {
      focusComposer()
    }
  }, [focusComposer, projectWorkspace, standaloneSurface, startNewChatWithUrl])

  const startDeploymentFromSettings = useCallback((kind: "website" | "app") => {
    // Deployment shortcuts mirror the matching welcome actions: preserve the
    // current empty workspace and hand the prompt directly to its Composer.
    // Creating another session here would move the draft to a different
    // per-conversation key before React can render it.
    closeSettings()
    setDeploymentIntent(kind)
    window.requestAnimationFrame(() => {
      focusComposer()
    })
  }, [closeSettings, focusComposer, setDeploymentIntent])

  const startSkillCreationFromSettings = useCallback(() => {
    // Manus treats “create with AI” as a prompt starter, not an upload form:
    // close Settings, return to the direct Composer, and seed the skill
    // creator command in a fresh session.
    closeSettings()
    startNewChatWithUrl()
    const prompt = t("skills.createPrompt")
    const nextSessionId = engine?.getSnapshot().store?.activeId ?? null
    if (nextSessionId) stashConversationDraft(nextSessionId, prompt)
    else updateDraft(prompt)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => focusComposer())
    })
  }, [closeSettings, engine, focusComposer, startNewChatWithUrl, t, updateDraft])

  const startSkillUseFromSettings = useCallback((skill: SkillCard, prompt?: string) => {
    // Manus' skill detail CTA is a chat handoff, not a second detail dialog:
    // keep the skill pinned, start a fresh direct session, and seed one
    // inspectable example prompt so the user can edit it before submitting.
    closeSettings()
    startNewChatWithUrl()
    if (!pinnedSkills.includes(skill.name)) togglePinned(skill.name)
    const nextPrompt = prompt ?? t("skills.tryPrompt", { brand: brandName ?? "Kokoro", name: skill.name })
    const nextSessionId = engine?.getSnapshot().store?.activeId ?? null
    if (nextSessionId) stashConversationDraft(nextSessionId, nextPrompt)
    else updateDraft(nextPrompt)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => focusComposer())
    })
  }, [brandName, closeSettings, engine, focusComposer, pinnedSkills, startNewChatWithUrl, t, updateDraft])

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
    startDeploymentFromSettings,
    startSkillCreationFromSettings,
    startSkillUseFromSettings,
    dismissCreationIntent,
  }
}
