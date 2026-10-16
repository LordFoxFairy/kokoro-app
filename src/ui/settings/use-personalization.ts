"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { PERSONALIZATION_FIELD_LIMITS } from "./personalization-schema";
import {
  PersonalizationClientError,
  readPersonalization,
  replacePersonalization,
  type PersonalizationFields,
  type PersonalizationSnapshot,
} from "./personalization-client";

export const emptyPersonalization = (): PersonalizationFields => ({
  nickname: "",
  occupation: "",
  about: "",
  instructions: "",
});
type Phase =
  | "loading"
  | "load-error"
  | "ready"
  | "saving"
  | "conflict"
  | "unknown"
  | "review";
type View = {
  scope: string;
  fields: PersonalizationFields;
  phase: Phase;
  saved: boolean;
  server: PersonalizationSnapshot | null;
};
type Session = {
  scope: string;
  controller: AbortController;
  fields: PersonalizationFields;
  ack: PersonalizationSnapshot | null;
  phase: Phase;
  requested: boolean;
  saving: boolean;
  saved: boolean;
  server: PersonalizationSnapshot | null;
};
const same = (a: PersonalizationFields, b: PersonalizationFields) =>
  a.nickname === b.nickname &&
  a.occupation === b.occupation &&
  a.about === b.about &&
  a.instructions === b.instructions;

/** One identity-bound editing session; unresolved writes never replay themselves. */
export function usePersonalization(
  preview: boolean,
  boundary?: ProjectReadBoundary,
) {
  const scope = preview
    ? "preview"
    : boundary?.admitted && boundary.subject !== null
      ? `${boundary.generation}:${boundary.subject}`
      : "";
  const currentScope = useRef(scope);
  const session = useRef<Session | null>(null);
  useLayoutEffect(() => {
    currentScope.current = scope;
    if (session.current?.scope !== scope) session.current?.controller.abort();
  }, [scope]);
  const [view, setView] = useState<View>({
    scope: "",
    fields: emptyPersonalization(),
    phase: "loading",
    saved: false,
    server: null,
  });
  const active = (s: Session) =>
    session.current === s &&
    currentScope.current === s.scope &&
    !s.controller.signal.aborted;
  const publish = (s: Session) => {
    if (active(s))
      setView({
        scope: s.scope,
        fields: { ...s.fields },
        phase: s.phase,
        saved: s.saved,
        server: s.server,
      });
  };

  async function load(s: Session, recovery: boolean) {
    if (!active(s)) return;
    s.phase = "loading";
    s.saved = false;
    publish(s);
    try {
      const snapshot = await readPersonalization(s.controller.signal);
      if (!active(s)) return;
      if (recovery) {
        s.server = snapshot;
        s.phase = "review";
      } else {
        s.ack = snapshot;
        s.fields = snapshot.personalization ?? emptyPersonalization();
        s.phase = "ready";
      }
    } catch {
      if (!active(s)) return;
      s.phase = recovery ? "unknown" : "load-error";
    }
    publish(s);
  }

  async function save(s: Session) {
    if (
      !active(s) ||
      s.ack === null ||
      s.saving ||
      !["ready", "saving"].includes(s.phase)
    )
      return;
    s.saving = true;
    try {
      while (active(s) && s.requested) {
        s.requested = false;
        const sent = { ...s.fields };
        if (same(sent, s.ack.personalization ?? emptyPersonalization())) break;
        s.phase = "saving";
        s.saved = false;
        publish(s);
        try {
          const ack = await replacePersonalization(
            sent,
            s.ack.revision,
            s.controller.signal,
          );
          if (!active(s)) return;
          s.ack = ack;
          s.saved = same(s.fields, sent);
        } catch (error) {
          if (!active(s)) return;
          s.requested = false;
          s.phase =
            error instanceof PersonalizationClientError &&
            error.code === "personalization_revision_conflict"
              ? "conflict"
              : "unknown";
          s.saved = false;
          publish(s);
          return;
        }
      }
      if (active(s)) {
        s.phase = "ready";
        publish(s);
      }
    } finally {
      s.saving = false;
    }
  }

  useEffect(() => {
    if (!scope) return;
    const s: Session = {
      scope,
      controller: new AbortController(),
      fields: emptyPersonalization(),
      ack: null,
      phase: "loading",
      requested: false,
      saving: false,
      saved: false,
      server: null,
    };
    session.current = s;
    if (preview) {
      try {
        const value: unknown = JSON.parse(
          window.localStorage.getItem("kokoro.personalization.preview") ??
            "null",
        );
        if (value && typeof value === "object")
          for (const key of Object.keys(
            s.fields,
          ) as (keyof PersonalizationFields)[]) {
            const field = (value as Record<string, unknown>)[key];
            if (typeof field === "string") s.fields[key] = field;
          }
      } catch {
        /* Preview storage cannot block the editing surface. */
      }
      s.phase = "ready";
      // Publish from the async initialization boundary, like the live GET path.
      void Promise.resolve().then(() => publish(s));
    } else void Promise.resolve().then(() => load(s, false));
    return () => {
      s.controller.abort();
    };
    // Initialization is scoped to identity, not translated UI or callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, preview]);

  const visible =
    view.scope === scope && scope !== ""
      ? view
      : {
          scope,
          fields: emptyPersonalization(),
          phase: "loading" as Phase,
          saved: false,
          server: null,
        };
  return {
    ...visible,
    disabled: !scope || ["loading", "load-error"].includes(visible.phase),
    update(field: keyof PersonalizationFields, value: string) {
      const s = session.current;
      if (!s || !active(s) || ["loading", "load-error"].includes(s.phase))
        return;
      if ([...value].length > PERSONALIZATION_FIELD_LIMITS[field]) return;
      s.fields = { ...s.fields, [field]: value };
      s.saved = false;
      publish(s);
    },
    persist() {
      const s = session.current;
      if (!s || !active(s)) return;
      if (preview) {
        try {
          window.localStorage.setItem(
            "kokoro.personalization.preview",
            JSON.stringify(s.fields),
          );
          s.saved = true;
          publish(s);
        } catch {
          s.phase = "unknown";
          publish(s);
        }
      } else if (s.ack && ["ready", "saving"].includes(s.phase)) {
        s.requested = true;
        void save(s);
      }
    },
    retry() {
      const s = session.current;
      if (s && active(s) && !s.saving && s.phase !== "loading")
        void load(s, s.ack !== null);
    },
    chooseServer() {
      const s = session.current;
      if (!s || !active(s) || s.phase !== "review" || !s.server) return;
      s.ack = s.server;
      s.fields = s.server.personalization ?? emptyPersonalization();
      s.server = null;
      s.phase = "ready";
      s.saved = false;
      publish(s);
    },
    saveDraft() {
      const s = session.current;
      if (!s || !active(s) || s.phase !== "review" || !s.server) return;
      s.ack = s.server;
      s.server = null;
      s.phase = "ready";
      s.requested = true;
      void save(s);
    },
  };
}
