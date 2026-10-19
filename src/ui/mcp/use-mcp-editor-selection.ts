"use client";

import { useLayoutEffect, useRef, type SyntheticEvent } from "react";

type Selection = {
  fieldId: string;
  length: number;
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
  scrollTop: number;
  scrollLeft: number;
};

/** Pure editing intent only: no field values, credentials, owner data or timers. */
export function useMcpEditorSelection(ready: boolean) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const selection = useRef<Selection | null>(null);
  const rememberSelection = (event: SyntheticEvent<HTMLFormElement>, userInteraction = false) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) ||
        field !== document.activeElement || !field.id || field.selectionStart === null || field.selectionEnd === null) return;
    // Retiring an untouched owner value clears it to empty and collapses its
    // DOM range. Ignore that reset, but retain a user's newer selection in a
    // readonly dirty field whose text has stayed unchanged throughout pending.
    const saved = selection.current;
    if (!ready && !userInteraction && event.type !== "focus" && (!saved || saved.fieldId !== field.id || saved.length !== field.value.length)) return;
    selection.current = {
      fieldId: field.id, length: field.value.length, start: field.selectionStart, end: field.selectionEnd,
      direction: field.selectionDirection ?? "none",
      scrollTop: field.scrollTop, scrollLeft: field.scrollLeft,
    };
  };
  useLayoutEffect(() => {
    const saved = selection.current;
    if (!ready || !saved) return;
    const field = formRef.current?.elements.namedItem(saved.fieldId);
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) ||
        field !== document.activeElement || !formRef.current?.contains(field) || field.selectionStart === null) return;
    // Untouched owner values were cleared while admission was uncertain. On
    // the fresh value, restore a bounded range without stealing focus from a
    // close/retry button or another field the user chose in the meantime.
    const length = field.value.length;
    field.setSelectionRange(Math.min(saved.start, length), Math.min(saved.end, length), saved.direction);
    field.scrollTop = saved.scrollTop;
    field.scrollLeft = saved.scrollLeft;
    // A later recheck starts from the actual clamped position, not the range
    // that belonged to a longer, already-retired owner value.
    selection.current = {
      fieldId: saved.fieldId, length,
      start: field.selectionStart!, end: field.selectionEnd!,
      direction: field.selectionDirection ?? "none",
      scrollTop: field.scrollTop, scrollLeft: field.scrollLeft,
    };
  }, [ready]);
  return {
    ref: formRef,
    onFocusCapture: rememberSelection,
    onSelectCapture: rememberSelection,
    onScrollCapture: rememberSelection,
    // A key/pointer action on a masked empty field is still a newer choice.
    // Capture it before the native selection step; subsequent Select events
    // refine this snapshot without confusing a render-driven clear with input.
    onKeyDownCapture: (event: SyntheticEvent<HTMLFormElement>) => rememberSelection(event, true),
    onPointerDownCapture: (event: SyntheticEvent<HTMLFormElement>) => rememberSelection(event, true),
  };
}
