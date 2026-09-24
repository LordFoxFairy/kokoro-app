"use client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

// 团队面板（TEAM-1）：固定部署租户内的待处理邀请（accept/decline）与当前团队成员管理
// （owner/admin 邀请/改角色/移除；member 只读）。user principal 全留服务端，前端只见同源 `/api/team/*`。

import { useCallback, useEffect, useRef, useState } from "react"

import { useT } from "@/i18n/context"
import { cn } from "@/lib/utils"
import { invalidate, useResource } from "@/lib/query"
import { canAssignRoles, canManageMembers } from "@/team/permissions"
import {
  TeamClientError,
  type Member,
  type PendingInvite,
  type TeamClient,
  type TeamDetail,
  type TeamRole,
} from "@/team/client"

import styles from "./team-panel.module.css"
import { useOverlayClose } from "@/ui/shell/use-overlay-close"

// 团队查询键：邀请与成员变更后按业务读模型失活重取。
const INVITES_KEY = "team/invites"
const DETAIL_PREFIX = "team/detail"

type DetailState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; detail: TeamDetail }

type TeamPanelProps = {
  client: TeamClient
  currentNamespace: string | null
  onClose: () => void
}

type TeamErrorKey =
  | "team.errLastOwner"
  | "team.errInviteExpired"
  | "team.errInviteStale"
  | "team.errForbidden"
  | "team.errGeneric"

// user 稳定错误码 → 本地化文案 key；未知码回退通用失败。
function errorKey(error: unknown): TeamErrorKey {
  const code = error instanceof TeamClientError ? error.code : null
  switch (code) {
    case "membership.last_owner":
      return "team.errLastOwner"
    case "invite.expired":
      return "team.errInviteExpired"
    case "invite.not_pending":
      return "team.errInviteStale"
    case "invite.forbidden":
    case "team.forbidden":
      return "team.errForbidden"
    default:
      return "team.errGeneric"
  }
}

type TeamContentProps = {
  client: TeamClient
  currentNamespace: string | null
  embedded?: boolean
}

export function TeamContent({ client, currentNamespace, embedded = false }: TeamContentProps) {
  const t = useT()
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // 待处理邀请 / 当前团队详情经查询层（模块缓存/去重/失活）。
  // ResourceResult 适配回既有判别式，子组件展示分支不变。
  const invitesRes = useResource<PendingInvite[]>(
    INVITES_KEY,
    useCallback(() => client.listInvites(), [client]),
  )
  // detail 按 namespace 分键；无信封/预览（null）时取数即抛，落 error 态（对齐旧「无 ns → error」）。
  const detailRes = useResource<TeamDetail>(
    `${DETAIL_PREFIX}/${currentNamespace ?? "__none__"}`,
    useCallback(() => {
      if (currentNamespace === null) {
        return Promise.reject(new Error("no-namespace"))
      }
      return client.teamDetail(currentNamespace)
    }, [client, currentNamespace]),
  )

  // 邀请尽力而为：失败回空池（与旧 catch→[] 一致）。
  const invites = invitesRes.data ?? []
  const detail: DetailState =
    detailRes.data !== undefined
      ? { kind: "ready", detail: detailRes.data }
      : detailRes.error !== undefined
        ? { kind: "error" }
        : { kind: "loading" }

  const afterMemberMutation = useCallback(async () => {
    invalidate(DETAIL_PREFIX)
  }, [])

  const onAccept = useCallback(
    async (inviteId: string) => {
      setBusy(`accept:${inviteId}`)
      setNotice(null)
      try {
        await client.acceptInvite(inviteId)
        // 入队成功：邀请与当前详情失活重取。
        invalidate(INVITES_KEY)
        invalidate(DETAIL_PREFIX)
      } catch (error) {
        setNotice(t(errorKey(error)))
      } finally {
        setBusy(null)
      }
    },
    [client, t],
  )

  const onDecline = useCallback(
    async (inviteId: string) => {
      setBusy(`decline:${inviteId}`)
      setNotice(null)
      try {
        await client.declineInvite(inviteId)
        invalidate(INVITES_KEY)
      } catch (error) {
        setNotice(t(errorKey(error)))
      } finally {
        setBusy(null)
      }
    },
    [client, t],
  )

  return (
    <div className={cn(styles.body, embedded && styles.embeddedBody)} data-embedded={embedded || undefined}>
          {notice ? (
            <Alert variant="destructive" className={styles.notice} data-testid="team-notice">
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          ) : null}

          {invites.length > 0 ? (
            <section className={styles.section} data-testid="team-invites">
              <h3 className={styles.sectionTitle}>{t("team.invitesTitle")}</h3>
              <ul className={styles.list}>
                {invites.map((invite) => (
                  <InviteRow
                    key={invite.id}
                    invite={invite}
                    busy={busy}
                    onAccept={onAccept}
                    onDecline={onDecline}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          <MembersSection
            client={client}
            detail={detail}
            busy={busy}
            setBusy={setBusy}
            onError={(error) => setNotice(t(errorKey(error)))}
            onMutated={afterMemberMutation}
            loading={detailRes.loading}
            onRetry={detailRes.refetch}
          />
    </div>
  )
}

export function TeamPanel({ client, currentNamespace, onClose }: TeamPanelProps) {
  const t = useT()
  const { open, requestClose, onCloseAutoFocus } = useOverlayClose(onClose)

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) requestClose() }}>
      <DialogContent
        className={cn(styles.panel, "p-0 box-border")}
        data-testid="team-panel"
        closeLabel={t("team.close")}
        closeButtonTestId="team-close"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogTitle className="sr-only">{t("team.title")}</DialogTitle>
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>{t("team.title")}</h2>
            <p className={styles.subtitle}>{t("team.subtitle")}</p>
          </div>
        </header>

        <TeamContent client={client} currentNamespace={currentNamespace} />
      </DialogContent>
    </Dialog>
  )
}

function InviteRow({
  invite,
  busy,
  onAccept,
  onDecline,
}: {
  invite: PendingInvite
  busy: string | null
  onAccept: (id: string) => Promise<void>
  onDecline: (id: string) => Promise<void>
}) {
  const t = useT()
  const working = busy === `accept:${invite.id}` || busy === `decline:${invite.id}`
  const focusInviteSurface = (list: Element | null) => {
    window.requestAnimationFrame(() => {
      const target = list?.querySelector<HTMLButtonElement>(
        '[data-testid="invite-accept"], [data-testid="invite-decline"], [data-testid="team-close"]',
      )
      target?.focus()
    })
  }
  const actionLabel = (action: string) => `${action} · ${invite.teamName}`
  return (
    <li className={styles.item} data-testid="invite-row">
      <div className={styles.itemMain}>
        <span className={styles.name}>{invite.teamName}</span>
        <span className={styles.roleBadge} data-role={invite.role}>
          {t(roleKey(invite.role))}
        </span>
      </div>
      <div className={styles.itemActions}>
        <Button variant="default"
          type="button"
          className={styles.primaryBtn}
          data-testid="invite-accept"
          aria-label={actionLabel(t("team.accept"))}
          disabled={working || busy !== null}
          aria-busy={working && busy === `accept:${invite.id}`}
          onClick={(event) => {
            const list = event.currentTarget.closest("ul")
            void onAccept(invite.id).then(() => focusInviteSurface(list))
          }}
        >
          {working && busy === `accept:${invite.id}` ? <><Spinner aria-hidden="true" />{t("team.accepting")}</> : t("team.accept")}
        </Button>
        <Button variant="outline"
          type="button"
          className={styles.ghostBtn}
          data-testid="invite-decline"
          aria-label={actionLabel(t("team.decline"))}
          disabled={working || busy !== null}
          aria-busy={working && busy === `decline:${invite.id}`}
          onClick={(event) => {
            const list = event.currentTarget.closest("ul")
            void onDecline(invite.id).then(() => focusInviteSurface(list))
          }}
        >
          {working && busy === `decline:${invite.id}` ? <><Spinner aria-hidden="true" />{t("team.declining")}</> : t("team.decline")}
        </Button>
      </div>
    </li>
  )
}

function MembersSection({
  client,
  detail,
  busy,
  setBusy,
  onError,
  onMutated,
  loading,
  onRetry,
}: {
  client: TeamClient
  detail: DetailState
  busy: string | null
  setBusy: (value: string | null) => void
  onError: (error: unknown) => void
  onMutated: () => Promise<void>
  loading: boolean
  onRetry: () => void
}) {
  const t = useT()
  if (detail.kind === "loading") {
    return (
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t("team.membersTitle")}</h3>
        <div className={styles.loadingState} role="status" aria-label={t("team.loading")}>
          <Skeleton className={styles.loadingLine} />
          <Skeleton className={styles.loadingLine} />
        </div>
      </section>
    )
  }
  if (detail.kind === "error") {
    return (
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t("team.membersTitle")}</h3>
        <Alert variant="destructive" className={styles.feedback}>
          <AlertDescription>
            <p>{t("team.membersError")}</p>
          <Button variant="outline" type="button" className={styles.retry} disabled={loading} aria-busy={loading} onClick={onRetry}>
            {loading ? <Spinner aria-hidden="true" /> : null}
            {loading ? t("team.loading") : t("team.retry")}
          </Button>
          </AlertDescription>
        </Alert>
      </section>
    )
  }

  const { team, viewerRole, members, invites } = detail.detail
  const canManage = canManageMembers(viewerRole)
  const isOwner = canAssignRoles(viewerRole)

  return (
    <section className={styles.section} data-testid="team-members">
      <div className={styles.sectionRow}>
        <h3 className={styles.sectionTitle}>{teamLabel(team.type, viewerRole, team.name, t)}</h3>
        <span className={styles.roleBadge} data-role={viewerRole}>
          {t(roleKey(viewerRole))}
        </span>
      </div>

      {canManage ? (
        <InviteForm
          client={client}
          teamId={team.id}
          busy={busy}
          setBusy={setBusy}
          onError={onError}
          onInvited={onMutated}
        />
      ) : (
        <p className={styles.hint}>{t("team.memberReadonly")}</p>
      )}

      <ul className={styles.list}>
        {members.map((member) => (
          <MemberRow
            key={member.userId}
            client={client}
            teamId={team.id}
            member={member}
            isOwner={isOwner}
            canManage={canManage}
            busy={busy}
            setBusy={setBusy}
            onError={onError}
            onMutated={onMutated}
          />
        ))}
      </ul>

      {canManage && invites.length > 0 ? (
        <div className={styles.pending} data-testid="team-pending-invites">
          <p className={styles.pendingLabel}>{t("team.pendingLabel")}</p>
          <ul className={styles.list}>
            {invites.map((invite) => (
              <li key={invite.id} className={styles.pendingRow}>
                <span className={styles.name}>{invite.email}</span>
                <span className={styles.roleBadge} data-role={invite.role}>
                  {t(roleKey(invite.role))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function InviteForm({
  client,
  teamId,
  busy,
  setBusy,
  onError,
  onInvited,
}: {
  client: TeamClient
  teamId: string
  busy: string | null
  setBusy: (value: string | null) => void
  onError: (error: unknown) => void
  onInvited: () => Promise<void>
}) {
  const t = useT()
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"admin" | "member">("member")
  const [attempted, setAttempted] = useState(false)
  const emailRef = useRef<HTMLInputElement | null>(null)
  const submitting = busy === "invite"
  const emailInvalid = attempted && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const submit = useCallback(async () => {
    const trimmed = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return
    }
    setBusy("invite")
    try {
      await client.createInvite(teamId, trimmed, role)
      setEmail("")
      await onInvited()
    } catch (error) {
      onError(error)
    } finally {
      setBusy(null)
    }
  }, [client, teamId, email, role, onInvited, onError, setBusy])

  return (
    <form
      className={styles.inviteForm}
      onSubmit={(e) => {
        e.preventDefault()
        setAttempted(true)
        if (email.trim().length === 0 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
          window.requestAnimationFrame(() => emailRef.current?.focus())
          return
        }
        void submit()
      }}
    >
      <Field className={styles.inviteField} data-invalid={emailInvalid || undefined}>
        <FieldLabel className="sr-only" htmlFor="team-invite-email">{t("team.inviteEmailAria")}</FieldLabel>
        <Input
          ref={emailRef}
          id="team-invite-email"
          type="email"
          className={styles.inviteInput}
          placeholder={t("team.invitePlaceholder")}
          aria-label={t("team.inviteEmailAria")}
          aria-invalid={emailInvalid || undefined}
          data-testid="invite-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {emailInvalid ? <FieldError>{t("auth.invalidEmail")}</FieldError> : null}
      </Field>
      <Field className={styles.inviteFieldCompact}>
        <FieldLabel className="sr-only" htmlFor="team-invite-role">{t("team.inviteRoleAria")}</FieldLabel>
        <Select value={role} onValueChange={(value) => setRole(value === "admin" ? "admin" : "member")}>
          <SelectTrigger id="team-invite-role" className={styles.roleSelect} aria-label={t("team.inviteRoleAria")} data-testid="invite-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="member">{t("team.roleMember")}</SelectItem>
              <SelectItem value="admin">{t("team.roleAdmin")}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Button variant="default"
        type="submit"
        className={styles.primaryBtn}
        data-testid="invite-submit"
        disabled={submitting || busy !== null}
        aria-busy={submitting}
      >
        {submitting ? <><Spinner aria-hidden="true" />{t("team.inviting")}</> : t("team.invite")}
      </Button>
    </form>
  )
}

function MemberRow({
  client,
  teamId,
  member,
  isOwner,
  canManage,
  busy,
  setBusy,
  onError,
  onMutated,
}: {
  client: TeamClient
  teamId: string
  member: Member
  isOwner: boolean
  canManage: boolean
  busy: string | null
  setBusy: (value: string | null) => void
  onError: (error: unknown) => void
  onMutated: () => Promise<void>
}) {
  const t = useT()
  const rowBusy = busy === `member:${member.userId}`
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const removeTriggerRef = useRef<HTMLButtonElement | null>(null)
  const confirmRemoveRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!confirmingRemove) return
    const frame = window.requestAnimationFrame(() => confirmRemoveRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [confirmingRemove])

  const changeRole = useCallback(
    async (role: TeamRole) => {
      if (role === member.role) {
        return
      }
      setBusy(`member:${member.userId}`)
      try {
        await client.changeRole(teamId, member.userId, role)
        await onMutated()
      } catch (error) {
        onError(error)
      } finally {
        setBusy(null)
      }
    },
    [client, teamId, member.userId, member.role, onMutated, onError, setBusy],
  )

  const remove = useCallback(async () => {
    setBusy(`member:${member.userId}`)
    try {
      await client.removeMember(teamId, member.userId)
      await onMutated()
    } catch (error) {
      onError(error)
    } finally {
      setBusy(null)
    }
  }, [client, teamId, member.userId, onMutated, onError, setBusy])
  const memberName = member.displayName || member.email || member.userId

  return (
    <li className={styles.item} data-testid="member-row">
      <div className={styles.itemMain}>
        <span className={styles.name}>{member.displayName || member.email || member.userId}</span>
        {member.email ? <span className={styles.subtle}>{member.email}</span> : null}
      </div>
      <div className={styles.itemActions}>
        {/* 改角色仅 owner；member 视图无控件（只读）。 */}
        {isOwner ? (
          <Select value={member.role} onValueChange={(value) => void changeRole(value as TeamRole)}>
            <SelectTrigger
              className={styles.roleSelect}
              aria-label={`${t("team.changeRoleAria")} · ${memberName}`}
              data-testid={`member-role-${member.userId}`}
              disabled={rowBusy || busy !== null}
              aria-busy={rowBusy}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="owner">{t("team.roleOwner")}</SelectItem>
                <SelectItem value="admin">{t("team.roleAdmin")}</SelectItem>
                <SelectItem value="member">{t("team.roleMember")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : (
          <span className={styles.roleBadge} data-role={member.role}>
            {t(roleKey(member.role))}
          </span>
        )}
        {canManage ? (
          confirmingRemove ? (
            <span className={styles.confirmRow}>
              <Button
                variant="destructive"
                type="button"
                className={styles.dangerBtn}
                ref={confirmRemoveRef}
                data-testid={`member-remove-confirm-${member.userId}`}
                aria-label={`${t("team.confirmRemove")} · ${memberName}`}
                disabled={rowBusy || busy !== null}
                aria-busy={rowBusy}
                onClick={(event) => {
                  const membersSection = event.currentTarget.closest<HTMLElement>('[data-testid="team-members"]')
                  setConfirmingRemove(false)
                  void remove().then(() => {
                    window.requestAnimationFrame(() => {
                      membersSection?.querySelector<HTMLButtonElement>('[data-testid="invite-submit"]')?.focus()
                    })
                  })
                }}
              >
                {rowBusy ? <><Spinner aria-hidden="true" />{t("team.removing")}</> : t("team.confirmRemove")}
              </Button>
              <Button
                variant="outline"
                type="button"
                className={styles.ghostBtn}
                aria-label={`${t("team.cancel")} · ${memberName}`}
                disabled={rowBusy || busy !== null}
                onClick={() => {
                  setConfirmingRemove(false)
                  window.requestAnimationFrame(() => removeTriggerRef.current?.focus())
                }}
              >
                {t("team.cancel")}
              </Button>
            </span>
          ) : (
            <Button
              variant="destructive"
              type="button"
              className={styles.dangerBtn}
              ref={removeTriggerRef}
              data-testid={`member-remove-${member.userId}`}
              aria-label={`${t("team.remove")} · ${memberName}`}
              disabled={rowBusy || busy !== null}
              onClick={() => setConfirmingRemove(true)}
            >
              {t("team.remove")}
            </Button>
          )
        ) : null}
      </div>
    </li>
  )
}

// 团队名：自己拥有的个人空间显示「个人空间」；他人的个人团队/普通团队一律显示真实名。
function teamLabel(
  type: "personal" | "team",
  role: TeamRole,
  name: string,
  t: (key: "team.personalName") => string,
): string {
  return type === "personal" && role === "owner" ? t("team.personalName") : name
}

function roleKey(role: TeamRole): "team.roleOwner" | "team.roleAdmin" | "team.roleMember" {
  if (role === "owner") return "team.roleOwner"
  if (role === "admin") return "team.roleAdmin"
  return "team.roleMember"
}
