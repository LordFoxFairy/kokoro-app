"use client"

import { ArrowUp, ArrowUpLeft, BarChart3, BriefcaseBusiness, Building2, ChartPie, ChevronDown, ChevronLeft, ChevronRight, Cloud, FileText, Folder, Gamepad2, Images, LayoutGrid, Link2, Map, PenLine, Rocket, Search, ShoppingBag, SquareTerminal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CodeWindowIcon } from "@/components/icons/code-window-icon"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { DEFAULT_BRAND } from "@/config/brand"
import { useT } from "@/i18n/context"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

import styles from "./kokoro-welcome.module.css"
import { CreationWorkflowSurface } from "./creation-workflow-surface"

function DesignWandIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path d="M3.45734 8.8606C3.98122 8.58202 4.57636 8.46514 5.16672 8.52455C5.75702 8.584 6.31637 8.8171 6.77418 9.19445C7.23199 9.57182 7.56761 10.0763 7.73864 10.6444C7.90965 11.2125 7.90844 11.8185 7.73506 12.3859C7.56163 12.9533 7.22383 13.4566 6.76445 13.832C6.30502 14.2074 5.74454 14.4384 5.15398 14.4954L2.8314 14.7191C2.56897 14.7447 2.30486 14.6918 2.07245 14.5672C1.83971 14.4425 1.64913 14.2514 1.52509 14.0182C1.4011 13.7852 1.34936 13.5202 1.37593 13.2576C1.40182 13.0023 1.50129 12.7606 1.66129 12.5603C1.82874 12.3431 1.90648 12.0699 1.8801 11.7969C1.82321 11.2063 1.9424 10.6121 2.22315 10.0894C2.50391 9.56685 2.93359 9.13919 3.45734 8.8606ZM3.21569 11.7833C3.24359 12.3549 3.06713 12.9192 2.71623 13.3744C2.71163 13.3803 2.70702 13.3863 2.70223 13.3921L5.02611 13.1682C5.35412 13.1365 5.66552 13.0086 5.92071 12.8001C6.17592 12.5915 6.3637 12.3118 6.46008 11.9966C6.55641 11.6815 6.55728 11.3446 6.46235 11.029C6.36734 10.7134 6.18056 10.4329 5.92622 10.2232C5.67186 10.0136 5.36085 9.8838 5.03287 9.85079C4.70496 9.81783 4.37452 9.88301 4.08354 10.0377C3.79255 10.1925 3.5538 10.4302 3.39781 10.7206C3.24189 11.0109 3.17569 11.341 3.20729 11.669L3.21569 11.7833Z" fill="currentColor" />
      <path d="M13.3477 1.27466C13.8492 1.27466 14.3305 1.47412 14.685 1.82869C15.0393 2.18324 15.2384 2.66401 15.2384 3.16528C15.2384 3.66655 15.0393 4.14733 14.685 4.50187L7.33407 11.8515L6.43954 10.8606L13.7416 3.55916C13.8461 3.45466 13.905 3.31311 13.905 3.16528C13.905 3.01746 13.8461 2.87591 13.7416 2.7714C13.6371 2.6669 13.4955 2.60799 13.3477 2.60799C13.2001 2.60803 13.0583 2.66694 12.9539 2.7714L5.6928 10.0325L4.79957 9.04093L12.0112 1.82869C12.3656 1.47416 12.8464 1.2747 13.3477 1.27466Z" fill="currentColor" />
      <path d="M12.2603 11.0332L12.6816 12.1715L13.8199 12.5927L12.6816 13.014L12.2603 14.1523L11.8391 13.014L10.7008 12.5927L11.8391 12.1715L12.2603 11.0332Z" fill="currentColor" stroke="currentColor" strokeWidth=".8316" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.19513 1.27466L4.82098 2.966L6.51233 3.59186L4.82098 4.21771L4.19513 5.90906L3.56928 4.21771L1.87793 3.59186L3.56928 2.966L4.19513 1.27466Z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FigmaMark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg data-slot="figma-mark" viewBox="0 0 14 14" aria-hidden="true" {...props}>
      <path d="M2.5 0h2.25a2.25 2.25 0 0 1 0 4.5H2.5A2.25 2.25 0 0 1 2.5 0Z" fill="#f24e1e" />
      <path d="M7 0h2.25a2.25 2.25 0 1 1 0 4.5H7V0Z" fill="#ff7262" />
      <path d="M2.5 4.75H7v4.5H2.5a2.25 2.25 0 1 1 0-4.5Z" fill="#a259ff" />
      <circle cx="9.25" cy="7" r="2.25" fill="#1abcfe" />
      <path d="M2.5 9.5H7v2.25A2.25 2.25 0 1 1 2.5 9.5Z" fill="#0acf83" />
    </svg>
  )
}

function ShopifyMark() {
  return <span className={styles.shopifyMark} data-slot="shopify-mark" aria-hidden="true">S</span>
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
  const t = useT()
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

  const activeBanner = desktopBanners[bannerIndex]

  return (
    <section
      ref={surfaceRef}
      className={styles.directSurface}
      data-slot="direct-chat-welcome"
      data-desktop-web="true"
      data-has-draft={hasDraft || undefined}
      data-creation-intent={creationIntent}
      data-creation-type-selected={selectedCreationType ? "true" : undefined}
      aria-labelledby="kokoro-direct-chat-heading"
    >
      <div className={styles.directContent}>
        <div className={styles.directIntro}>
          <div className={styles.directPlan}>
            <span>{t("firstSite.freePlan")}</span>
            <Separator orientation="vertical" className={styles.directPlanSeparator} />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={styles.directPlanAction}
              onClick={() => onOpenSettings?.("subscription")}
            >
              {t("firstSite.upgrade")}
            </Button>
          </div>
          <h1 id="kokoro-direct-chat-heading">{t("firstSite.chatHeading")}</h1>
          <p>{t("firstSite.chatSubhead", { brand: brandName })}</p>
        </div>

        <div className={styles.directComposer}>
          {composer}
          {showDraftProjectContext ? (
            <div className={styles.draftProjectContext}>
              <span className={styles.draftProjectIcon} aria-hidden="true"><Folder /></span>
              <div className={styles.draftProjectCopy}>
                <p className={styles.draftProjectTitle}>{t("firstSite.keepProjectOrganized")}</p>
                <p className={styles.draftProjectDescription}>{t("firstSite.keepProjectOrganizedHint")}</p>
              </div>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={styles.draftProjectAction}
                  >
                    {selectedProject ?? t("firstSite.addToProject")}
                    <ChevronDown aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  side="bottom"
                  sideOffset={6}
                >
                  <DropdownMenuItem onSelect={() => {
                    setSelectedProject(brandName)
                    onOpenProject?.("kokoro", draft)
                  }}>
                    <Folder data-icon="inline-start" aria-hidden="true" />
                    {brandName}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => {
                    setSelectedProject(t("firstSite.newProject"))
                    onOpenProject?.("preview-project", draft)
                  }}>
                    {t("firstSite.newProject")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>

        {showDirectPrompts ? <div className={styles.directPrompts} role="group" aria-label={t("shell.subhead")}>
          {directPrompts.map(({ title, description, prompt, intent, icon: PromptIcon }) => (
            <Button
              key={title}
              type="button"
              variant="outline"
              size="sm"
              className={styles.directPrompt}
              aria-label={`${t(title)} ${t(description)}`}
              onClick={() => {
                // The row is a capability switch. Keep the draft empty and
                // let the selected workflow render its own Composer state;
                // starter cards remain the place that inserts prompt text.
                if (intent && onCreationIntentSelect) {
                  onCreationIntentSelect(intent)
                  return
                }
                onPrompt?.(t(prompt), intent)
              }}
            >
              <PromptIcon aria-hidden="true" />
              <span>{t(title)}</span>
            </Button>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className={styles.directPrompt} data-direct-more="true">
                <span>{t("firstSite.more")}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="center"
              side="bottom"
              sideOffset={8}
              onCloseAutoFocus={(event) => {
                if (promptSelectedRef.current) {
                  event.preventDefault()
                  promptSelectedRef.current = false
                }
              }}
            >
              {scenarios.map(({ title, prompt, icon: ScenarioIcon }) => (
                <DropdownMenuItem
                  key={title}
                  onSelect={() => {
                    promptSelectedRef.current = true
                    onPrompt?.(t(prompt))
                  }}
                >
                  <ScenarioIcon data-icon="inline-start" aria-hidden="true" />
                  {t(title)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div> : websiteCreation ? (
          <section className={styles.creationOptions} aria-labelledby="kokoro-creation-options-heading">
            <div className={styles.creationOptionsHeader}>
              <p id="kokoro-creation-options-heading">{t("firstSite.whatToBuild")}</p>
              <div className={styles.creationReferences}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReferenceStatus(null)
                    if (referenceInputRef.current) {
                      referenceInputRef.current.value = ""
                      referenceInputRef.current.click()
                    }
                  }}
                >
                  <Link2 aria-hidden="true" />{t("firstSite.addWebsiteReference")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setReferenceStatus(t("firstSite.importFromDesign"))}
                >
                  <FigmaMark />{t("firstSite.importFromDesign")}
                </Button>
                <input
                  ref={referenceInputRef}
                  className={styles.referenceInput}
                  type="file"
                  accept="image/*,.pdf,.zip,.html,.css,.js"
                  aria-label={t("firstSite.addWebsiteReference")}
                  onChange={(event) => {
                    const fileName = event.currentTarget.files?.[0]?.name
                    setReferenceStatus(fileName ?? null)
                  }}
                />
              </div>
            </div>
            <span className="sr-only" role="status" aria-live="polite">{referenceStatus ?? ""}</span>
            <div className={styles.creationTypesFrame}>
              <div
                ref={creationTypesRef}
                id="kokoro-creation-types"
                className={styles.creationTypes}
                role="group"
                aria-label={t("firstSite.whatToBuild")}
                onScroll={(event) => {
                  const row = event.currentTarget
                  const maxScrollLeft = Math.max(0, row.scrollWidth - row.clientWidth)
                  // The arrow describes the next available page, not whether
                  // the row has moved by one pixel. This keeps its direction
                  // stable while a smooth scroll is still settling and when
                  // the viewport is resized at a desktop breakpoint.
                  // Any meaningful horizontal movement means the previous
                  // control is the useful action. Waiting for the exact end
                  // of a smooth scroll leaves a misleading “next” arrow
                  // visible while the row is already partially revealed.
                  setCreationTypesScrolled(maxScrollLeft > 1 && row.scrollLeft > 1)
                }}
              >
                {creationTypes.map(({ label, badge, icon: TypeIcon }) => (
                  <Button key={label} type="button" variant="outline" className={styles.creationType} onClick={() => setSelectedCreationType(label)}>
                    <TypeIcon aria-hidden="true" />
                    <span>{t(label)}</span>
                    {badge ? (
                      <span className={styles.creationBadge}>
                        <span aria-hidden="true">·</span>
                        <ShopifyMark />
                        <small>{t(badge)}</small>
                      </span>
                    ) : null}
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                className={styles.creationNext}
                data-direction={creationTypesScrolled ? "previous" : "next"}
                aria-label={t(creationTypesScrolled ? "firstSite.previous" : "firstSite.more")}
                aria-controls="kokoro-creation-types"
                onClick={() => {
                  const typeRow = creationTypesRef.current
                  if (!typeRow) return
                  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
                  typeRow.scrollTo({
                    left: creationTypesScrolled ? 0 : Math.max(0, typeRow.scrollWidth - typeRow.clientWidth),
                    behavior: prefersReducedMotion ? "auto" : "smooth",
                  })
                }}
              >
                {creationTypesScrolled ? <ChevronLeft aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
              </Button>
            </div>
            {websiteCreation && selectedCreationType ? (
              <div className={styles.ideaSection}>
                <p className={styles.ideaTitle}>{t("firstSite.exploreIdeas")}</p>
                <div className={styles.ideaList} role="list">
                  {creationIdeas.map(({ label, prompt }) => (
                    <Button
                      key={label}
                      type="button"
                      variant="outline"
                      className={styles.ideaButton}
                      onClick={() => onPrompt?.(t(prompt), "website")}
                    >
                      <span>{t(label)}</span>
                      <ArrowUpLeft aria-hidden="true" />
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className={styles.integrationPreview}>
              <div className={styles.integrationCopy}>
                <strong>{t("firstSite.builtInIntegrations")} <ChevronRight aria-hidden="true" /></strong>
                <div className={styles.integrationChips}>
                  {["firstSite.integrationModels", "firstSite.integrationCommerce", "firstSite.integrationDatabase", "firstSite.integrationImages", "firstSite.integrationMaps", "firstSite.integrationNotifications", "firstSite.integrationStorage", "firstSite.integrationApi", "firstSite.integrationPayments", "firstSite.integrationSpeech"].map((key) => (
                    <span key={key}>{t(key as Parameters<typeof t>[0])}</span>
                  ))}
                </div>
              </div>
              <div className={styles.integrationArtwork} data-slot="integration-artwork" aria-hidden="true">
                <span className={styles.integrationWindow}>
                  <i /><i /><i />
                  <b>AI website builder</b>
                  <span className={styles.integrationChart}>
                    <small>682</small>
                    <BarChart3 />
                  </span>
                </span>
                <span className={styles.integrationConnector}>S</span>
                <span className={styles.integrationServicePanel}>
                  <span><em>S</em><b>Payments</b></span>
                  <i /><i /><i />
                </span>
              </div>
            </div>
          </section>
        ) : null}

        {appCreation ? (
          <div className={styles.appSuggestions} aria-label={t("settings.deploymentAppSuggestions")}>
            {appSuggestions.map((prompt) => (
              <button key={prompt} type="button" onClick={() => onPrompt?.(t(prompt), "app")}>
                <span>{t(prompt)}</span>
                <ArrowUp aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}

        {showStarterCards && creativeIntent ? <CreationWorkflowSurface intent={creativeIntent} onPrompt={onPrompt} /> : null}

        {!hasDraft && !creationIntent ? <div
          className={styles.desktopCarousel}
          role="region"
          aria-label={t("firstSite.desktopBanner", { brand: brandName })}
          onMouseEnter={() => setBannerPaused(true)}
          onMouseLeave={() => setBannerPaused(false)}
          onFocusCapture={() => setBannerPaused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setBannerPaused(false)
          }}
        >
          <div className={styles.desktopBanner} key={activeBanner.title} data-slot="welcome-promotion" aria-live="polite">
          <div className={styles.desktopBannerCopy}>
            <strong>{t(activeBanner.title)}</strong>
            <span>{t(activeBanner.hint)}</span>
          </div>
          <div className={styles.desktopBannerArtwork} data-banner-kind={activeBanner.kind} aria-hidden="true">
            <span className={styles.desktopBannerWindow}>
              <span className={styles.desktopBannerWindowBar}><i /><i /><i /></span>
              <b>{activeBanner.kind === "website" ? "AI website builder" : "Kokoro workspace"}</b>
              <span className={styles.desktopBannerChart}><i /><i /><i /></span>
              <span className={styles.desktopBannerService}><i />{activeBanner.kind === "schedule" ? "Tasks" : "Workspace"}</span>
            </span>
            <span className={styles.desktopBannerStand} />
          </div>
          </div>
          <div className={styles.bannerDots}>
            {desktopBanners.map((banner, index) => (
              <button
                key={banner.title}
                type="button"
                data-active={index === bannerIndex || undefined}
                aria-label={`${index + 1} / ${desktopBanners.length}`}
                aria-current={index === bannerIndex ? "true" : undefined}
                onClick={() => setBannerIndex(index)}
              />
            ))}
          </div>
        </div> : null}
      </div>
    </section>
  )
}

const directPrompts = [
  { title: "firstSite.promptBrief", description: "scenario.writeDesc", prompt: "scenario.writePrompt", intent: "presentation", icon: BriefcaseBusiness },
  { title: "firstSite.promptWebsite", description: "firstSite.websitePrompt", prompt: "firstSite.websitePrompt", intent: "website", icon: CodeWindowIcon },
  { title: "firstSite.promptDesign", description: "scenario.dataDesc", prompt: "scenario.dataPrompt", intent: "design", icon: DesignWandIcon },
  { title: "firstSite.promptGame", description: "scenario.codeDesc", prompt: "scenario.codePrompt", intent: "game", icon: Gamepad2 },
] as const

const desktopBanners = [
  { title: "firstSite.desktopBanner", hint: "firstSite.desktopBannerHint", kind: "workspace" },
  { title: "firstSite.promptWebsite", hint: "firstSite.websitesHint", kind: "website" },
  { title: "firstSite.scheduledTasks", hint: "firstSite.scheduledTasksHint", kind: "schedule" },
  { title: "settings.integration.slack.name", hint: "settings.integration.slack.description", kind: "integration" },
  { title: "settings.integration.zapier.name", hint: "settings.integration.zapier.description", kind: "integration" },
] as const

const creationTypes = [
  { label: "firstSite.buildCommerce", badge: "firstSite.shopify", icon: ShoppingBag },
  { label: "firstSite.buildLanding", badge: null, icon: LayoutGrid },
  { label: "firstSite.buildDashboard", badge: null, icon: ChartPie },
  { label: "firstSite.buildPortfolio", badge: null, icon: Images },
  { label: "firstSite.buildEnterprise", badge: null, icon: Building2 },
  { label: "firstSite.buildSaas", badge: null, icon: Cloud },
  { label: "firstSite.buildLinkPage", badge: null, icon: Link2 },
  { label: "firstSite.buildBlog", badge: null, icon: FileText },
  { label: "firstSite.buildMiniGame", badge: null, icon: Gamepad2 },
  { label: "firstSite.buildProductivity", badge: null, icon: Rocket },
] as const

const creationIdeas = [
  { label: "firstSite.ideaProductLaunch", prompt: "firstSite.ideaProductPrompt" },
  { label: "firstSite.ideaWaitlist", prompt: "firstSite.ideaWaitlistPrompt" },
  { label: "firstSite.ideaAppDownload", prompt: "firstSite.ideaAppDownloadPrompt" },
] as const

const scenarios = [
  { title: "scenario.writeTitle", description: "scenario.writeDesc", prompt: "scenario.writePrompt", icon: PenLine },
  { title: "scenario.researchTitle", description: "scenario.researchDesc", prompt: "scenario.researchPrompt", icon: Search },
  { title: "scenario.dataTitle", description: "scenario.dataDesc", prompt: "scenario.dataPrompt", icon: BarChart3 },
  { title: "scenario.planTitle", description: "scenario.planDesc", prompt: "scenario.planPrompt", icon: Map },
  { title: "scenario.codeTitle", description: "scenario.codeDesc", prompt: "scenario.codePrompt", icon: SquareTerminal },
  { title: "scenario.summaryTitle", description: "scenario.summaryDesc", prompt: "scenario.summaryPrompt", icon: FileText },
] as const

const appSuggestions = [
  "firstSite.appSuggestionLearning",
  "firstSite.appSuggestionExpenses",
  "firstSite.appSuggestionPersonalSpending",
  "firstSite.appSuggestionTasks",
  "firstSite.appSuggestionProductivity",
] as const
