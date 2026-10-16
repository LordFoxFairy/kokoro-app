"use client";
import { useLayoutEffect, useRef, useState } from "react";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";

import { compareArchivedTasks, type ArchivedTask } from "@/lib/archived-tasks.schema";
import { readArchivedTasks, readArchiveState, writeArchiveState } from "./archived-tasks-client";

type Snapshot = {
  items: ArchivedTask[];
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
type ArchivedTasksInput=Readonly<{preview:boolean;boundary?:ProjectReadBoundary;onChanged?: (state: import("@/lib/archived-tasks.schema").ArchiveState) => void}>;
export function useArchivedTasks({preview,boundary,onChanged}:ArchivedTasksInput) {
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
    target: string | null;
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
    const controller = new AbortController();
    let reject!: (reason:unknown)=>void;
    const stopped=new Promise<never>((_,no)=>{reject=no;});
    const abort=()=>{controller.abort();reject(Error("retired"));};
    const timer=setTimeout(abort,10000);
    x.controller.signal.addEventListener("abort", abort, { once: true });
    operationSignal?.addEventListener("abort", abort, { once: true });
    if (operationSignal?.aborted) abort();
    const operation=async()=>{
      const items: ArchivedTask[] = [];
      let next = cursor,
        pages = 0;
      const cursors = new Set<string>(),
        ids = new Set<string>();
      for (;;) {
        const page = await readArchivedTasks({subject:x.subject,...(next===undefined?{}:{cursor:next}),signal:controller.signal});
        if (current() !== x || controller.signal.aborted)
          throw Error("retired");
        pages++;
        for (const item of page.data.items) {
          if (
            ids.has(item.session_id) ||
            items.length >= 2000 ||
            (items.length > 0 && compareArchivedTasks(items.at(-1)!, item) >= 0)
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
    };
    try { return await Promise.race([stopped,operation()]); } finally {
      clearTimeout(timer);
      x.controller.signal.removeEventListener("abort", abort);
      operationSignal?.removeEventListener("abort", abort);
      controller.abort();
    }
  };
  const bounded=async <T,>(x:NonNullable<typeof owner.current>, work:(signal:AbortSignal)=>Promise<T>):Promise<T>=>{
    const controller=new AbortController();let reject!:(e:unknown)=>void;
    const stopped=new Promise<never>((_,no)=>{reject=no;});const abort=()=>{controller.abort();reject(Error("unknown"));};
    x.controller.signal.addEventListener("abort",abort,{once:true});const timer=setTimeout(abort,10000);
    try {if(x.controller.signal.aborted)abort();const value=await Promise.race([stopped,Promise.resolve().then(()=>{if(controller.signal.aborted||current()!==x)throw Error();return work(controller.signal);})]);if(current()!==x||controller.signal.aborted)throw Error();return value;}
    finally{clearTimeout(timer);x.controller.signal.removeEventListener("abort",abort);controller.abort();}
  };
  const reload = async () => {
    const x = begin();
    if (!x) return;
    if(x.blocked){x.review=false;publish(x,{...x.snapshot,review:false});}
    try {
      const page = await bounded(x,async signal=>{
      const page=await read(x,x.blocked,undefined,signal);
      if (x.blocked && x.target) {
        // Archive-list absence is not proof of restore: deleted/foreign tasks are also absent.
        const state = await readArchiveState({id:x.target,signal});
        if(current()!==x || state.archived_at!==null) throw Error("unconfirmed");
        if(signal.aborted)throw Error();
        onChanged?.(state);
      }
      return page;
      });
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
    if(current()?.blocked)return;
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
          (i, n) => n > 0 && compareArchivedTasks(items[n - 1]!, i) >= 0,
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
  const restore = async (id: string) => {
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
      const page = await bounded(x,async signal=>{
      const receipt = await writeArchiveState({id,action:"restore",signal});
      if(current()!==x||signal.aborted)throw Error();
      onChanged?.(receipt);
      if (current() !== x) throw Error("retired");
      if (controller.signal.aborted || performance.now() >= deadline)
        throw Error("unknown");
      const page = await read(x, true, undefined, signal);
      const confirmed=await readArchiveState({id,signal});
      if(confirmed.archived_at!==null||signal.aborted)throw Error("unconfirmed");
      return page;
      });
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
        x.target = id;
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
    x.target = null;
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
      target: null,
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
    restore,
    proceed,
  };
}
