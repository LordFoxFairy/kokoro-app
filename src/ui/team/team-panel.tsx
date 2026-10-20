"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { TeamClientError, type TeamClient } from "@/team/client";
import { teamCreateInvitationRequestSchema } from "@/team/schema";
import {
  canInvite,
  canManageInvitations,
  canRemoveMember,
  canReplaceMemberRoles,
} from "@/team/permissions";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { useTeamSettings } from "./use-team-settings";
import { useOverlayClose } from "@/ui/shell/use-overlay-close";

import styles from "./team-panel.module.css";

type TeamContentProps = {
  client: TeamClient;
  embedded?: boolean;
  preview?: boolean;
  readBoundary?: ProjectReadBoundary;
};
type TeamPanelProps = TeamContentProps & { onClose: () => void };

function errorMessage(error: unknown, t: ReturnType<typeof useT>): string {
  if (error instanceof TeamClientError) {
    if (error.code === "LAST_OWNER" || error.code === "membership.last_owner")
      return t("team.errLastOwner");
    if (error.status === 403) return t("team.errForbidden");
  }
  return t("team.errGeneric");
}

export function TeamContent({
  client,
  embedded = false,
  preview = false,
  readBoundary,
}: TeamContentProps) {
  const t = useT();
  const admitted =
    preview ||
    (readBoundary?.admitted === true &&
      typeof readBoundary.subject === "string" &&
      readBoundary.subject.length > 0);
  if (!admitted)
    return (
      <div className={cn(styles.body, embedded && styles.embeddedBody)}>
        <p className={styles.hint}>{t("team.readRequired")}</p>
      </div>
    );
  const scope = preview
    ? "preview"
    : JSON.stringify([readBoundary!.subject, readBoundary!.generation]);
  return (
    <TeamActiveContent
      key={scope}
      client={client}
      scope={scope}
      subject={preview ? null : readBoundary!.subject}
      preview={preview}
      embedded={embedded}
    />
  );
}

function TeamActiveContent({
  client,
  scope,
  subject,
  preview,
  embedded,
}: {
  client: TeamClient;
  scope: string;
  subject: string | null;
  preview: boolean;
  embedded: boolean;
}) {
  const t = useT();
  const state = useTeamSettings(client, scope, subject, preview);
  const inviteDescriptionId = useId();
  const inviteErrorId = useId();
  const leaveDescriptionId = useId();
  const { snapshot, loadError, busy, blocked: needsRefresh, leftTeam } = state;
  const notice = state.notice
    ? t(`team.${state.notice}`)
    : state.error
      ? errorMessage(state.error, t)
      : null;
  const [email, setEmail] = useState("");
  const [invalidEmail, setInvalidEmail] = useState(false);
  const [inviteRole, setInviteRole] = useState("member");
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string[]>>(
    {},
  );
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const removeCancel = useRef<HTMLButtonElement>(null);
  const leaveCancel = useRef<HTMLButtonElement>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const leaveButton = useRef<HTMLButtonElement>(null);
  const returnRemoveFocus = useRef<{ id: string; client: TeamClient } | null>(null);
  const returnLeaveFocus = useRef<TeamClient | null>(null);
  const [formClient, setFormClient] = useState(client);
  if (formClient !== client) {
    setFormClient(client);
    setEmail("");
    setInvalidEmail(false);
    setInviteRole("member");
    setSelectedRoles({});
    setConfirmRemove(null);
    setConfirmLeave(false);
  }
  useLayoutEffect(() => {
    const returning = returnRemoveFocus.current;
    returnRemoveFocus.current = null;
    if (confirmRemove !== null) removeCancel.current?.focus();
    else if (returning?.client === client)
      removeButtons.current.get(returning.id)?.focus();
  }, [confirmRemove, client]);
  useLayoutEffect(() => {
    const returning = returnLeaveFocus.current;
    returnLeaveFocus.current = null;
    if (confirmLeave) leaveCancel.current?.focus();
    else if (returning === client) leaveButton.current?.focus();
  }, [confirmLeave, client]);
  const mutate = (
    key: string,
    action: (signal: AbortSignal) => Promise<void>,
  ) => state.mutate(key, action);
  const leave = () =>
    state.mutate(
      "leave",
      (signal) => client.leave(actor!.member_id, signal),
      true,
    );

  const actor = snapshot?.members.find(
    (member) => member.user_id === snapshot.userId,
  );
  const actorRoles = actor?.roles ?? [];
  const roles = snapshot?.roles ?? [];
  const canCreateInvite = actor !== undefined && canInvite(actorRoles, roles);
  const canEditInvites =
    actor !== undefined && canManageInvitations(actorRoles, roles);
  const roleLabel = (role: string) => {
    if (role === "owner") return t("team.roleOwner");
    if (role === "admin") return t("team.roleAdmin");
    if (role === "member") return t("team.roleMember");
    return role;
  };

  return (
    <div className={cn(styles.body, embedded && styles.embeddedBody)}>
      {leftTeam ? (
        <section className={styles.section}>
          <p>{t("team.left")}</p>
          {notice && (
            <p className={styles.notice} role="alert" data-testid="team-notice">
              {notice}
            </p>
          )}
          <Button
            variant="outline"
            disabled={busy !== null || preview}
            onClick={() => void state.signout()}
          >
            {t("team.signOut")}
          </Button>
        </section>
      ) : loadError ? (
        <div role="alert" className={styles.notice}>
          {notice ?? t("team.loadError")}
          <Button
            className={styles.retry}
            variant="outline"
            disabled={busy !== null}
            onClick={() => void state.reload()}
          >
            {t("team.retry")}
          </Button>
        </div>
      ) : snapshot === null ? (
        <div className={styles.loadingState} role="status" aria-label={t("team.loading")}><Skeleton className={styles.loadingLine} /><Skeleton className={styles.loadingLine} /></div>
      ) : (
        <>
          {notice && (
            <div
              className={styles.notice}
              role="alert"
              data-testid="team-notice"
            >
              {notice}
              {needsRefresh && (
                <Button
                  variant="outline"
                  className={styles.retry}
                  disabled={busy !== null}
                  data-testid="team-reconcile"
                  onClick={() => void state.reload()}
                >
                  {t("team.retry")}
                </Button>
              )}
              {state.review && (
                <Button
                  variant="outline"
                  className={cn(styles.retry, styles.recoveryAction)}
                  disabled={busy !== null}
                  data-testid="team-continue"
                  onClick={state.continueAfterReview}
                >
                  {t("team.continueAfterRead")}
                </Button>
              )}
            </div>
          )}
          <section className={styles.section} data-testid="team-members">
            <div className={styles.sectionHeading}>
              <h3 className={styles.sectionTitle}>{t("team.membersTitle")}</h3>
              <p className={styles.description}>{t("team.membersDescription")}</p>
            </div>
            <div className={styles.list}>
              {snapshot.members.map((member) => {
                const self = member.user_id === snapshot.userId;
                const selected =
                  selectedRoles[member.member_id] ?? member.roles;
                const mayChange =
                  !self &&
                  canReplaceMemberRoles(
                    actorRoles,
                    member.roles,
                    member.roles,
                    roles,
                  );
                const validSelection =
                  selected.length > 0 &&
                  canReplaceMemberRoles(
                    actorRoles,
                    member.roles,
                    selected,
                    roles,
                  );
                const unchanged =
                  selected.length === member.roles.length &&
                  selected.every((role) => member.roles.includes(role));
                const mayRemove =
                  !self && canRemoveMember(actorRoles, member.roles, roles);
                return (
                  <div
                    className={styles.item}
                    key={member.member_id}
                    data-testid={`member-row-${member.member_id}`}
                  >
                    <div className={styles.memberIdentity}>
                      <Avatar className={styles.avatar} aria-hidden="true">
                        {member.image_url ? <AvatarImage src={member.image_url} alt="" /> : null}
                        <AvatarFallback>{Array.from(member.display_name.trim())[0]?.toLocaleUpperCase() ?? "?"}</AvatarFallback>
                      </Avatar>
                      <div className={styles.itemMain}>
                        <div className={styles.nameRow}>
                          <span className={styles.name}>{member.display_name}</span>
                          {self ? <span className={styles.selfBadge}>{t("team.you")}</span> : null}
                        </div>
                        <div className={styles.roleBadges}>
                          {member.roles.map((role) => <span key={role} className={styles.roleBadge} data-role={role}>{roleLabel(role)}</span>)}
                        </div>
                      </div>
                    </div>
                    {(mayChange || mayRemove) && (
                      <div className={styles.itemActions}>
                        {mayChange && (
                          <>
                            <div
                              className={styles.roleChoices}
                              role="group"
                              aria-label={t("team.changeRoleAria")}
                            >
                              {roles.map((role) => (
                                <label
                                  className={styles.roleChoice}
                                  key={role.name}
                                >
                                  <input
                                    type="checkbox"
                                    data-testid={`member-role-${member.member_id}-${role.name}`}
                                    checked={selected.includes(role.name)}
                                    onChange={(event) => {
                                      setSelectedRoles((current) => {
                                        const present =
                                          current[member.member_id] ??
                                          member.roles;
                                        const next = event.target.checked
                                          ? [...present, role.name]
                                          : present.filter(
                                              (name) => name !== role.name,
                                            );
                                        return {
                                          ...current,
                                          [member.member_id]: next,
                                        };
                                      });
                                    }}
                                  />
                                  {roleLabel(role.name)}
                                </label>
                              ))}
                            </div>
                            <Button
                              variant="outline"
                              className={styles.ghostBtn}
                              disabled={
                                busy !== null ||
                                needsRefresh ||
                                unchanged ||
                                !validSelection
                              }
                              data-testid={`member-role-save-${member.member_id}`}
                              onClick={() =>
                                void mutate(
                                  `role:${member.member_id}`,
                                  (signal) =>
                                    client.replaceMemberRoles(
                                      member.member_id,
                                      selected,
                                      signal,
                                    ),
                                )
                              }
                            >
                              {t("team.saveRole")}
                            </Button>
                          </>
                        )}
                        {mayRemove &&
                          (confirmRemove === member.member_id ? (
                            <span className={styles.confirmRow}>
                              <Button
                                variant="destructive"
                                className={styles.dangerBtn}
                                disabled={busy !== null || needsRefresh}
                                data-testid={`member-remove-confirm-${member.member_id}`}
                                onClick={() => {
                                  setConfirmRemove(null);
                                  void mutate(
                                    `remove:${member.member_id}`,
                                    (signal) =>
                                      client.removeMember(
                                        member.member_id,
                                        signal,
                                      ),
                                  );
                                }}
                              >
                                {t("team.confirmRemove")}
                              </Button>
                              <Button
                                ref={removeCancel}
                                variant="outline"
                                className={styles.ghostBtn}
                                onClick={() => {
                                  returnRemoveFocus.current = { id: member.member_id, client };
                                  setConfirmRemove(null);
                                }}
                              >
                                {t("team.cancel")}
                              </Button>
                            </span>
                          ) : (
                            <Button
                              ref={(node) => {
                                if (node) removeButtons.current.set(member.member_id, node);
                                else removeButtons.current.delete(member.member_id);
                              }}
                              variant="outline"
                              className={styles.dangerBtn}
                              disabled={busy !== null || needsRefresh}
                              data-testid={`member-remove-${member.member_id}`}
                              onClick={() => setConfirmRemove(member.member_id)}
                            >
                              {t("team.remove")}
                            </Button>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {snapshot.memberCursor && (
              <Button
                variant="outline"
                disabled={busy !== null || needsRefresh}
                data-testid="members-more"
                onClick={() => void state.more("members")}
              >
                {t("team.loadMore")}
              </Button>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <h3 className={styles.sectionTitle}>{t("team.invitesTitle")}</h3>
              <p id={inviteDescriptionId} className={styles.description}>{t("team.invitesDescription")}</p>
            </div>
            {canCreateInvite && (
              <>
              <form
                className={styles.inviteForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  const request = teamCreateInvitationRequestSchema.safeParse({
                    email: email.trim(),
                    roles: [inviteRole],
                  });
                  setInvalidEmail(!request.success);
                  if (!request.success) return;
                  void mutate("invite", (signal) =>
                    client.createInvitation(request.data.email, request.data.roles, signal),
                  );
                }}
              >
                <label className={styles.inviteField}>
                  <span>{t("team.inviteEmailAria")}</span>
                  <Input
                  type="email"
                  required
                  value={email}
                  placeholder={t("team.invitePlaceholder")}
                  aria-label={t("team.inviteEmailAria")}
                  aria-invalid={invalidEmail || undefined}
                  aria-describedby={invalidEmail ? `${inviteDescriptionId} ${inviteErrorId}` : inviteDescriptionId}
                  data-testid="invite-email"
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setInvalidEmail(false);
                  }}
                  />
                </label>
                <label className={styles.inviteFieldCompact}>
                  <span>{t("team.inviteRoleAria")}</span>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger className={styles.roleSelect} aria-label={t("team.inviteRoleAria")}><SelectValue /></SelectTrigger>
                    <SelectContent className={styles.roleOptions} position="popper" align="start">
                  {roles
                    .filter((role) => role.name !== "owner")
                    .map((role) => (
                      <SelectItem key={role.name} value={role.name}>{roleLabel(role.name)}</SelectItem>
                    ))}
                    </SelectContent>
                  </Select>
                </label>
                <Button
                  type="submit"
                  disabled={busy !== null || needsRefresh}
                  data-testid="invite-submit"
                  className={styles.inviteSubmit}
                >
                  {busy === "invite" ? t("team.inviting") : t("team.invite")}
                </Button>
              </form>
              {invalidEmail && <p id={inviteErrorId} className={styles.notice} role="alert">{t("settingsServices.invalidEmail")}</p>}
              </>
            )}
            <div className={styles.list}>
              {snapshot.invitations.map((invitation) => (
                <div
                  className={styles.item}
                  key={invitation.invitation_id}
                  data-testid={`invitation-row-${invitation.invitation_id}`}
                >
                  <div className={styles.itemMain}>
                    <span className={styles.name}>{invitation.email}</span>
                    <div className={styles.roleBadges}>
                      {invitation.roles.map((role) => <span key={role} className={styles.roleBadge} data-role={role}>{roleLabel(role)}</span>)}
                      <span className={styles.invitationStatus}>{invitation.status === "pending" ? t("team.statusPending") : invitation.status}</span>
                    </div>
                  </div>
                  {canEditInvites && invitation.status === "pending" && (
                    <div className={styles.itemActions}>
                      <Button
                        variant="outline"
                        disabled={busy !== null || needsRefresh}
                        data-testid={`invitation-resend-${invitation.invitation_id}`}
                        onClick={() =>
                          void mutate(
                            `resend:${invitation.invitation_id}`,
                            (signal) =>
                              client.resendInvitation(
                                invitation.invitation_id,
                                signal,
                              ),
                          )
                        }
                      >
                        {t("team.resend")}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy !== null || needsRefresh}
                        data-testid={`invitation-cancel-${invitation.invitation_id}`}
                        onClick={() =>
                          void mutate(
                            `cancel:${invitation.invitation_id}`,
                            (signal) =>
                              client.cancelInvitation(
                                invitation.invitation_id,
                                signal,
                              ),
                          )
                        }
                      >
                        {t("team.cancelInvitation")}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {snapshot.invitationCursor && (
              <Button
                variant="outline"
                disabled={busy !== null || needsRefresh}
                data-testid="invitations-more"
                onClick={() => void state.more("invitations")}
              >
                {t("team.loadMore")}
              </Button>
            )}
          </section>

          {actor && (
            <section className={styles.leaveSection}>
              <div className={styles.sectionHeading}>
                <h3 className={styles.sectionTitle}>{t("team.leave")}</h3>
                <p id={leaveDescriptionId} className={styles.description}>{t("team.leaveDescription")}</p>
              </div>
              {confirmLeave ? (
                <div className={styles.leaveConfirmation} role="group" aria-label={t("team.confirmLeaveTitle")} aria-describedby={leaveDescriptionId}>
                  <p className={styles.confirmTitle}>{t("team.confirmLeaveTitle")}</p>
                  <div className={styles.confirmRow}>
                  <Button
                    variant="destructive"
                    disabled={busy !== null || needsRefresh}
                    data-testid="team-leave-confirm"
                    onClick={() => {
                      setConfirmLeave(false);
                      void leave();
                    }}
                  >
                    {t("team.confirmLeave")}
                  </Button>
                  <Button
                    ref={leaveCancel}
                    variant="outline"
                    onClick={() => {
                      returnLeaveFocus.current = client;
                      setConfirmLeave(false);
                    }}
                  >
                    {t("team.cancel")}
                  </Button>
                  </div>
                </div>
              ) : (
                <Button
                  ref={leaveButton}
                  variant="outline"
                  className={styles.dangerBtn}
                  disabled={busy !== null || needsRefresh}
                  data-testid="team-leave"
                  aria-describedby={leaveDescriptionId}
                  onClick={() => setConfirmLeave(true)}
                >
                  {t("team.leave")}
                </Button>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

export function TeamPanel({
  client,
  onClose,
  preview = false,
  readBoundary,
}: TeamPanelProps) {
  const t = useT();
  const { open, requestClose } = useOverlayClose(onClose);
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) requestClose();
      }}
    >
      <DialogContent className={styles.panel} closeLabel={t("team.close")}>
        <div className={styles.head}>
          <div>
            <DialogTitle className={styles.title}>
              {t("team.title")}
            </DialogTitle>
            <p className={styles.subtitle}>{t("team.subtitle")}</p>
          </div>
        </div>
        <TeamContent
          client={client}
          preview={preview}
          {...(readBoundary === undefined
            ? {}
            : {
                readBoundary: {
                  ...readBoundary,
                  admitted: open && readBoundary.admitted,
                },
              })}
        />
      </DialogContent>
    </Dialog>
  );
}
