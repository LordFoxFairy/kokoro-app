"use client"

import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { DEFAULT_BRAND } from "@/config/brand"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { DirectWelcomeContent, desktopBanners } from "./kokoro-welcome-content"
import coreStyles from "./kokoro-welcome-direct-core.module.css"
import responsiveStyles from "./kokoro-welcome-direct-responsive.module.css"

const PREVIEW_PROJECT_REF = "preview-project"
let previewProjectFallbackSequence = 0

/** Allocate an opaque project ref for the local preview instead of reusing one route. */
export function createPreviewProjectRef(): string {
  const randomUuid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : null
  if (randomUuid) return `${PREVIEW_PROJECT_REF}-${randomUuid}`

  previewProjectFallbackSequence += 1
  return `${PREVIEW_PROJECT_REF}-${Date.now().toString(36)}-${previewProjectFallbackSequence}`
}

/**
 * The direct inbox is a standalone chat surface. Project workspaces use a
 * separate component because their task list and context are persistent.
 */
type DirectChatWelcomeProps = Pick<EmptyStateProps, "brandName" | "composer" | "draft" | "creationIntent" | "onOpenSettings" | "onCreationIntentSelect" | "onOpenProject"> & {
  onPrompt?: EmptyStateProps["onPrompt"]
}

export function KokoroDirectChatWelcome({
  brandName = DEFAULT_BRAND.name,
  composer,
  draft = "",
  creationIntent,
  onPrompt,
  onCreationIntentSelect,
  onOpenSettings,
  onOpenProject,
}: DirectChatWelcomeProps = {}) {
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [selectedCreationType, setSelectedCreationType] = useState<string | null>(null)
  const [creationTypesScrolled, setCreationTypesScrolled] = useState(false)
  const [bannerIndex, setBannerIndex] = useState(0)
  const [bannerPaused, setBannerPaused] = useState(false)
  const [referenceStatus, setReferenceStatus] = useState<string | null>(null)
  const promptSelectedRef = useRef(false)
  const creationTypesRef = useRef<HTMLDivElement>(null)
  const referenceInputRef = useRef<HTMLInputElement>(null)
  const surfaceRef = useRef<HTMLElement>(null)
  const hasDraft = draft.trim().length > 0
  const websiteCreation = creationIntent === "website"
  const appCreation = creationIntent === "app"
  // The project-context rail belongs to the explicit website creation
  // workflow, including its empty placeholder state. Manus keeps this rail
  // visible before the first character is entered; dismissing the capsule
  // clears the intent and removes the rail together with the creation row.
  const showDraftProjectContext = creationIntent === "website"
  const showDirectPrompts = !creationIntent && !hasDraft
  // The neutral inbox uses the compact capability rail and promotion carousel.
  // The larger starter cards only belong to a selected creative workflow;
  // otherwise they compete with the capsules and make the welcome surface
  // look like two different home pages stacked together.
  const creativeIntent = creationIntent === "presentation" || creationIntent === "design" || creationIntent === "game"
    ? creationIntent
    : null
  const showStarterCards = creativeIntent !== null

  useEffect(() => {
    if (hasDraft || bannerPaused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const timer = window.setInterval(() => {
      setBannerIndex((current) => (current + 1) % desktopBanners.length)
    }, 6_000)
    return () => window.clearInterval(timer)
  }, [bannerPaused, hasDraft])

  useLayoutEffect(() => {
    // The welcome surface is its own scroll container. Reset it whenever the
    // direct workbench mounts or the creation capsule changes so a previous
    // catalog visit cannot reopen the homepage halfway down the document.
    if (surfaceRef.current) surfaceRef.current.scrollTop = 0
  }, [creationIntent])

  useEffect(() => {
    if (!creationIntent) return
    let innerFrame = 0
    const outerFrame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(() => {
        // The starter button disappears when a creation mode mounts. In a
        // real browser that layout/focus handoff can retain a stale ~59px
        // scroll offset even though Composer focuses with preventScroll.
        // Reset this site-owned viewport after the same two-frame handoff.
        if (surfaceRef.current) surfaceRef.current.scrollTop = 0
      })
    })
    return () => {
      window.cancelAnimationFrame(outerFrame)
      window.cancelAnimationFrame(innerFrame)
    }
  }, [creationIntent])

  useLayoutEffect(() => {
    if (!websiteCreation || !selectedCreationType || !surfaceRef.current) return
    // Adding the idea row changes the scroll anchor. Chromium otherwise
    // compensates by roughly the full inserted height, hiding the plan and
    // heading. Manus keeps only the small 12.5px reveal needed for the newly
    // expanded row at the 1280×720 desktop baseline.
    const maxScrollTop = Math.max(0, surfaceRef.current.scrollHeight - surfaceRef.current.clientHeight)
    surfaceRef.current.scrollTop = Math.min(12.5, maxScrollTop)
  }, [selectedCreationType, websiteCreation])

  return (
    <section
      ref={surfaceRef}
      className={`${coreStyles.directSurface} ${responsiveStyles.directSurface}`}
      data-slot="direct-chat-welcome"
      data-desktop-web="true"
      data-has-draft={hasDraft || undefined}
      data-creation-intent={creationIntent}
      data-creation-type-selected={selectedCreationType ? "true" : undefined}
      aria-labelledby="kokoro-direct-chat-heading"
    >
      <DirectWelcomeContent brandName={brandName} composer={composer} draft={draft} creationIntent={creationIntent} selectedProject={selectedProject} setSelectedProject={setSelectedProject} selectedCreationType={selectedCreationType} setSelectedCreationType={setSelectedCreationType} creationTypesScrolled={creationTypesScrolled} setCreationTypesScrolled={setCreationTypesScrolled} referenceStatus={referenceStatus} setReferenceStatus={setReferenceStatus} {...(onPrompt === undefined ? {} : { onPrompt })} {...(onCreationIntentSelect === undefined ? {} : { onCreationIntentSelect })} {...(onOpenSettings === undefined ? {} : { onOpenSettings })} {...(onOpenProject === undefined ? {} : { onOpenProject })} websiteCreation={websiteCreation} appCreation={appCreation} showDraftProjectContext={showDraftProjectContext} showDirectPrompts={showDirectPrompts} showStarterCards={showStarterCards} creativeIntent={creativeIntent} bannerIndex={bannerIndex} setBannerIndex={setBannerIndex} setBannerPaused={setBannerPaused} createPreviewProjectRef={createPreviewProjectRef} promptSelectedRef={promptSelectedRef} creationTypesRef={creationTypesRef} referenceInputRef={referenceInputRef} />
    </section>
  )
}
