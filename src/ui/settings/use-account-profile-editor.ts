"use client";
import { useLayoutEffect, useRef, useState } from "react";
import type { AccountProfile } from "@/lib/account-profile.schema";
import { accountProfileUpdateSchema } from "@/lib/account-profile-update.schema";
import { writeAccountProfile } from "./account-profile-update-client";

type Phase =
  | "ready"
  | "editing"
  | "invalid"
  | "submitting"
  | "saved"
  | "conflict"
  | "reconciliationRequired"
  | "readFailed"
  | "review"
  | "rejected";
type State = {
  scope: string;
  draft: string;
  original: string;
  phase: Phase;
  controller: AbortController;
  retired: boolean;
  initialized: boolean;
  reviewName: string | null;
};
/** Name intent stays in this admitted identity's memory; userinfo is the only displayed authority. */
export function useAccountProfileEditor(
  scope: string,
  profile: AccountProfile | null,
  reload: () => Promise<AccountProfile | null>,
  readConfirmed: boolean,
) {
  const confirmed = useRef(readConfirmed);
  useLayoutEffect(() => { confirmed.current = readConfirmed; }, [readConfirmed]);
  const session = useRef<State | null>(null);
  const [view, setView] = useState({
    scope,
    draft: profile?.name ?? "",
    original: profile?.name ?? "",
    phase: "ready" as Phase,
    initialized: typeof profile?.name === "string",
  });
  const publish = () => {
    const current = session.current;
    if (current && !current.retired)
      setView({
        scope: current.scope,
        draft: current.draft,
        original: current.original,
        phase: current.phase,
        initialized: current.initialized,
      });
  };
  useLayoutEffect(() => {
    const s: State = {
      scope,
      draft: "",
      original: "",
      phase: "ready",
      controller: new AbortController(),
      retired: false,
      initialized: false,
      reviewName: null,
    };
    session.current = s;
    queueMicrotask(() => {
      if (session.current === s && !s.retired) publish();
    });
    return () => {
      s.retired = true;
      s.controller.abort();
      if (session.current === s) session.current = null;
    };
  }, [scope]);
  useLayoutEffect(() => {
    const s = session.current;
    if (
      s &&
      s.scope === scope &&
      (!s.initialized || (readConfirmed && s.phase === "ready" && s.draft === s.original)) &&
      typeof profile?.name === "string"
    ) {
      s.draft = profile.name;
      s.original = profile.name;
      s.initialized = true;
      queueMicrotask(() => {
        if (session.current === s && !s.retired) publish();
      });
    }
  }, [scope, profile, readConfirmed]);
  const active = (s: State) =>
    session.current === s &&
    !s.retired &&
    s.scope === scope &&
    !s.controller.signal.aborted;
  const reconcile = async (s: State, saved: boolean) => {
    const value = await reload();
    if (!active(s)) return;
    if (!value || typeof value.name !== "string") {
      s.phase = "readFailed";
      publish();
      return;
    }
    if (saved) {
      s.original = value.name;
      s.draft = value.name;
      s.phase = "saved";
    } else {
      s.reviewName = value.name;
      s.phase = "review";
    }
    publish();
  };
  const visible =
    view.scope === scope
      ? view
      : {
          scope,
          draft: "",
          original: "",
          phase: "ready" as Phase,
          initialized: false,
        };
  const editable =
    readConfirmed &&
    !!scope &&
    !!visible.initialized &&
    ![
      "submitting",
      "conflict",
      "reconciliationRequired",
      "readFailed",
      "review",
    ].includes(visible.phase);
  const valid =
    visible.initialized &&
    accountProfileUpdateSchema.safeParse({
      name: visible.draft,
      expected_name: visible.original,
    }).success;
  return {
    initialized: visible.initialized ?? false,
    draft: visible.draft,
    phase: visible.phase,
    editable,
    canSave: editable && valid && visible.draft !== visible.original,
    change(value: string) {
      const s = session.current;
      if (
        !s ||
        !confirmed.current ||
        !active(s) ||
        !editable ||
        [
          "submitting",
          "conflict",
          "reconciliationRequired",
          "readFailed",
          "review",
        ].includes(s.phase)
      )
        return;
      s.draft = value;
      s.phase = accountProfileUpdateSchema.safeParse({
        name: value,
        expected_name: s.original,
      }).success
        ? "editing"
        : "invalid";
      publish();
    },
    async save() {
      const s = session.current;
      if (
        !s ||
        !confirmed.current ||
        !active(s) ||
        !editable ||
        [
          "submitting",
          "conflict",
          "reconciliationRequired",
          "readFailed",
          "review",
        ].includes(s.phase) ||
        !valid ||
        s.draft === s.original ||
        !profile
      )
        return;
      const input = { name: s.draft, expected_name: s.original };
      s.phase = "submitting";
      publish();
      try {
        const outcome = await writeAccountProfile(
          input,
          profile.subject,
          s.controller.signal,
        );
        if (!active(s)) return;
        if (outcome.kind === "ack") {
          await reconcile(s, true);
          return;
        }
        if (
          outcome.status !== 409 &&
          ![401, 500, 502, 503].includes(outcome.status)
        ) {
          s.phase = "rejected";
          publish();
          return;
        }
        s.phase =
          outcome.status === 409 ? "conflict" : "reconciliationRequired";
      } catch {
        if (!active(s)) return;
        s.phase = "reconciliationRequired";
      }
      publish();
      await reconcile(s, false);
    },
    async retryRead() {
      const s = session.current;
      if (
        s &&
        active(s) &&
        ["conflict", "reconciliationRequired", "readFailed"].includes(s.phase)
      )
        await reconcile(s, false);
    },
    adoptServer() {
      const s = session.current;
      if (!s || !active(s) || s.phase !== "review" || s.reviewName === null)
        return;
      s.original = s.reviewName;
      s.draft = s.reviewName;
      s.reviewName = null;
      s.phase = "ready";
      publish();
    },
    keepDraft() {
      const s = session.current;
      if (!s || !active(s) || s.phase !== "review" || s.reviewName === null)
        return;
      s.original = s.reviewName;
      s.reviewName = null;
      s.phase = "editing";
      publish();
    },
  };
}
