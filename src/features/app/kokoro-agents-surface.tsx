"use client"

import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { QRCodeSVG } from "qrcode.react"
import {
  BadgeCheck,
  Hash,
  IdCard,
  MessageCircleMore,
  MessagesSquare,
  Puzzle,
  Send,
  TriangleAlert,
  TvMinimal,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { useT } from "@/i18n/context"
import type { AgentClient, AgentConnectionSetup, AgentPlatform } from "@/agents/client"
import { browserAgentClient } from "@/ui/shell/page-clients"

import styles from "./kokoro-agents-surface.module.css"

const PLATFORM_VALUES = ["telegram", "line", "slack"] as const satisfies readonly AgentPlatform[]
type Platform = AgentPlatform
type SetupState = { kind: "loading" } | { kind: "error" } |
  { kind: "ready"; status: "connected" | "expired" } |
  { kind: "ready"; status: "pending" | "disconnected"; setup: AgentConnectionSetup; expiresAt: number }
const EXPIRED_SETUP = { kind: "ready", status: "expired" } as const
const MAX_TIMER_DELAY_MS = 2_147_483_647

const CONNECTION_STATUS_LABEL_KEYS = {
  connected: "settings.connected",
  expired: "team.errInviteExpired",
  pending: "team.pendingLabel",
  disconnected: "agents.disconnected",
} as const

const FEATURES = [
  { title: "agents.identityTitle", description: "agents.identityDescription", icon: IdCard },
  { title: "agents.memoryTitle", description: "agents.memoryDescription", icon: TvMinimal },
  { title: "agents.skillsTitle", description: "agents.skillsDescription", icon: Puzzle },
  { title: "agents.chatAppsTitle", description: "agents.chatAppsDescription", icon: MessageCircleMore },
] as const

function receivedSetup(setup: AgentConnectionSetup): SetupState {
  if (setup.status === "connected") return { kind: "ready", status: "connected" }
  if (setup.status === "expired") return EXPIRED_SETUP
  const expiresAt = Date.parse(setup.expires_at)
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return EXPIRED_SETUP
  return { kind: "ready", status: setup.status, setup, expiresAt }
}

function PlatformMark({ platform }: { platform: Platform | "whatsapp" | "messenger" }) {
  if (platform === "telegram") return <Send aria-hidden="true" />
  if (platform === "slack") return <Hash aria-hidden="true" />
  if (platform === "line") return <MessageCircleMore aria-hidden="true" />
  if (platform === "whatsapp") return <MessageCircleMore aria-hidden="true" />
  return <MessagesSquare aria-hidden="true" />
}

function AgentArtwork({ brandName }: { brandName: string }) {
  return (
    <div className={styles.artwork} aria-hidden="true">
      <div className={styles.platformBubble} data-platform="telegram"><PlatformMark platform="telegram" /></div>
      <div className={styles.platformBubble} data-platform="messenger"><PlatformMark platform="messenger" /></div>
      <div className={styles.platformBubble} data-platform="line"><PlatformMark platform="line" /></div>
      <div className={styles.platformBubble} data-platform="whatsapp"><PlatformMark platform="whatsapp" /></div>
      <div className={styles.platformBubble} data-platform="slack"><PlatformMark platform="slack" /></div>
      <div className={styles.agentDevice} />
      <div className={styles.agentCard}>
        <div className={styles.agentAvatar}><IdCard /></div>
        <div className={styles.agentIdentity}>
          <strong>{brandName}</strong>
          <BadgeCheck className={styles.verified} aria-hidden="true" />
          <i />
          <i />
        </div>
      </div>
    </div>
  )
}

function SetupDialog({
  open,
  onOpenChange,
  client,
  returnFocusRef,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  client: AgentClient
  returnFocusRef: RefObject<HTMLButtonElement | null>
}) {
  const t = useT()
  const [platform, setPlatform] = useState<Platform>("telegram")
  const [setupState, setSetupState] = useState<SetupState>({ kind: "loading" })
  const [retryKey, setRetryKey] = useState(0)
  const requestSeqRef = useRef(0)
  const setupRequestRef = useRef<AbortController | null>(null)
  const firstTabRef = useRef<HTMLButtonElement | null>(null)
  const tabRefs = useRef<Partial<Record<Platform, HTMLButtonElement | null>>>({})
  const activeConnectionStatus = setupState.kind === "ready" ? setupState.status : null
  const ticket = "setup" in setupState ? setupState : null
  const setupInstruction = t(platform === "slack" ? "agents.setupApprove" : "agents.setupScan")

  useEffect(() => {
    if (!open) return
    const requestSeq = ++requestSeqRef.current
    const controller = new AbortController()
    setupRequestRef.current = controller
    const current = () => requestSeq === requestSeqRef.current && !controller.signal.aborted
    void client.connectionSetup(platform, controller.signal).then((value) => {
      if (!current()) return
      setSetupState(value.platform === platform ? receivedSetup(value) : { kind: "error" })
    }).catch(() => {
      if (current()) setSetupState({ kind: "error" })
    })
    return () => {
      if (requestSeq === requestSeqRef.current) requestSeqRef.current += 1
      if (setupRequestRef.current === controller) setupRequestRef.current = null
      controller.abort()
    }
  }, [client, open, platform, retryKey])

  useEffect(() => {
    if (!open || ticket === null) return
    let timer: number | undefined
    let retired = false
    const checkExpiry = () => {
      if (retired) return
      window.clearTimeout(timer)
      const remaining = ticket.expiresAt - Date.now()
      if (remaining <= 0) setSetupState(current => current === ticket ? EXPIRED_SETUP : current)
      else timer = window.setTimeout(checkExpiry, Math.min(remaining, MAX_TIMER_DELAY_MS))
    }
    queueMicrotask(checkExpiry)
    window.addEventListener("focus", checkExpiry)
    document.addEventListener("visibilitychange", checkExpiry)
    return () => {
      retired = true
      window.clearTimeout(timer)
      window.removeEventListener("focus", checkExpiry)
      document.removeEventListener("visibilitychange", checkExpiry)
    }
  }, [open, ticket])

  const retireSetup = () => {
    requestSeqRef.current += 1
    setupRequestRef.current?.abort()
    setupRequestRef.current = null
    setSetupState({ kind: "loading" })
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) retireSetup()
    onOpenChange(nextOpen)
  }
  const retrySetup = () => {
    retireSetup()
    setRetryKey(current => current + 1)
  }

  const onCloseAutoFocus = (event: Event) => {
    const target = returnFocusRef.current
    if (!target || !target.isConnected || target.disabled) return
    event.preventDefault()
    window.requestAnimationFrame(() => target.focus())
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={styles.setupDialog}
        overlayClassName={styles.setupOverlay ?? ""}
        data-web-skin="kokoro"
        showCloseButton
        closeLabel={t("agents.closeSetup")}
        data-testid="agent-setup-dialog"
        data-dialog-state={setupState.kind}
        data-connection-status={activeConnectionStatus ?? undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          window.requestAnimationFrame(() => {
            const target = tabRefs.current[platform] ?? firstTabRef.current
            target?.focus()
          })
        }}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader className={styles.dialogHeader}>
          <DialogDescription className="sr-only">{t("agents.platforms")}</DialogDescription>
        </DialogHeader>
        <div className={styles.dialogScrollArea} data-testid="agent-setup-scroll">
          <Tabs value={platform} onValueChange={(value) => {
            if (value === platform || !PLATFORM_VALUES.includes(value as Platform)) return
            retireSetup()
            setPlatform(value as Platform)
          }} className={styles.platformTabs}>
            <TabsList className={styles.platformTabsList} aria-label={t("agents.platforms")}>
              {PLATFORM_VALUES.map((value) => (
                <TabsTrigger
                  key={value}
                  ref={(node) => {
                    tabRefs.current[value] = node
                    if (value === "telegram") firstTabRef.current = node
                  }}
                  value={value}
                  className={styles.platformTab}
                >
                  <PlatformMark platform={value} />
                  {t(`agents.platform.${value}`)}
                </TabsTrigger>
              ))}
            </TabsList>
            {PLATFORM_VALUES.map((value) => {
              const qrLabel = t("agents.qrCode", { platform: t(`agents.platform.${value}`) })
              const status = value === platform ? activeConnectionStatus : null
              const activeTicket = ticket?.setup.platform === value ? ticket : null
              const continueLabel = t("agents.continueIn", { platform: t(`agents.platform.${value}`) })
              const showSetup = status !== "connected" && status !== "expired"
              return (
                <TabsContent key={value} value={value} className={styles.platformPanel}>
                  {status !== null ? <div
                    className={styles.connectionStatus}
                    data-testid="agent-connection-status"
                    data-status={status}
                    data-connection-status={status}
                    role="status"
                    aria-label={t(CONNECTION_STATUS_LABEL_KEYS[status])}
                  >
                    <span className={styles.connectionStatusDot} aria-hidden="true" />
                    {t(CONNECTION_STATUS_LABEL_KEYS[status])}
                  </div> : null}
                  {showSetup ? <div
                    className={styles.qrCode}
                    data-qr-state={setupState.kind}
                    aria-busy={setupState.kind === "loading" || undefined}
                    aria-live="polite"
                  >
                    {activeTicket ? <QRCodeSVG
                      value={activeTicket.setup.qr_value}
                      size={140}
                      bgColor="var(--card)"
                      fgColor="var(--foreground)"
                      level="H"
                      marginSize={0}
                      role="img"
                      aria-label={qrLabel}
                    /> : setupState.kind === "error" ? <Alert variant="destructive" className={styles.qrError}>
                      <TriangleAlert aria-hidden="true" />
                      <AlertDescription>{t("firstSite.runtimeUnavailable")}</AlertDescription>
                    </Alert> : <div className={styles.qrLoadingState} role="status" aria-label={qrLabel}>
                      <Skeleton className={styles.qrLoading} aria-hidden="true" />
                    </div>}
                    {setupState.kind !== "error" ? <div className={styles.qrLogo} aria-hidden="true"><PlatformMark platform={value} /></div> : null}
                  </div> : null}
                  <div className={styles.dialogCopy}>
                    <DialogTitle className={styles.dialogTitle}>{status === "connected" ? t(`agents.platform.${value}`) : t("agents.setupTitle", { platform: t(`agents.platform.${value}`) })}</DialogTitle>
                    {showSetup ? <p>{setupInstruction}</p> : null}
                  </div>
                  {activeTicket ? <Button asChild className={styles.continueButton}>
                    <a href={activeTicket.setup.continue_url} target="_blank" rel="noreferrer" onClick={event => {
                      // A throttled tab may return to focus before its timer runs.
                      if (Date.now() < activeTicket.expiresAt) return
                      event.preventDefault()
                      setSetupState(current => current === activeTicket ? EXPIRED_SETUP : current)
                    }}>{continueLabel}</a>
                  </Button> : setupState.kind === "loading" ? <Button className={styles.continueButton} disabled>{continueLabel}</Button>
                    : setupState.kind === "error" || status === "expired" ? <Button
                      type="button" className={styles.continueButton} onClick={retrySetup}>{t("firstSite.retry")}</Button> : null}
                </TabsContent>
              )
            })}
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type KokoroAgentsSurfaceProps = Pick<EmptyStateProps, "brandName"> & {
  preview?: boolean
  client?: AgentClient
}

export function KokoroAgentsSurface({ brandName = "Kokoro", preview = false, client }: KokoroAgentsSurfaceProps = {}) {
  const t = useT()
  // Preview is an explicit route decision. Local development must still use
  // the authenticated Agents BFF unless the caller opts into the fixture.
  const fixtureMode = preview
  const [setupOpen, setSetupOpen] = useState(false)
  const setupReturnFocusRef = useRef<HTMLButtonElement | null>(null)
  const [wordIndex, setWordIndex] = useState(0)
  const words = [t("agents.dynamicSupport"), t("agents.dynamicSales"), t("agents.dynamicOperations")]
  const agentClient = useMemo(() => client ?? browserAgentClient({ preview: fixtureMode }), [client, fixtureMode])

  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    if (reduceMotion) return
    const timer = window.setInterval(() => setWordIndex((index) => (index + 1) % words.length), 2600)
    return () => window.clearInterval(timer)
  }, [words.length])

  return (
    <div className={styles.surface} data-web-skin="kokoro" data-testid="agents-surface">
      <header className={styles.header}>
        <span className={styles.headerTitle}>{t("rail.navAgent")}</span>
      </header>

      <div className={styles.scroller}>
        <section className={styles.content}>
          <AgentArtwork brandName={brandName} />
          <div className={styles.heroCopy}>
            <h1>{t("agents.heroPrefix")} <span key={wordIndex}>{words[wordIndex]}</span></h1>
          </div>

          <div className={styles.featureList}>
            {FEATURES.map(({ title, description, icon: Icon }) => (
              <button
                type="button"
                className={styles.featureCard}
                key={title}
                data-testid="agent-feature-card"
                aria-haspopup="dialog"
                aria-expanded={setupOpen}
                onClick={(event) => {
                  setupReturnFocusRef.current = event.currentTarget
                  setSetupOpen(true)
                }}
              >
                <div className={styles.featureIcon}><Icon aria-hidden="true" /></div>
                <div>
                  <h2>{t(title)}</h2>
                  <p>{t(description)}</p>
                </div>
              </button>
            ))}
          </div>

          <div className={styles.startAction}>
            <Button
              ref={setupReturnFocusRef}
              type="button"
              size="lg"
              className={styles.startButton}
              aria-haspopup="dialog"
              aria-expanded={setupOpen}
              onClick={(event) => {
                setupReturnFocusRef.current = event.currentTarget
                setSetupOpen(true)
              }}
            >
              <span className={styles.startPlatforms} data-testid="agent-platform-stack" aria-hidden="true">
                {PLATFORM_VALUES.map((platform) => (
                  <span
                    key={platform}
                    className={styles.startPlatform}
                    data-platform={platform}
                    data-testid={`agent-platform-${platform}`}
                  >
                    <PlatformMark platform={platform} />
                  </span>
                ))}
              </span>
              {t("agents.start")}
            </Button>
          </div>

          <section className={styles.comingSoon} aria-labelledby="agents-coming-soon">
            <h2 id="agents-coming-soon">{t("agents.comingSoon")}</h2>
            <div className={styles.comingPlatforms}>
              <span><PlatformMark platform="whatsapp" />WhatsApp</span>
              <span><PlatformMark platform="messenger" />Messenger</span>
            </div>
          </section>
        </section>
      </div>

      <SetupDialog open={setupOpen} onOpenChange={setSetupOpen} client={agentClient} returnFocusRef={setupReturnFocusRef} />
    </div>
  )
}
