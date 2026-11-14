"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import styles from "./mcp-projection-read.module.css";

/** One failed reader stays beside its own retained content. */
export function McpReadFeedback({ message, retryLabel, onRetry, disabled = false, busy = false }: {
  message: string;
  retryLabel?: string;
  onRetry?: (() => void) | undefined;
  disabled?: boolean;
  busy?: boolean;
}) {
  const button = useRef<HTMLButtonElement | null>(null);
  const ownsFocus = useRef(false);
  useEffect(() => {
    const moved = (event: FocusEvent | PointerEvent) => {
      if (event.target !== button.current && (event.type === "pointerdown" || event.target !== document.body)) ownsFocus.current = false;
    };
    const tabbed = (event: KeyboardEvent) => { if (event.key === "Tab") ownsFocus.current = false; };
    const blurred = () => { ownsFocus.current = false; };
    document.addEventListener("focusin", moved);
    document.addEventListener("pointerdown", moved);
    document.addEventListener("keydown", tabbed);
    window.addEventListener("blur", blurred);
    return () => {
      document.removeEventListener("focusin", moved);
      document.removeEventListener("pointerdown", moved);
      document.removeEventListener("keydown", tabbed);
      window.removeEventListener("blur", blurred);
    };
  }, []);
  useLayoutEffect(() => {
    if (busy || disabled || !ownsFocus.current) return;
    // Some browsers blur native disabled buttons. Restore only this retry's
    // keyboard focus; moving to another control or tab relinquishes ownership.
    if (document.activeElement === document.body) button.current?.focus({ preventScroll: true });
    ownsFocus.current = false;
  }, [busy, disabled]);
  return <div className={styles.readFeedback} role="status" aria-busy={busy || undefined}>
    <span>{message}</span>
    {onRetry ? <Button ref={button} type="button" size="sm" variant="ghost" disabled={disabled || busy} onClick={() => {
      ownsFocus.current = document.activeElement === button.current;
      onRetry();
    }}>{retryLabel}</Button> : null}
  </div>;
}
