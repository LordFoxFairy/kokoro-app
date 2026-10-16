"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AccountProfile } from "@/lib/account-profile.schema";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { readAccountProfile } from "./account-profile-client";

type View = {
  scope: string;
  profile: AccountProfile | null;
  phase: "loading" | "error" | "ready";
};
type Read = { scope: string; controller: AbortController; pending: boolean };
/** Existing admitted identity owns each read, including retry and retirement. */
export function useAccountProfile(
  preview: boolean,
  boundary?: ProjectReadBoundary,
) {
  const scope =
    !preview && boundary?.admitted && boundary.subject !== null
      ? JSON.stringify([boundary.generation, boundary.subject])
      : "";
  const subject = boundary?.subject;
  const scopeRef = useRef(scope);
  const read = useRef<Read | null>(null);
  const [view, setView] = useState<View>({
    scope: "",
    profile: null,
    phase: "loading",
  });
  useLayoutEffect(() => {
    scopeRef.current = scope;
    if (read.current?.scope !== scope) read.current?.controller.abort();
  }, [scope]);
  async function load(r: Read) {
    if (
      r.pending ||
      r.controller.signal.aborted ||
      scopeRef.current !== r.scope
    )
      return null;
    r.pending = true;
    setView({ scope: r.scope, profile: null, phase: "loading" });
    try {
      const profile = await readAccountProfile(r.controller.signal);
      if (profile.subject !== subject)
        throw new Error("Account identity changed");
      if (
        read.current === r &&
        scopeRef.current === r.scope &&
        !r.controller.signal.aborted
      ) {
        setView({ scope: r.scope, profile, phase: "ready" });
        return profile;
      }
      return null;
    } catch {
      if (
        read.current === r &&
        scopeRef.current === r.scope &&
        !r.controller.signal.aborted
      )
        setView({ scope: r.scope, profile: null, phase: "error" });
      return null;
    } finally {
      r.pending = false;
    }
  }
  useEffect(() => {
    if (!scope) return;
    const r: Read = {
      scope,
      controller: new AbortController(),
      pending: false,
    };
    read.current = r;
    void Promise.resolve().then(() => load(r));
    return () => r.controller.abort();
    // Identity, not translated UI or object identity, owns this read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);
  const visible =
    view.scope === scope && scope
      ? view
      : { scope, profile: null, phase: "loading" as const };
  return {
    ...visible,
    async reload() {
      const r = read.current;
      return r ? await load(r) : null;
    },
    retry() {
      const r = read.current;
      if (r) void load(r);
    },
  };
}
