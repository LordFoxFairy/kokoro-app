import { connectorCommandFailure, connectorCommandMayResume, type ConnectorCommandFailure } from "./connector-command-failure";
import { HubClientError } from "@/hub/client";
import type { McpIconClient } from "@/hub/mcp-icon-client";
import type { McpIconIntent, McpIconReference, McpIconSaveChange } from "@/hub/mcp-icon.schema";
import { mcpIconInputs } from "@/hub/mcp-icon.schema";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";

export type McpIconDraftSnapshot = Readonly<{
  kind: "idle" | "running" | "ready" | "unknown" | "error";
  intent?: McpIconIntent | undefined; preview?: McpIconReference | undefined; clear: boolean; dirty: boolean;
  failure?: "file" | "operation" | "expired" | undefined; recovery?: ConnectorCommandFailure | undefined; mayRetry: boolean;
}>;
class IconSelectionExpired extends Error {}
type FileBytes = Readonly<{ name: string; type: string; arrayBuffer(): Promise<ArrayBuffer>; size: number }>;
/** Only a Storage-issued capability carries bytes. No credentials, redirects or new source selection. */
async function putIcon(reference: McpIconReference, bytes: Uint8Array, signal: AbortSignal): Promise<string> {
  if (reference.method !== "PUT" || Date.parse(reference.expires_at) <= Date.now()) throw new Error("icon_reference_expired");
  const response = await fetch(reference.url, { method: "PUT", headers: reference.required_headers, body: new Blob([Uint8Array.from(bytes)]), credentials: "omit", redirect: "error", signal });
  try {
    const version = response.headers.get("x-amz-version-id");
    if (!response.ok || !version || version === "null" || !/^[\x21-\x7e]{1,1024}$/u.test(version)) throw new Error("icon_upload_unconfirmed");
    return version;
  } finally { await response.body?.cancel().catch(() => undefined); }
}
export function createMcpIconDraft(client: McpIconClient | undefined, subject: string | null, key = () => crypto.randomUUID()) {
  let boundary: ProjectReadBoundary = { subject, admitted: false, generation: 0 };
  let state: McpIconDraftSnapshot = { kind: "idle", clear: false, dirty: false, mayRetry: false };
  const listeners = new Set<() => void>();
  let flight: AbortController | undefined;
  let job: ((signal: AbortSignal, check: () => void) => Promise<void>) | undefined;
  let owned: McpIconIntent | undefined;
  let cancelling: McpIconIntent | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let handedToSave = false, saveLockObserved = false, readOnlyFailure = false, everUncertain = false;
  const publish = (patch: Partial<McpIconDraftSnapshot>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const admitted = () => Boolean(client && subject !== null && boundary.subject === subject && boundary.admitted);
  const clearExpiry = () => { if (expiryTimer !== undefined) clearTimeout(expiryTimer); expiryTimer = undefined; };
  const expireSelection = () => {
    clearExpiry(); owned = undefined;
    publish({ kind: "error", failure: "expired", intent: undefined, preview: undefined, clear: false, dirty: false, recovery: undefined, mayRetry: false });
  };
  const refreshExpiry = () => {
    clearExpiry();
    // Only an exact confirmed, unsubmitted ready draft may retire locally.
    // A save owns its original selector until ACK or a known rejection unlock.
    if (!admitted() || handedToSave || flight || job || state.kind !== "ready" || owned?.state !== "ready") return;
    const remaining = Date.parse(owned.expires_at) - Date.now();
    if (owned.expired || remaining <= 0) { expireSelection(); return; }
    expiryTimer = setTimeout(refreshExpiry, Math.min(remaining, 2_147_483_647));
  };
  const run = async () => {
    if (!job || flight || !admitted() || state.kind === "unknown" && !state.mayRetry) return false;
    clearExpiry();
    const controller = new AbortController(), generation = boundary.generation;
    readOnlyFailure = false; flight = controller; publish({ kind: "running", mayRetry: false, failure: undefined });
    const timer = setTimeout(() => controller.abort(), 30_000);
    const check = () => { controller.signal.throwIfAborted(); if (!admitted() || boundary.generation !== generation) throw new Error("icon_actor_changed"); };
    try { await job(controller.signal, check); check(); job = undefined; return true; }
    catch (error) {
      if (error instanceof IconSelectionExpired) {
        job = undefined; expireSelection();
        return false;
      }
      // Definite pre-admission rejection allows a new choice. Every uncertain I/O keeps its exact closure/key/body/CAS.
      const rejected = error instanceof HubClientError && error.reason === "http" && error.status === 400 && !everUncertain;
      if (rejected) job = undefined;
      else everUncertain = true;
      const recovery = error instanceof HubClientError && error.reason === "parse" && !readOnlyFailure ? "invalid" : connectorCommandFailure("mcp", error);
      publish({ kind: rejected ? "error" : "unknown", failure: state.failure === "file" ? "file" : "operation", recovery, mayRetry: !rejected && (readOnlyFailure || connectorCommandMayResume(recovery)) });
      return false;
    } finally { clearTimeout(timer); if (flight === controller) { flight = undefined; publish({}); refreshExpiry(); } }
  };
  const canEdit = () => admitted() && !flight && !job && !handedToSave;
  const retirement = () => {
    const prior = owned, cancelKey = key();
    let current: McpIconIntent | undefined, retired = false;
    return async (signal: AbortSignal, check: () => void) => {
      if (!prior || handedToSave || retired) return;
      // Read only to obtain the exact current cancellation CAS, never to recover another command.
      if (!current) { check(); readOnlyFailure = true; const read = await client!.get(prior.intent_id, signal); check(); current = read.intent; readOnlyFailure = false; }
      // Already-retiring/expired unbound intents belong to the owner's durable cleanup, not a new Cancel.
      // An uncertain Cancel never reaches this branch: its original current/key stay frozen for replay.
      if (current.state === "released" || current.state === "retiring" || current.expired && current.state !== "bound") { owned = undefined; retired = true; return; }
      if (current.state === "bound") throw new Error("icon_is_bound");
      check(); await client!.cancel(prior.intent_id, { expected_state_version: current.state_version }, cancelKey, signal); check(); owned = undefined; retired = true;
    };
  };
  const finishReady = async (intent: McpIconIntent, signal: AbortSignal, check: () => void) => {
    check(); readOnlyFailure = true; const read = await client!.get(intent.intent_id, signal); check(); readOnlyFailure = false;
    // This read follows an exact confirmed Complete/Import ACK; it is not write-outcome recovery.
    if (read.intent.expired || Date.parse(read.intent.expires_at) <= Date.now() || read.intent.state === "retiring" || read.intent.state === "released") throw new IconSelectionExpired();
    if (read.intent.state !== "ready" || read.intent.expired || !read.preview_reference) throw new Error("icon_not_ready");
    owned = read.intent;
    publish({ kind: "ready", intent: read.intent, preview: read.preview_reference, clear: false, dirty: true, mayRetry: false });
  };
  return {
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    getSnapshot: () => state,
    available: Boolean(client),
    setBoundary(next: ProjectReadBoundary) { if (next.subject !== boundary.subject || next.generation !== boundary.generation || !next.admitted) { clearExpiry(); flight?.abort(); } boundary = next; refreshExpiry(); },
    async chooseFile(file: FileBytes) {
      if (!canEdit()) return false;
      clearExpiry();
      if (!mcpIconInputs.beginIcon.safeParse({ filename: file.name, mime_type: file.type, size_bytes: String(file.size), content_sha256: "0".repeat(64) }).success) { publish({ kind: "error", failure: "file", mayRetry: false }); return false; }
      const retire = retirement(), beginKey = key(), completeKey = key();
      let bytes: Uint8Array | undefined;
      let body: { filename: string; mime_type: "image/png" | "image/jpeg"; content_sha256: string; size_bytes: string } | undefined;
      let started: Awaited<ReturnType<McpIconClient["begin"]>> | undefined;
      let completeBody: { expected_state_version: string; source_version_id: string } | undefined;
      let completed: McpIconIntent | undefined;
      everUncertain = false;
      job = async (signal, check) => {
        if (!body) {
          bytes = new Uint8Array(await file.arrayBuffer()); check();
          if (bytes.byteLength !== file.size) throw new Error("icon_bytes_changed");
          const png = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((b, i) => bytes![i] === b);
          const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
          if (file.type === "image/png" ? !png : !jpeg) { job = undefined; publish({ failure: "file" }); throw new HubClientError("http", "invalid image", "invalid_mcp_personal_request", 400); }
          const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)))).map(b => b.toString(16).padStart(2, "0")).join(""); check();
          body = { filename: file.name, mime_type: file.type as "image/png" | "image/jpeg", content_sha256: sha, size_bytes: String(file.size) };
        }
        await retire(signal, check);
        if (!completeBody) {
          check(); const beginResult = await client!.begin(body, beginKey, signal); check(); started = beginResult; owned = started.intent;
          if (!started.upload_reference) throw new Error("icon_put_reference_missing");
          const source = await putIcon(started.upload_reference, bytes!, signal); check();
          completeBody = { expected_state_version: started.intent.state_version, source_version_id: source };
        }
        if (!completed) { check(); const completeResult = await client!.complete(started!.intent.intent_id, completeBody, completeKey, signal); check(); completed = completeResult.intent; }
        await finishReady(completed, signal, check);
      };
      return run();
    },
    async chooseUrl(imageUrl: string) {
      if (!canEdit()) return false;
      const retire = retirement(), commandKey = key(), body = Object.freeze({ image_url: imageUrl });
      let completed: McpIconIntent | undefined;
      everUncertain = false;
      job = async (signal, check) => { await retire(signal, check); if (!completed) { check(); const imported = await client!.importUrl(body, commandKey, signal); check(); completed = imported.intent; owned = completed; } await finishReady(completed, signal, check); };
      return run();
    },
    async remove() {
      if (!canEdit()) return false;
      const retire = retirement();
      everUncertain = false;
      job = async (signal, check) => { await retire(signal, check); publish({ kind: "idle", intent: undefined, preview: undefined, clear: true, dirty: true, mayRetry: false }); };
      return run();
    },
    retry: run,
    canSave() { if (!client) return !state.dirty; return admitted() && !flight && !job && state.kind !== "error" && (!owned || state.kind === "ready" && !owned.expired && Date.parse(owned.expires_at) > Date.now()); },
    change(): McpIconSaveChange { if (!state.dirty) return {}; return owned && state.kind === "ready" ? { icon: { intent_id: owned.intent_id, expected_state_version: owned.state_version } } : state.clear ? { clear_icon: true } : {}; },
    protectForSave() { if (owned) { clearExpiry(); handedToSave = true; saveLockObserved = false; } },
    setSaveLocked(locked: boolean) { if (locked && handedToSave) saveLockObserved = true; else if (!locked && saveLockObserved) { handedToSave = false; saveLockObserved = false; refreshExpiry(); } },
    confirmed() { clearExpiry(); handedToSave = false; owned = undefined; job = undefined; publish({ kind: "idle", dirty: false, mayRetry: false }); },
    projected() { if (!state.dirty && !job) publish({ intent: undefined, preview: undefined, clear: false }); },
    cancel() {
      if (handedToSave || !admitted()) return;
      clearExpiry();
      if (flight || job) { flight?.abort(); return; }
      const intent = owned;
      if (!intent || cancelling === intent) return;
      cancelling = intent;
      // One already-authorized command starts before the form closes. Its deadline outlives component cleanup;
      // there is no later Get->new POST under a possibly different cookie/actor. Unknown release stays owner-owned.
      const commandKey = key();
      void client!.cancel(intent.intent_id, { expected_state_version: intent.state_version }, commandKey, AbortSignal.timeout(10_000)).then(() => {
        if (owned === intent) { owned = undefined; publish({ kind: "idle", intent: undefined, preview: undefined, clear: false, dirty: false, mayRetry: false }); }
      }).catch(() => { /* Owner cancelled/expired cleanup resumes the original Storage release key. */ });
    },
    suspend() { clearExpiry(); flight?.abort(); },
  };
}
export type McpIconDraft = ReturnType<typeof createMcpIconDraft>;
