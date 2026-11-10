"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"
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
import { Input } from "@/components/ui/input"
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
import { AgentClientError, type AgentClient, type AgentConnectionCommand, type AgentConnectionSetup, type AgentPlatform, type LineConnectionContinueRequest } from "@/agents/client"
import { agentConnectionCommandSchema, lineConnectionContinueRequestSchema } from "@/generated/bff-agent-connections"
import { readBrowserInvalidationHint, type ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { AUTH_INDEX_SUBJECT_KEY, browserAgentClient, readBrowserAuthIndexSubject } from "@/ui/shell/page-clients"

import styles from "./kokoro-agents-surface.module.css"

const PLATFORM_VALUES = ["telegram", "line", "slack"] as const satisfies readonly AgentPlatform[]
type Platform = AgentPlatform
type SetupNotice = "agents.telegramStateReloaded" | "agents.telegramOutcomeReloaded"
type SetupError = "agents.telegramUnavailable" | "agents.telegramReadFailed" | "agents.telegramReadBeforeWrite" |
  "agents.lineUnavailable" | "agents.lineReadFailed"
type SetupCommand = AgentConnectionCommand | LineConnectionContinueRequest
type LineHandoff = Pick<LineConnectionContinueRequest, "setup_id" | "link_token"> & { identity: string }
type ReadySetup = {
  kind: "ready"
  setup: AgentConnectionSetup
  canContinueLine?: true
  notice?: SetupNotice | "agents.telegramProofRejected" | "agents.telegramCommandRejected"
}
type SetupState = ReadySetup | { kind: "loading" } | { kind: "elapsed" } | { kind: "error"; message: SetupError }
type SetupAttempt = { controller: AbortController; busy: boolean }
type SetupLease = { scope: object; active: boolean; attempt: SetupAttempt | null; lineContinuation: { setup: AgentConnectionSetup; url: string } | null }
const MAX_TIMER_DELAY_MS = 2_147_483_647
const CONNECTION_STATUS_LABEL_KEYS = {
  connected: "settings.connected",
  disconnected: "agents.disconnected",
  expired: "agents.telegramExpired",
  awaiting_telegram: "agents.telegramAwaiting",
  awaiting_confirmation: "agents.telegramAwaitingProof",
  awaiting_line: "agents.lineAwaiting",
  awaiting_line_approval: "agents.lineAwaitingApproval",
  awaiting_line_callback: "agents.lineAwaitingCallback",
} as const

function setupExpiry(setup: AgentConnectionSetup | undefined): number | null {
  return setup && "expires_at" in setup ? Date.parse(setup.expires_at) : null
}

const FEATURES = [
  { title: "agents.identityTitle", description: "agents.identityDescription", icon: IdCard },
  { title: "agents.memoryTitle", description: "agents.memoryDescription", icon: TvMinimal },
  { title: "agents.skillsTitle", description: "agents.skillsDescription", icon: Puzzle },
  { title: "agents.chatAppsTitle", description: "agents.connectionDescription", icon: MessageCircleMore },
] as const

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
  open, onOpenChange, client, boundary, returnFocusRef,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  client: AgentClient | null
  boundary: ProjectReadBoundary | undefined
  returnFocusRef: RefObject<HTMLButtonElement | null>
}) {
  const t = useT()
  const [platform, setPlatform] = useState<Platform>("telegram")
  const [result, setResult] = useState<{ lease: SetupLease; view: SetupState } | null>(null)
  const [proof, setProof] = useState("")
  const [lineHandoff, setLineHandoff] = useState<LineHandoff | null>(null)
  const leaseRef = useRef<SetupLease | null>(null)
  const tabRefs = useRef<Partial<Record<Platform, HTMLButtonElement | null>>>({})
  const subject = boundary?.subject ?? null
  const tenant = boundary?.tenant
  const generation = boundary?.generation
  const admitted = boundary?.admitted === true
  const hint = boundary?.authInvalidationHint
  const route = typeof window === "undefined" ? "" : window.location.pathname
  const identity = JSON.stringify([subject, tenant, generation, hint])
  const allowed = open && client !== null && platform !== "slack" && admitted && Boolean(subject)
  const line = platform === "line"
  const providerUnavailable = line ? "agents.lineUnavailable" : "agents.telegramUnavailable"
  const readFailed = line ? "agents.lineReadFailed" : "agents.telegramReadFailed"
  const browserScopeCurrent = useCallback(() => {
    if (!allowed || typeof window === "undefined" || window.location.pathname !== route) return false
    try {
      return readBrowserAuthIndexSubject() === subject && (hint === undefined || readBrowserInvalidationHint() === hint)
    } catch { return false }
  }, [allowed, subject, hint, route])
  const scope = useMemo(() => ({ client, allowed, platform, identity, route }), [client, allowed, platform, identity, route])
  const current = useCallback((lease: SetupLease) =>
    leaseRef.current === lease && lease.active && browserScopeCurrent(), [browserScopeCurrent])
  const retire = useCallback(() => {
    const lease = leaseRef.current
    if (!lease) return
    leaseRef.current = null
    lease.active = false
    lease.lineContinuation = null
    lease.attempt?.controller.abort()
  }, [])

  const request = useCallback(async function perform(
    lease: SetupLease, command?: SetupCommand, previous?: AgentConnectionSetup, notice?: SetupNotice,
  ): Promise<void> {
    if (!client || !current(lease) || lease.attempt?.busy) return
    lease.attempt?.controller.abort()
    const attempt = { controller: new AbortController(), busy: true }
    lease.attempt = attempt
    lease.lineContinuation = null
    setProof("")
    if (command) setLineHandoff(null)
    setResult({ lease, view: { kind: "loading" } })
    const owns = () => current(lease) && lease.attempt === attempt && !attempt.controller.signal.aborted
    try {
      const signal = attempt.controller.signal
      let setup: AgentConnectionSetup
      let lineContinuation: string | undefined
      if (command && "link_token" in command) {
        const { continue_url, ...currentSetup } = await client.continueLineConnection(command, signal)
        setup = currentSetup
        lineContinuation = continue_url
      } else {
        setup = await (command ? client.changeConnection(platform, command, signal) : client.connectionSetup(platform, signal))
      }
      if (!owns()) return
      if (setup.platform !== platform) throw new AgentClientError(502, "agent_connection_response_invalid")
      if (line) setLineHandoff(handoff => handoff?.identity === identity &&
        setup.status === "awaiting_line_approval" && handoff.setup_id === setup.setup_id ? handoff : null)
      const expiresAt = setupExpiry(setup)
      const elapsed = expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= Date.now())
      if (!elapsed && lineContinuation !== undefined) lease.lineContinuation = { setup, url: lineContinuation }
      setResult({ lease, view: elapsed
        ? { kind: "elapsed" } : { kind: "ready", setup, ...(notice === undefined ? {} : { notice }),
          ...(lease.lineContinuation === null ? {} : { canContinueLine: true }) } })
    } catch (error) {
      if (!owns()) return
      const fault = error instanceof AgentClientError ? error : null
      const unavailable = fault?.code === "agent_connection_provider_unavailable"
      if (command && !unavailable) {
        if (!line && fault?.status === 409 && fault.code === "agent_connection_proof_invalid" && previous) {
          setResult({ lease, view: { kind: "ready", setup: previous, notice: "agents.telegramProofRejected" } })
          return
        }
        if (fault?.status === 400 && previous) {
          setResult({ lease, view: { kind: "ready", setup: previous, notice: "agents.telegramCommandRejected" } })
          return
        }
        if (fault?.status !== 401 && fault?.status !== 403 && fault?.status !== 429) {
          // A stale version or an unknown outcome permits one authoritative GET,
          // never a second POST or an automatic rebase of the old proof.
          attempt.busy = false
          const nextNotice = fault?.status === 412 || fault?.status === 409
            ? "agents.telegramStateReloaded" : "agents.telegramOutcomeReloaded"
          await perform(lease, undefined, undefined, nextNotice)
          return
        }
      }
      setResult({ lease, view: { kind: "error", message: unavailable ? providerUnavailable
        : command || notice ? "agents.telegramReadBeforeWrite" : readFailed } })
    } finally { attempt.busy = false }
  }, [client, current, identity, line, platform, providerUnavailable, readFailed])

  useLayoutEffect(() => {
    if (!scope.allowed) return
    const lease: SetupLease = { scope, active: true, attempt: null, lineContinuation: null }
    leaseRef.current = lease
    const invalidate = () => {
      if (leaseRef.current !== lease) return
      retire()
      setProof("")
      setLineHandoff(null)
      setResult(null)
      onOpenChange(false)
    }
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === window.localStorage && (event.key === null ||
        event.key === AUTH_INDEX_SUBJECT_KEY && event.oldValue !== event.newValue || !browserScopeCurrent())) invalidate()
    }
    const onRoute = () => { if (!browserScopeCurrent()) invalidate() }
    window.addEventListener("storage", onStorage)
    window.addEventListener("pagehide", invalidate)
    window.addEventListener("kokoro:auth-invalidated", invalidate)
    window.addEventListener("popstate", onRoute)
    window.addEventListener("kokoro:surface-navigation", onRoute)
    queueMicrotask(() => { void request(lease) })
    return () => {
      if (leaseRef.current === lease) retire()
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("pagehide", invalidate)
      window.removeEventListener("kokoro:auth-invalidated", invalidate)
      window.removeEventListener("popstate", onRoute)
      window.removeEventListener("kokoro:surface-navigation", onRoute)
    }
  }, [scope, browserScopeCurrent, onOpenChange, request, retire])

  useLayoutEffect(() => {
    let live = true
    const receive = () => {
      if (!live || window.location.pathname !== "/app/agents") return
      const fragment = window.location.hash.slice(1)
      const params = new URLSearchParams(fragment)
      if (!params.has("line_setup") && !params.has("link_token")) return
      // Remove the secret before parsing or opening the dialog. It never enters a login return target.
      try { window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`) }
      catch { return }
      setLineHandoff(null)
      if (!client || !admitted || !subject) return
      try {
        if (readBrowserAuthIndexSubject() !== subject || (hint !== undefined && readBrowserInvalidationHint() !== hint)) return
      } catch { return }
      const setupId = params.get("line_setup")
      const token = params.get("link_token")
      const parsed = lineConnectionContinueRequestSchema.pick({ setup_id: true, link_token: true }).safeParse({ setup_id: setupId, link_token: token })
      if (!parsed.success || fragment !== new URLSearchParams({ line_setup: parsed.data.setup_id, link_token: parsed.data.link_token }).toString()) return
      if (!line) retire()
      setLineHandoff({ setup_id: parsed.data.setup_id, link_token: parsed.data.link_token, identity })
      setPlatform("line")
      onOpenChange(true)
      if (open && line && leaseRef.current) void request(leaseRef.current)
    }
    queueMicrotask(receive)
    window.addEventListener("hashchange", receive)
    return () => { live = false; window.removeEventListener("hashchange", receive) }
  }, [admitted, client, hint, identity, line, onOpenChange, open, request, retire, subject])

  const view = result?.lease.scope === scope && allowed ? result.view : undefined
  const setup = view?.kind === "ready" ? view.setup : undefined
  const expiresAt = setupExpiry(setup)
  const expire = useCallback((target: AgentConnectionSetup) => {
    const lease = leaseRef.current
    if (lease?.lineContinuation?.setup === target) lease.lineContinuation = null
    setResult(old => old?.view.kind === "ready" && old.view.setup === target ? { lease: old.lease, view: { kind: "elapsed" } } : old)
    setProof("")
    if ("setup_id" in target) setLineHandoff(handoff => handoff?.setup_id === target.setup_id ? null : handoff)
  }, [])
  useEffect(() => {
    if (!open || setup === undefined || expiresAt === null) return
    let timer: number | undefined
    let disposed = false
    const check = () => {
      if (disposed) return
      window.clearTimeout(timer)
      const remaining = expiresAt - Date.now()
      if (remaining <= 0) expire(setup)
      else timer = window.setTimeout(check, Math.min(remaining, MAX_TIMER_DELAY_MS))
    }
    queueMicrotask(check)
    window.addEventListener("focus", check)
    document.addEventListener("visibilitychange", check)
    return () => {
      disposed = true
      window.clearTimeout(timer)
      window.removeEventListener("focus", check)
      document.removeEventListener("visibilitychange", check)
    }
  }, [open, setup, expiresAt, expire])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) { retire(); setProof(""); setLineHandoff(null); setResult(null) }
    onOpenChange(nextOpen)
  }
  const refresh = () => { if (leaseRef.current) void request(leaseRef.current) }
  const write = (action: AgentConnectionCommand["action"]) => {
    const lease = leaseRef.current
    if (!setup || !lease || !current(lease)) return
    if (expiresAt !== null && expiresAt <= Date.now()) { expire(setup); return }
    const parsed = agentConnectionCommandSchema.safeParse({
      action, expected_state_version: setup.state_version,
      ...((action === "confirm" || action === "cancel") && "setup_id" in setup ? { setup_id: setup.setup_id } : {}),
      ...(action === "confirm" ? { proof } : {}),
    })
    if (parsed.success) void request(lease, parsed.data, setup)
  }
  const approveLine = () => {
    const lease = leaseRef.current
    if (!lease || !current(lease) || !line || setup?.status !== "awaiting_line_approval" ||
      lineHandoff?.identity !== identity || lineHandoff.setup_id !== setup.setup_id) return
    if (expiresAt === null || expiresAt <= Date.now()) { expire(setup); return }
    const parsed = lineConnectionContinueRequestSchema.safeParse({
      setup_id: setup.setup_id, expected_state_version: setup.state_version, link_token: lineHandoff.link_token,
    })
    if (parsed.success) void request(lease, parsed.data)
  }
  const openLine = () => {
    const lease = leaseRef.current
    if (!lease || !current(lease) || setup?.status !== "awaiting_line_callback" || lease.lineContinuation?.setup !== setup) return
    if (expiresAt === null || expiresAt <= Date.now()) { expire(setup); return }
    const { url } = lease.lineContinuation
    lease.lineContinuation = null
    setResult({ lease, view: { kind: "ready", setup } })
    window.open(url, "_blank", "noopener,noreferrer")
  }
  const status = setup?.status ?? (view?.kind === "elapsed" ? "expired" : null)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={styles.setupDialog}
        overlayClassName={styles.setupOverlay ?? ""}
        data-web-skin="kokoro"
        closeLabel={t("agents.closeSetup")}
        data-testid="agent-setup-dialog"
        data-dialog-state={view?.kind ?? (allowed ? "loading" : "unavailable")}
        data-connection-status={status ?? undefined}
        onOpenAutoFocus={event => {
          event.preventDefault()
          window.requestAnimationFrame(() => tabRefs.current[platform]?.focus())
        }}
        onCloseAutoFocus={event => {
          const target = returnFocusRef.current
          if (!target || !target.isConnected || target.disabled) return
          event.preventDefault()
          window.requestAnimationFrame(() => target.focus())
        }}
      >
        <DialogHeader className={styles.dialogHeader}><DialogDescription className="sr-only">{t("agents.platforms")}</DialogDescription></DialogHeader>
        <div className={styles.dialogScrollArea} data-testid="agent-setup-scroll">
          <Tabs value={platform} onValueChange={value => {
            if (value === platform || !PLATFORM_VALUES.includes(value as Platform)) return
            retire(); setProof(""); setLineHandoff(null); setResult(null); setPlatform(value as Platform)
          }} className={styles.platformTabs}>
            <TabsList className={styles.platformTabsList} aria-label={t("agents.platforms")}>
              {PLATFORM_VALUES.map(value => <TabsTrigger key={value} value={value} className={styles.platformTab}
                ref={node => { tabRefs.current[value] = node }}>
                <PlatformMark platform={value} />{t(`agents.platform.${value}`)}
              </TabsTrigger>)}
            </TabsList>
            {PLATFORM_VALUES.map(value => {
              const active = value === platform && allowed
              const label = t(`agents.platform.${value}`)
              const activeSetup = active ? setup : undefined
              const qrLabel = t("agents.qrCode", { platform: label })
              return (
                <TabsContent key={value} value={value} className={styles.platformPanel}>
                  <div className={styles.dialogCopy}>
                    <DialogTitle className={styles.dialogTitle}>{value !== "slack" ? t("agents.setupTitle", { platform: label }) : label}</DialogTitle>
                  </div>
                  {!active ? <p role="status" className={styles.setupNotice}>{t("agents.connectionUnavailable", { platform: label })}</p> : <>
                    {status ? <div className={styles.connectionStatus} data-testid="agent-connection-status" data-status={status} role="status"
                      aria-label={t(CONNECTION_STATUS_LABEL_KEYS[status])}>
                      <span className={styles.connectionStatusDot} aria-hidden="true" />{t(CONNECTION_STATUS_LABEL_KEYS[status])}
                    </div> : null}
                    {view === undefined || view.kind === "loading" ? <div className={styles.qrCode} aria-busy="true">
                      <div className={styles.qrLoadingState} role="status" aria-label={t(line ? "agents.lineLoading" : "agents.telegramLoading")}><Skeleton className={styles.qrLoading} aria-hidden="true" /></div>
                    </div> : null}
                    {(activeSetup?.status === "awaiting_telegram" || activeSetup?.status === "awaiting_line") ? <>
                      <div className={styles.qrCode}><QRCodeSVG value={activeSetup.continue_url} size={140} bgColor="var(--card)"
                        fgColor="var(--foreground)" level="H" marginSize={0} role="img" aria-label={qrLabel} /></div>
                      <p className={styles.setupNotice}>{t(line ? "agents.lineScan" : "agents.telegramScan")}</p>
                    </> : null}
                    {view?.kind === "error" ? <Alert variant="destructive" className={styles.setupNotice}>
                      <TriangleAlert aria-hidden="true" /><AlertDescription>{t(view.message)}</AlertDescription>
                    </Alert> : null}
                    {view?.kind === "ready" && view.notice ? <p role="status" className={styles.setupNotice}>{t(view.notice)}</p> : null}
                    <div className={styles.setupCommands}>
                      {activeSetup?.status === "disconnected" || activeSetup?.status === "expired"
                        ? <Button type="button" onClick={() => write("start")}>{t(line ? "agents.lineStart" : "agents.telegramStart")}</Button> : null}
                      {(activeSetup?.status === "awaiting_telegram" || activeSetup?.status === "awaiting_line") ? <>
                        <Button asChild><a href={activeSetup.continue_url} target="_blank" rel="noreferrer" onClick={event => {
                          if (expiresAt === null || Date.now() < expiresAt) return
                          event.preventDefault()
                          expire(activeSetup)
                        }}>{t("agents.continueIn", { platform: label })}</a></Button>
                        <Button type="button" variant="outline" onClick={refresh}>{t(line ? "agents.lineCheck" : "agents.telegramCheck")}</Button>
                      </> : null}
                      {activeSetup?.status === "awaiting_confirmation" ? <form className={styles.setupCommands} autoComplete="off" onSubmit={event => {
                        event.preventDefault()
                        write("confirm")
                      }}>
                        <label className={styles.proofLabel}>{t("agents.telegramProof")}
                          <Input type="password" autoComplete="off" spellCheck={false} value={proof} onChange={event => setProof(event.target.value)} />
                        </label>
                        <Button type="submit" disabled={!/^[A-Za-z0-9_-]{22}$/u.test(proof)}>{t("agents.telegramConfirm")}</Button>
                      </form> : null}
                      {activeSetup?.status === "awaiting_line_approval" ? <>
                        {lineHandoff?.identity === identity && lineHandoff.setup_id === activeSetup.setup_id
                          ? <Button type="button" onClick={approveLine}>{t("agents.lineApprove")}</Button> : null}
                        <Button type="button" variant="outline" onClick={refresh}>{t("agents.lineCheck")}</Button>
                      </> : null}
                      {activeSetup?.status === "awaiting_line_callback" ? <>
                        {view?.kind === "ready" && view.canContinueLine
                          ? <Button type="button" onClick={openLine}>{t("agents.continueIn", { platform: label })}</Button> : null}
                        <Button type="button" variant="outline" onClick={refresh}>{t("agents.lineCheck")}</Button>
                      </> : null}
                      {activeSetup && "setup_id" in activeSetup
                        ? <Button type="button" variant="outline" onClick={() => write("cancel")}>{t("agents.telegramCancel")}</Button> : null}
                      {activeSetup?.status === "connected"
                        ? <Button type="button" variant="outline" onClick={() => write("disconnect")}>{t(line ? "agents.lineDisconnect" : "agents.telegramDisconnect")}</Button> : null}
                      {view?.kind === "elapsed" || view?.kind === "error"
                        ? <Button type="button" variant="outline" onClick={refresh}>{t(line ? "agents.lineCheck" : "agents.telegramCheck")}</Button> : null}
                    </div>
                  </>}
                </TabsContent>
              )
            })}
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type KokoroAgentsSurfaceProps = Pick<EmptyStateProps, "brandName" | "projectReadBoundary"> & {
  preview?: boolean
  client?: AgentClient
}

export function KokoroAgentsSurface({ brandName = "Kokoro", preview = false, client, projectReadBoundary }: KokoroAgentsSurfaceProps = {}) {
  const t = useT()
  const [setupOpen, setSetupOpen] = useState(false)
  const setupReturnFocusRef = useRef<HTMLButtonElement | null>(null)
  const [wordIndex, setWordIndex] = useState(0)
  const words = [t("agents.dynamicSupport"), t("agents.dynamicSales"), t("agents.dynamicOperations")]
  const agentClient = preview ? null : client ?? browserAgentClient()

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

      <SetupDialog open={setupOpen} onOpenChange={setSetupOpen} client={agentClient} boundary={projectReadBoundary} returnFocusRef={setupReturnFocusRef} />
    </div>
  )
}
