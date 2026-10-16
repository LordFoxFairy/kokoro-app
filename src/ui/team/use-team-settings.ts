"use client";
import { useLayoutEffect, useRef, useState } from "react";
import {
  TeamClientError,
  type TeamClient,
  type TeamMember,
  type TeamInvitation,
  type TeamRole,
  type TeamPage,
} from "@/team/client";
import { canReadInvitations } from "@/team/permissions";
import { endProductSession } from "@/ui/auth/product-auth-client";

export type TeamSnapshot = {
  userId: string;
  members: TeamMember[];
  memberCursor: string | null;
  invitations: TeamInvitation[];
  invitationCursor: string | null;
  roles: TeamRole[];
  memberHistory: string[];
  invitationHistory: string[];
};
type View = {
  client: TeamClient;
  scope: string;
  snapshot: TeamSnapshot | null;
  loadError: boolean;
  busy: string | null;
  blocked: boolean;
  review: boolean;
  leftTeam: boolean;
  notice:
    | "unknown"
    | "savedRefreshFailed"
    | "leftSignoutFailed"
    | "incompleteRead"
    | null;
  error: unknown;
};
type Owner = {
  client: TeamClient;
  scope: string;
  retired: boolean;
  controller: AbortController;
  pending: boolean;
  view: View;
};

/** This page owns permissions, one pending intent, and explicit recovery. IAM owns all Team facts. */
export function useTeamSettings(
  client: TeamClient,
  scope: string,
  subject: string | null,
  preview: boolean,
) {
  const current = useRef<Owner | null>(null);
  const [view, setView] = useState<View>({
    client,
    scope,
    snapshot: null,
    loadError: false,
    busy: null,
    blocked: false,
    review: false,
    leftTeam: false,
    notice: null,
    error: null,
  });
  const active = (owner: Owner) =>
    current.current === owner &&
    owner.client === client &&
    owner.scope === scope &&
    !owner.retired &&
    !owner.controller.signal.aborted;
  const publish = (owner: Owner) => {
    if (active(owner)) setView({ ...owner.view });
  };
  const bounded = async <T>(
    owner: Owner,
    work: (signal: AbortSignal, check: () => void) => Promise<T>,
  ): Promise<T> => {
    const controller = new AbortController();
    const deadline = performance.now() + 10_000;
    let reject!: (error: unknown) => void;
    const cancellation = new Promise<never>((_, fail) => {
      reject = fail;
    });
    const abort = () => {
      controller.abort();
      reject(new Error("Retired Team work"));
    };
    const check = () => {
      if (
        !active(owner) ||
        controller.signal.aborted ||
        performance.now() >= deadline
      )
        throw new Error("Retired Team work");
    };
    owner.controller.signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 10_000);
    try {
      check();
      return await Promise.race([cancellation, work(controller.signal, check)]);
    } finally {
      clearTimeout(timer);
      owner.controller.signal.removeEventListener("abort", abort);
      controller.abort();
    }
  };
  const authority = async (owner: Owner): Promise<TeamSnapshot> =>
    bounded(owner, async (signal, check) => {
      const [userId, firstMembers, firstRoles] = await Promise.all([
        client.currentUserId(signal),
        client.listMembers({ limit: 25, signal }),
        client.listRoles({ limit: 25, signal }),
      ]);
      check();
      if (!preview && userId !== subject) throw new Error("Team actor changed");
      const unique = <T>(items: T[], key: (value: T) => string) => {
        if (
          items.length > 2000 ||
          new Set(items.map(key)).size !== items.length
        )
          throw new Error("Invalid Team page identity");
      };
      const members = [...firstMembers.items];
      let memberCursor = firstMembers.nextCursor;
      let memberPages = 1;
      const memberCursors = new Set<string>();
      unique(members, (member) => member.member_id);
      while (
        !members.some((member) => member.user_id === userId) &&
        memberCursor !== null
      ) {
        if (memberPages >= 20 || memberCursors.has(memberCursor))
          throw new Error("Incomplete Team actor pages");
        memberCursors.add(memberCursor);
        const page = await client.listMembers({
          limit: 100,
          cursor: memberCursor,
          signal,
        });
        check();
        memberPages += 1;
        members.push(...page.items);
        unique(members, (member) => member.member_id);
        memberCursor = page.nextCursor;
      }
      const roles = [...firstRoles.items];
      let roleCursor = firstRoles.nextCursor;
      let rolePages = 1;
      const roleCursors = new Set<string>();
      unique(roles, (role) => role.name);
      unique(
        roles.filter((role) => role.role_id !== null),
        (role) => role.role_id!,
      );
      while (roleCursor !== null) {
        if (rolePages >= 20 || roleCursors.has(roleCursor))
          throw new Error("Incomplete Team role pages");
        roleCursors.add(roleCursor);
        const page = await client.listRoles({
          limit: 100,
          cursor: roleCursor,
          signal,
        });
        check();
        rolePages += 1;
        roles.push(...page.items);
        unique(roles, (role) => role.name);
        unique(
          roles.filter((role) => role.role_id !== null),
          (role) => role.role_id!,
        );
        roleCursor = page.nextCursor;
      }
      const actors = members.filter((member) => member.user_id === userId);
      if (actors.length !== 1) throw new Error("Missing Team actor");
      const invitations = canReadInvitations(actors[0]!.roles, roles)
        ? await client.listInvitations({ limit: 25, signal })
        : { items: [], nextCursor: null };
      check();
      unique(
        invitations.items,
        (invitation: TeamInvitation) => invitation.invitation_id,
      );
      return {
        userId,
        members,
        memberCursor,
        roles,
        invitations: invitations.items,
        invitationCursor: invitations.nextCursor,
        memberHistory: [...memberCursors],
        invitationHistory: [],
      };
    });
  useLayoutEffect(() => {
    const owner: Owner = {
      client,
      scope,
      retired: false,
      controller: new AbortController(),
      pending: true,
      view: {
        client,
        scope,
        snapshot: null,
        loadError: false,
        busy: "load",
        blocked: false,
        review: false,
        leftTeam: false,
        notice: null,
        error: null,
      },
    };
    current.current = owner;
    queueMicrotask(() => {
      if (!active(owner)) return;
      publish(owner);
      void authority(owner)
        .then((snapshot) => {
          if (active(owner)) {
            owner.view.snapshot = snapshot;
            owner.view.loadError = false;
          }
        })
        .catch(() => {
          if (active(owner)) {
            owner.view.loadError = true;
            owner.view.notice = "incompleteRead";
          }
        })
        .finally(() => {
          if (active(owner)) {
            owner.pending = false;
            owner.view.busy = null;
            publish(owner);
          }
        });
    });
    return () => {
      owner.retired = true;
      owner.controller.abort();
      if (current.current === owner) current.current = null;
    };
    // Each admitted identity/client gets a fresh owner; all work closes over that owner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, scope, subject, preview]);
  const reload = async () => {
    const owner = current.current;
    if (!owner || !active(owner) || owner.pending) return;
    owner.pending = true;
    owner.view.busy = "load";
    publish(owner);
    try {
      const snapshot = await authority(owner);
      if (!active(owner)) return;
      owner.view.snapshot = snapshot;
      owner.view.loadError = false;
      owner.view.error = null;
      if (owner.view.blocked) owner.view.review = true;
      else owner.view.notice = null;
    } catch {
      if (active(owner)) {
        owner.view.loadError = owner.view.snapshot === null;
        owner.view.review = false;
        owner.view.error = new Error("Incomplete Team authority");
        owner.view.notice = "incompleteRead";
      }
    } finally {
      if (active(owner)) {
        owner.pending = false;
        owner.view.busy = null;
        publish(owner);
      }
    }
  };
  const mutate = async (
    key: string,
    action: (signal: AbortSignal) => Promise<void>,
    leave = false,
  ) => {
    const owner = current.current;
    if (
      !owner ||
      !active(owner) ||
      owner.pending ||
      owner.view.blocked ||
      !owner.view.snapshot ||
      owner.view.leftTeam
    )
      return;
    owner.pending = true;
    owner.view.busy = key;
    owner.view.error = null;
    owner.view.notice = null;
    publish(owner);
    let acknowledged = false;
    try {
      await bounded(owner, async (signal, check) => {
        await action(signal);
        check();
      });
      if (!active(owner)) return;
      acknowledged = true;
      if (leave) {
        owner.view.leftTeam = true;
        publish(owner);
        if (!preview)
          await bounded(owner, async (signal, check) => {
            await endProductSession(undefined, signal);
            check();
          });
      } else {
        owner.view.snapshot = await authority(owner);
        if (!active(owner)) return;
      }
    } catch (error) {
      if (!active(owner)) return;
      owner.view.error = error;
      if (leave && acknowledged) owner.view.notice = "leftSignoutFailed";
      else if (acknowledged) {
        owner.view.blocked = true;
        owner.view.review = false;
        owner.view.notice = "savedRefreshFailed";
      } else if (
        !(error instanceof TeamClientError) ||
        error.code === "bff_bad_response" ||
        error.status === null ||
        error.status === 401 ||
        error.status >= 500
      ) {
        owner.view.blocked = true;
        owner.view.review = false;
        owner.view.notice = "unknown";
      }
    } finally {
      if (active(owner)) {
        owner.pending = false;
        owner.view.busy = null;
        publish(owner);
      }
    }
  };
  const continueAfterReview = () => {
    const owner = current.current;
    if (
      !owner ||
      !active(owner) ||
      owner.pending ||
      !owner.view.review ||
      !owner.view.blocked
    )
      return;
    owner.view.blocked = false;
    owner.view.review = false;
    owner.view.notice = null;
    owner.view.error = null;
    publish(owner);
  };
  const more = async (part: "members" | "invitations") => {
    const owner = current.current;
    if (
      !owner ||
      !active(owner) ||
      owner.pending ||
      !owner.view.snapshot ||
      owner.view.leftTeam
    )
      return;
    const snapshot = owner.view.snapshot;
    const cursor =
      part === "members" ? snapshot.memberCursor : snapshot.invitationCursor;
    if (cursor === null) return;
    const history =
      part === "members" ? snapshot.memberHistory : snapshot.invitationHistory;
    if (history.length >= 19 || history.includes(cursor)) {
      owner.view.error = new Error("Incomplete Team pages");
      owner.view.notice = "incompleteRead";
      publish(owner);
      return;
    }
    owner.pending = true;
    owner.view.busy = `${part}-more`;
    publish(owner);
    try {
      const page = (await bounded(owner, async (signal, check) => {
        const result =
          part === "members"
            ? await client.listMembers({ limit: 25, cursor, signal })
            : await client.listInvitations({ limit: 25, cursor, signal });
        check();
        return result;
      })) as TeamPage<TeamMember | TeamInvitation>;
      if (!active(owner)) return;
      if (
        page.nextCursor === cursor ||
        (page.nextCursor !== null && history.includes(page.nextCursor))
      )
        throw new Error("Repeated Team cursor");
      if (part === "members") {
        const members = [...snapshot.members, ...(page.items as TeamMember[])];
        if (
          members.length > 2000 ||
          new Set(members.map((value) => value.member_id)).size !==
            members.length
        )
          throw new Error("Invalid Team members");
        owner.view.snapshot = {
          ...snapshot,
          members,
          memberCursor: page.nextCursor,
          memberHistory: [...history, cursor],
        };
      } else {
        const invitations = [
          ...snapshot.invitations,
          ...(page.items as TeamInvitation[]),
        ];
        if (
          invitations.length > 2000 ||
          new Set(invitations.map((value) => value.invitation_id)).size !==
            invitations.length
        )
          throw new Error("Invalid Team invitations");
        owner.view.snapshot = {
          ...snapshot,
          invitations,
          invitationCursor: page.nextCursor,
          invitationHistory: [...history, cursor],
        };
      }
    } catch (error) {
      if (active(owner)) {
        owner.view.error = error;
        owner.view.notice = "incompleteRead";
      }
    } finally {
      if (active(owner)) {
        owner.pending = false;
        owner.view.busy = null;
        publish(owner);
      }
    }
  };
  const signout = async () => {
    const owner = current.current;
    if (
      !owner ||
      !active(owner) ||
      owner.pending ||
      !owner.view.leftTeam ||
      preview
    )
      return;
    owner.pending = true;
    owner.view.busy = "signout";
    publish(owner);
    try {
      await bounded(owner, async (signal, check) => {
        await endProductSession(undefined, signal);
        check();
      });
    } catch {
      if (active(owner)) owner.view.notice = "leftSignoutFailed";
    } finally {
      if (active(owner)) {
        owner.pending = false;
        owner.view.busy = null;
        publish(owner);
      }
    }
  };
  const visible =
    view.client === client && view.scope === scope
      ? view
      : {
          ...view,
          snapshot: null,
          loadError: false,
          busy: "load",
          blocked: true,
          review: false,
          leftTeam: false,
          error: null,
          notice: null,
        };
  return { ...visible, reload, mutate, more, signout, continueAfterReview };
}
