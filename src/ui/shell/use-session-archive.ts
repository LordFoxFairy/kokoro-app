"use client";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import type { SessionEngine } from "@/engine/machine";
import { archiveIdAvailable, compareArchivedTasks, type ArchiveState } from "@/lib/archived-tasks.schema";
import { readArchivedTasks, readArchiveState, writeArchiveState } from "@/ui/settings/archived-tasks-client";

/** Page-owned commands and invalidation only. No global/persisted archive facts. */
type SessionArchiveInput=Readonly<{preview:boolean;boundary:ProjectReadBoundary|undefined;engine:SessionEngine|null;scope:string}>;
export function useSessionArchive({preview,boundary,engine,scope}:SessionArchiveInput) {
  const identity = useMemo(() => ({ preview, subject: boundary?.subject, generation: boundary?.generation, admitted: boundary?.admitted, engine, scope }), [preview, boundary?.subject, boundary?.generation, boundary?.admitted, engine, scope]);
  type Owner = { identity: typeof identity; controller: AbortController; active: boolean; busy: boolean; blocked: string | null; review: boolean };
  const owner = useRef<Owner | null>(null);
  const [view, setView] = useState<{ identity: typeof identity; revision: number; event: ArchiveState | null; busy: boolean; blocked: boolean; review: boolean; error: boolean } | null>(null);
  const current = () => { const x = owner.current; return x?.active && x.identity === identity && !x.controller.signal.aborted ? x : null; };
  const publish = (x: Owner, patch: Partial<NonNullable<typeof view>>) => { if (current() === x) setView(old => ({ identity, revision: old?.identity === identity ? old.revision : 0, event: old?.identity === identity ? old.event : null, busy: x.busy, blocked: x.blocked !== null, review: x.review, error: false, ...patch })); };
  const confirmed = (state: ArchiveState) => { const x = current(); if (!x) return; if(engine?.getSnapshot?.().locallyCreatedSessionId===state.session_id)engine.retireLocalCreationProvenance(); setView(old => ({ identity, revision: (old?.identity === identity ? old.revision : 0) + 1, event: state, busy: x.busy, blocked: x.blocked !== null, review: x.review, error: false })); };
  // One outer hard budget also covers injected/noncooperative clients.
  const bounded = async <T,>(x: Owner, work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController(); let no!: (e: unknown) => void;
    const stopped = new Promise<never>((_, reject) => { no = reject; });
    const abort = () => { controller.abort(); no(Error("archive_unknown")); };
    x.controller.signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 10000);
    try { if (x.controller.signal.aborted) abort(); const result = await Promise.race([stopped, Promise.resolve().then(() => { if(current()!==x || controller.signal.aborted) throw Error("retired"); return work(controller.signal); })]); if(current()!==x || controller.signal.aborted) throw Error("retired"); return result; }
    finally { clearTimeout(timer); x.controller.signal.removeEventListener("abort", abort); controller.abort(); }
  };
  const archive = async (id: string) => {
    const x = current(); if (!x || x.busy || x.blocked || !archiveIdAvailable(id)) return;
    x.busy = true; publish(x, {});
    try { const state = await bounded(x, signal => writeArchiveState({id,action:"archive",signal})); if(current()!==x)return; confirmed(state); }
    catch { if(current()===x){x.blocked=id;x.review=false;publish(x,{error:true});} }
    finally { if(current()===x){x.busy=false;publish(x,{});} }
  };
  const reconcile = async () => {
    const x=current();if(!x || x.busy || !x.blocked)return;
    x.busy=true;x.review=false;publish(x,{});
    try { const state=await bounded(x,async signal=>{
      let cursor:string|undefined, previous:import("@/lib/archived-tasks.schema").ArchivedTask|undefined;const ids=new Set<string>(),cursors=new Set<string>();
      for(let pages=0;;pages++) { const page=await readArchivedTasks({subject:x.identity.subject!,...(cursor===undefined?{}:{cursor}),signal});if(signal.aborted)throw Error();for(const item of page.data.items){if(ids.has(item.session_id)||ids.size>=2000||(previous && compareArchivedTasks(previous,item)>=0))throw Error();ids.add(item.session_id);previous=item;}const next=page.data.next_cursor;if(next===null)break;if(pages>=19||cursors.has(next))throw Error();cursors.add(next);cursor=next; }
      return readArchiveState({id:x.blocked!,signal});
    });if(current()!==x)return;confirmed(state);x.review=true;publish(x,{}); }
    catch {publish(x,{error:true});}
    finally{if(current()===x){x.busy=false;publish(x,{});}}
  };
  const proceed=()=>{const x=current();if(!x||x.busy||!x.review)return;x.blocked=null;x.review=false;publish(x,{});};
  useLayoutEffect(()=>{ const x:Owner={identity,controller:new AbortController(),active:!preview&&boundary?.admitted===true&&!!boundary.subject,busy:false,blocked:null,review:false};owner.current=x;return()=>{x.active=false;x.controller.abort();if(owner.current===x)owner.current=null;}; },[identity,preview,boundary?.admitted,boundary?.subject]);
  const visible=view?.identity===identity?view:null;
  return {revision:visible?.revision??0,event:visible?.event??null,busy:visible?.busy??false,blocked:visible?.blocked??false,review:visible?.review??false,error:visible?.error??false,archive,reconcile,proceed,confirmed};
}
