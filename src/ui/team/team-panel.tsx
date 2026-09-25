"use client"

import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/context"
import { cn } from "@/lib/utils"
import { TeamClientError, type TeamClient, type TeamInvitation, type TeamMember, type TeamRole } from "@/team/client"
import { canInvite, canManageInvitations, canReadInvitations, canRemoveMember, canReplaceMemberRoles } from "@/team/permissions"
import { endProductSession } from "@/ui/auth/product-auth-client"
import { useOverlayClose } from "@/ui/shell/use-overlay-close"

import styles from "./team-panel.module.css"

type TeamContentProps = { client: TeamClient; embedded?: boolean }
type TeamPanelProps = { client: TeamClient; onClose: () => void }

type Snapshot = {
  userId: string
  members: TeamMember[]
  memberCursor: string | null
  invitations: TeamInvitation[]
  invitationCursor: string | null
  roles: TeamRole[]
}

function errorMessage(error: unknown, t: ReturnType<typeof useT>): string {
  if (error instanceof TeamClientError) {
    if (error.code === "LAST_OWNER" || error.code === "membership.last_owner") return t("team.errLastOwner")
    if (error.status === 403) return t("team.errForbidden")
  }
  return t("team.errGeneric")
}

export function TeamContent({ client, embedded = false }: TeamContentProps) {
  const t = useT()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [leftTeam, setLeftTeam] = useState(false)
  const [email, setEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("member")
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string[]>>({})
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)

  const load = useCallback(async () => {
    const [userId, firstMembers, firstRoles] = await Promise.all([
      client.currentUserId(), client.listMembers({ limit: 25 }), client.listRoles({ limit: 25 }),
    ])
    const members = [...firstMembers.items]
    let memberCursor = firstMembers.nextCursor
    const seenMemberCursors = new Set<string>()
    while (!members.some((member) => member.user_id === userId) && memberCursor !== null) {
      if (seenMemberCursors.has(memberCursor)) throw new Error("Repeated Team member cursor")
      seenMemberCursors.add(memberCursor)
      const page = await client.listMembers({ limit: 100, cursor: memberCursor })
      members.push(...page.items)
      memberCursor = page.nextCursor
    }
    const roles = [...firstRoles.items]
    let roleCursor = firstRoles.nextCursor
    const seenRoleCursors = new Set<string>()
    while (roleCursor !== null) {
      if (seenRoleCursors.has(roleCursor)) throw new Error("Repeated Team role cursor")
      seenRoleCursors.add(roleCursor)
      const page = await client.listRoles({ limit: 100, cursor: roleCursor })
      roles.push(...page.items)
      roleCursor = page.nextCursor
    }
    const actor = members.find((member) => member.user_id === userId)
    const invitations = actor && canReadInvitations(actor.roles, roles)
      ? await client.listInvitations({ limit: 25 })
      : { items: [] as TeamInvitation[], nextCursor: null }
    return { userId, members, memberCursor, invitations: invitations.items, invitationCursor: invitations.nextCursor, roles }
  }, [client])

  useEffect(() => {
    let active = true
    void load().then((value) => { if (active) { setSnapshot(value); setLoadError(false); setNeedsRefresh(false) } })
      .catch(() => { if (active) setLoadError(true) })
    return () => { active = false }
  }, [load])

  const refresh = useCallback(async (part: "members" | "invitations") => {
    if (part === "members") {
      setSnapshot(await load())
    } else {
      const page = await client.listInvitations({ limit: 25 })
      setSnapshot((current) => current === null ? current : { ...current, invitations: page.items, invitationCursor: page.nextCursor })
    }
  }, [client, load])

  const mutate = async (key: string, action: () => Promise<void>, part: "members" | "invitations") => {
    if (busy !== null || needsRefresh) return
    setBusy(key)
    setNotice(null)
    try { await action() }
    catch (error) {
      setNotice(errorMessage(error, t))
      setBusy(null)
      return
    }
    try { await refresh(part) }
    catch {
      setNeedsRefresh(true)
      setNotice(t("team.savedRefreshFailed"))
    }
    finally { setBusy(null) }
  }

  const leave = async () => {
    if (busy !== null || needsRefresh) return
    setBusy("leave")
    setNotice(null)
    try { await client.leave() }
    catch (error) {
      setNotice(errorMessage(error, t))
      setBusy(null)
      return
    }
    setLeftTeam(true)
    try { await endProductSession() }
    catch { setNotice(t("team.leftSignoutFailed")) }
    finally { setBusy(null) }
  }

  const actor = snapshot?.members.find((member) => member.user_id === snapshot.userId)
  const actorRoles = actor?.roles ?? []
  const roles = snapshot?.roles ?? []
  const canCreateInvite = actor !== undefined && canInvite(actorRoles, roles)
  const canEditInvites = actor !== undefined && canManageInvitations(actorRoles, roles)

  return (
    <div className={cn(styles.body, embedded && styles.embeddedBody)}>
      {leftTeam ? <section className={styles.section}>
        <p>{t("team.left")}</p>
        {notice && <p className={styles.notice} role="alert" data-testid="team-notice">{notice}</p>}
        <Button variant="outline" onClick={() => void endProductSession()}>{t("team.signOut")}</Button>
      </section> : loadError ? (
        <div role="alert" className={styles.notice}>
          {t("team.loadError")}
          <Button className={styles.retry} variant="outline" onClick={() => {
            setLoadError(false)
            void load().then((value) => { setSnapshot(value); setNeedsRefresh(false); setNotice(null) }).catch(() => setLoadError(true))
          }}>{t("team.retry")}</Button>
        </div>
      ) : snapshot === null ? <p className={styles.hint}>{t("team.loading")}</p> : (
        <>
          {notice && <div className={styles.notice} role="alert" data-testid="team-notice">
            {notice}
            {needsRefresh && <Button variant="outline" className={styles.retry} onClick={() => {
              void load().then((value) => { setSnapshot(value); setNeedsRefresh(false); setNotice(null) })
                .catch(() => setNotice(t("team.savedRefreshFailed")))
            }}>{t("team.retry")}</Button>}
          </div>}
          <section className={styles.section} data-testid="team-members">
            <h3 className={styles.sectionTitle}>{t("team.membersTitle")}</h3>
            <div className={styles.list}>
              {snapshot.members.map((member) => {
                const self = member.user_id === snapshot.userId
                const selected = selectedRoles[member.member_id] ?? member.roles
                const mayChange = !self && canReplaceMemberRoles(actorRoles, member.roles, member.roles, roles)
                const validSelection = selected.length > 0 && canReplaceMemberRoles(actorRoles, member.roles, selected, roles)
                const unchanged = selected.length === member.roles.length && selected.every((role) => member.roles.includes(role))
                const mayRemove = !self && canRemoveMember(actorRoles, member.roles, roles)
                return <div className={styles.item} key={member.member_id} data-testid={`member-row-${member.member_id}`}>
                  <div className={styles.itemMain}>
                    <span className={styles.name}>{member.display_name}</span>
                    <span className={styles.subtle}>{member.roles.join(", ")}</span>
                  </div>
                  {(mayChange || mayRemove) && <div className={styles.itemActions}>
                    {mayChange && <>
                      <div className={styles.roleChoices} role="group" aria-label={t("team.changeRoleAria")}>
                        {roles.map((role) => <label className={styles.roleChoice} key={role.name}>
                          <input type="checkbox" data-testid={`member-role-${member.member_id}-${role.name}`}
                            checked={selected.includes(role.name)} onChange={(event) => {
                              setSelectedRoles((current) => {
                                const present = current[member.member_id] ?? member.roles
                                const next = event.target.checked
                                  ? [...present, role.name] : present.filter((name) => name !== role.name)
                                return { ...current, [member.member_id]: next }
                              })
                            }} />
                          {role.name}
                        </label>)}
                      </div>
                      <Button variant="outline" className={styles.ghostBtn} disabled={busy !== null || needsRefresh || unchanged || !validSelection}
                        data-testid={`member-role-save-${member.member_id}`}
                        onClick={() => void mutate(`role:${member.member_id}`, () => client.replaceMemberRoles(member.member_id, selected), "members")}>
                        {t("team.saveRole")}
                      </Button>
                    </>}
                    {mayRemove && (confirmRemove === member.member_id ? <span className={styles.confirmRow}>
                      <Button variant="destructive" className={styles.dangerBtn} disabled={busy !== null || needsRefresh}
                        data-testid={`member-remove-confirm-${member.member_id}`}
                        onClick={() => { setConfirmRemove(null); void mutate(`remove:${member.member_id}`, () => client.removeMember(member.member_id), "members") }}>
                        {t("team.confirmRemove")}
                      </Button>
                      <Button variant="outline" className={styles.ghostBtn} onClick={() => setConfirmRemove(null)}>{t("team.cancel")}</Button>
                    </span> : <Button variant="outline" className={styles.dangerBtn} disabled={busy !== null || needsRefresh}
                      data-testid={`member-remove-${member.member_id}`} onClick={() => setConfirmRemove(member.member_id)}>{t("team.remove")}</Button>)}
                  </div>}
                </div>
              })}
            </div>
            {snapshot.memberCursor && <Button variant="outline" disabled={busy !== null || needsRefresh} data-testid="members-more"
              onClick={() => {
                if (busy !== null || snapshot.memberCursor === null) return
                const cursor = snapshot.memberCursor
                setBusy("members-more")
                void client.listMembers({ limit: 25, cursor }).then((page) => {
                  setSnapshot((current) => current === null ? current : {
                    ...current, members: [...current.members, ...page.items], memberCursor: page.nextCursor,
                  })
                }).catch((error) => setNotice(errorMessage(error, t))).finally(() => setBusy(null))
              }}>{t("team.loadMore")}</Button>}
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t("team.invitesTitle")}</h3>
            {canCreateInvite && <form className={styles.inviteForm} onSubmit={(event) => {
              event.preventDefault()
              const address = email.trim()
              if (!address) return
              void mutate("invite", () => client.createInvitation(address, [inviteRole]), "invitations")
            }}>
              <Input type="email" required className={styles.inviteField} value={email} placeholder={t("team.invitePlaceholder")}
                aria-label={t("team.inviteEmailAria")} data-testid="invite-email" onChange={(event) => setEmail(event.target.value)} />
              <select className={styles.roleSelect} aria-label={t("team.inviteRoleAria")} value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                {roles.filter((role) => role.name !== "owner").map((role) => <option key={role.name} value={role.name}>{role.name}</option>)}
              </select>
              <Button type="submit" disabled={busy !== null || needsRefresh} data-testid="invite-submit">{t("team.invite")}</Button>
            </form>}
            <div className={styles.list}>
              {snapshot.invitations.map((invitation) => <div className={styles.item} key={invitation.invitation_id}
                data-testid={`invitation-row-${invitation.invitation_id}`}>
                <div className={styles.itemMain}>
                  <span className={styles.name}>{invitation.email}</span>
                  <span className={styles.subtle}>{invitation.roles.join(", ")} · {invitation.status}</span>
                </div>
                {canEditInvites && invitation.status === "pending" && <div className={styles.itemActions}>
                  <Button variant="outline" disabled={busy !== null || needsRefresh} data-testid={`invitation-resend-${invitation.invitation_id}`}
                    onClick={() => void mutate(`resend:${invitation.invitation_id}`, () => client.resendInvitation(invitation.invitation_id), "invitations")}>{t("team.resend")}</Button>
                  <Button variant="outline" disabled={busy !== null || needsRefresh} data-testid={`invitation-cancel-${invitation.invitation_id}`}
                    onClick={() => void mutate(`cancel:${invitation.invitation_id}`, () => client.cancelInvitation(invitation.invitation_id), "invitations")}>{t("team.cancelInvitation")}</Button>
                </div>}
              </div>)}
            </div>
            {snapshot.invitationCursor && <Button variant="outline" disabled={busy !== null || needsRefresh}
              data-testid="invitations-more" onClick={() => {
                if (busy !== null || snapshot.invitationCursor === null) return
                const cursor = snapshot.invitationCursor
                setBusy("invitations-more")
                void client.listInvitations({ limit: 25, cursor }).then((page) => {
                  setSnapshot((current) => current === null ? current : {
                    ...current, invitations: [...current.invitations, ...page.items], invitationCursor: page.nextCursor,
                  })
                }).catch((error) => setNotice(errorMessage(error, t))).finally(() => setBusy(null))
              }}>{t("team.loadMore")}</Button>}
          </section>

          {actor && <section className={styles.section}>
            {confirmLeave ? <div className={styles.confirmRow}>
              <Button variant="destructive" disabled={busy !== null || needsRefresh} data-testid="team-leave-confirm"
                onClick={() => { setConfirmLeave(false); void leave() }}>{t("team.confirmLeave")}</Button>
              <Button variant="outline" onClick={() => setConfirmLeave(false)}>{t("team.cancel")}</Button>
            </div> : <Button variant="outline" className={styles.dangerBtn} disabled={busy !== null || needsRefresh} data-testid="team-leave"
              onClick={() => setConfirmLeave(true)}>{t("team.leave")}</Button>}
          </section>}
        </>
      )}
    </div>
  )
}

export function TeamPanel({ client, onClose }: TeamPanelProps) {
  const t = useT()
  const { open, requestClose } = useOverlayClose(onClose)
  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) requestClose() }}>
    <DialogContent className={styles.panel}>
      <div className={styles.head}>
        <div><DialogTitle className={styles.title}>{t("team.title")}</DialogTitle><p className={styles.subtitle}>{t("team.subtitle")}</p></div>
      </div>
      <TeamContent client={client} />
    </DialogContent>
  </Dialog>
}
