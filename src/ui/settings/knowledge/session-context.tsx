"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { createKnowledgeSession, type KnowledgeSession } from "./session";

const Context = createContext<KnowledgeSession | null>(null);
export function useKnowledgeSession() {
  return useContext(Context);
}

/** The existing stable overlay shell owns this lifetime, not the transient editor/modal. */
export function PersonalKnowledgeProvider({
  boundary,
  preview = false,
  children,
}: {
  boundary: ProjectReadBoundary;
  preview?: boolean;
  children: ReactNode;
}) {
  const actor = preview ? null : boundary.subject;
  const session = useMemo(
    () =>
      createKnowledgeSession({
        subject: actor,
        admitted: false,
        generation: 0,
      }),
    [actor],
  );
  const previous = useRef(session);
  useLayoutEffect(() => {
    if (previous.current !== session) previous.current.retire();
    previous.current = session;
    session.bind({
      subject: actor,
      admitted: !preview && boundary.admitted,
      generation: boundary.generation,
    });
    return () => session.pause();
  }, [actor, boundary.admitted, boundary.generation, preview, session]);
  return <Context.Provider value={session}>{children}</Context.Provider>;
}
