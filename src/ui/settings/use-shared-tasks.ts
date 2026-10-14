"use client";
import { useLayoutEffect, useRef, useState } from "react";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { createSessionClient } from "@/engine/client";
import { compareSharedTasks, type SharedTask } from "@/lib/shared-tasks.schema";
import { readSharedTasks } from "./shared-tasks-client";

type Snapshot = {
  items: SharedTask[];
  cursor: string | null;
  pages: number;
  busy: boolean;
  error: boolean;
  blocked: boolean;
  review: boolean;
};
const empty: Snapshot = {
  items: [],
  cursor: null,
  pages: 0,
  busy: false,
  error: false,
  blocked: false,
  review: false,
};
export function useSharedTasks(
  preview: boolean,
  boundary?: ProjectReadBoundary,
) {
  const scope =
    !preview && boundary?.admitted && boundary.subject !== null
      ? `${boundary.subject}:${boundary.generation}`
      : null;
  const owner = useRef<{
    scope: string;
    subject: string;
    controller: AbortController;
    busy: boolean;
    retired: boolean;
    blocked: boolean;
    review: boolean;
    snapshot: Snapshot;
    cursors: Set<string>;
  } | null>(null);
  const [state, setState] = useState<{ scope: string | null; value: Snapshot }>(
    { scope: null, value: empty },
  );
  const current = () => {
    const x = owner.current;
    return x && !x.retired && x.scope === scope && !x.controller.signal.aborted
      ? x
      : null;
  };
  const publish = (x: NonNullable<typeof owner.current>, value: Snapshot) => {
    if (current() === x) {
      x.snapshot = value;
      setState({ scope: x.scope, value });
    }
  };
  const begin = () => {
    const x = current();
    if (!x || x.busy) return null;
    x.busy = true;
    publish(x, { ...x.snapshot, busy: true, error: false });
    return x;
  };
  const read = async (
    x: NonNullable<typeof owner.current>,
    full: boolean,
    cursor?: string,
    operationSignal?: AbortSignal,
  ) => {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 10_000),
      abort = () => controller.abort();
    x.controller.signal.addEventListener("abort", abort, { once: true });
    operationSignal?.addEventListener("abort", abort, { once: true });
    if (operationSignal?.aborted) abort();
    try {
      const items: SharedTask[] = [];
      let next = cursor,
        pages = 0;
      const cursors = new Set<string>(),
        ids = new Set<string>();
      for (;;) {
        const page = await readSharedTasks(x.subject, next, controller.signal);
        if (current() !== x || controller.signal.aborted)
          throw Error("retired");
        pages++;
        for (const item of page.data.items) {
          if (
            ids.has(item.session_id) ||
            items.length >= 2000 ||
            (items.length > 0 && compareSharedTasks(items.at(-1)!, item) >= 0)
          )
            throw Error("incomplete");
          ids.add(item.session_id);
          items.push(item);
        }
        const after = page.data.next_cursor;
        if (!full || after === null) return { items, cursor: after, pages };
        if (pages >= 20 || cursors.has(after)) throw Error("incomplete");
        cursors.add(after);
        next = after;
      }
    } finally {
      clearTimeout(timer);
      x.controller.signal.removeEventListener("abort", abort);
      operationSignal?.removeEventListener("abort", abort);
      controller.abort();
    }
  };
  const reload = async () => {
    const x = begin();
    if (!x) return;
    try {
      const page = await read(x, x.blocked);
      if (current() !== x) return;
      x.review = x.blocked;
      x.cursors = new Set(page.cursor === null ? [] : [page.cursor]);
      publish(x, {
        ...page,
        busy: false,
        error: false,
        blocked: x.blocked,
        review: x.review,
      });
    } catch {
      publish(x, { ...x.snapshot, busy: false, error: true });
    } finally {
      x.busy = false;
    }
  };
  const more = async () => {
    const x = begin();
    if (!x) return;
    try {
      if (!x.snapshot.cursor || x.snapshot.pages >= 20)
        throw Error("incomplete");
      const page = await read(x, false, x.snapshot.cursor);
      const items = [...x.snapshot.items, ...page.items];
      if (
        items.length > 2000 ||
        new Set(items.map((i) => i.session_id)).size !== items.length ||
        items.some(
          (i, n) => n > 0 && compareSharedTasks(items[n - 1]!, i) >= 0,
        ) ||
        (page.cursor !== null && x.cursors.has(page.cursor))
      )
        throw Error("incomplete");
      if (page.cursor !== null) x.cursors.add(page.cursor);
      publish(x, {
        ...x.snapshot,
        items,
        cursor: page.cursor,
        pages: x.snapshot.pages + 1,
        busy: false,
        error: false,
      });
    } catch {
      publish(x, { ...x.snapshot, busy: false, error: true });
    } finally {
      x.busy = false;
    }
  };
  const revoke = async (id: string) => {
    const x = current();
    if (
      !x ||
      x.busy ||
      x.blocked ||
      !x.snapshot.items.some((i) => i.session_id === id)
    )
      return;
    x.busy = true;
    publish(x, { ...x.snapshot, busy: true, error: false });
    const controller = new AbortController(),
      deadline = performance.now() + 10000,
      timer = setTimeout(() => controller.abort(), 10000),
      abort = () => controller.abort();
    x.controller.signal.addEventListener("abort", abort, { once: true });
    try {
      await createSessionClient({ baseUrl: "/api/session" }).revokeShare(
        id,
        controller.signal,
      );
      if (current() !== x) return;
      if (controller.signal.aborted || performance.now() >= deadline)
        throw Error("unknown");
      const page = await read(x, true, undefined, controller.signal);
      if (current() !== x) return;
      if (
        controller.signal.aborted ||
        performance.now() >= deadline ||
        page.items.some((item) => item.session_id === id)
      )
        throw Error("unconfirmed");
      publish(x, {
        ...page,
        busy: false,
        error: false,
        blocked: false,
        review: false,
      });
    } catch {
      if (current() === x) {
        x.blocked = true;
        x.review = false;
        publish(x, {
          ...x.snapshot,
          busy: false,
          error: true,
          blocked: true,
          review: false,
        });
      }
    } finally {
      x.busy = false;
      clearTimeout(timer);
      x.controller.signal.removeEventListener("abort", abort);
      controller.abort();
    }
  };
  const proceed = () => {
    const x = current();
    if (!x || x.busy || !x.blocked || !x.review) return;
    x.blocked = false;
    x.review = false;
    publish(x, { ...x.snapshot, blocked: false, review: false });
  };
  // The immutable scope owns this effect; snapshot updates must not restart its requests.
  useLayoutEffect(() => {
    if (scope === null) return;
    const x = {
      scope,
      subject: boundary!.subject!,
      controller: new AbortController(),
      busy: false,
      retired: false,
      blocked: false,
      review: false,
      snapshot: empty,
      cursors: new Set<string>(),
    };
    owner.current = x;
    queueMicrotask(() => {
      if (owner.current === x && !x.retired) void reload();
    });
    return () => {
      x.retired = true;
      x.controller.abort();
      if (owner.current === x) owner.current = null;
    };
    // Only identity changes own retirement; state-dependent callbacks must not restart this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]); // one admitted identity owns all work
  return {
    ...(state.scope === scope && scope !== null ? state.value : empty),
    available: scope !== null,
    reload,
    more,
    revoke,
    proceed,
  };
}
