import * as client from "../personal-knowledge-client";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";

export type KnowledgeIntent =
  | {
      kind: "replace";
      id: string;
      fields: client.KnowledgeFields;
      expected: number;
    }
  | { kind: "remove"; id: string; expected: number }
  | { kind: "usage"; enabled: boolean; expected: number };
export type KnowledgePending = Readonly<{
  intent: KnowledgeIntent;
  phase: "saving" | "unconfirmed" | "conflict";
  canAdopt: boolean;
  rejected: boolean;
}>;
export type KnowledgeState = Readonly<{
  items: readonly client.KnowledgeItem[] | null;
  usage: client.KnowledgeUsage | null;
  itemsReady: boolean;
  usageReady: boolean;
  loading: boolean;
  verifying: boolean;
  pending: KnowledgePending | null;
  message:
    "loadFailed" | "unconfirmed" | "conflict" | "saved" | "invalid" | null;
}>;
type Api = Pick<
  typeof client,
  | "listKnowledge"
  | "readKnowledgeUsage"
  | "getKnowledge"
  | "replaceKnowledge"
  | "removeKnowledge"
  | "replaceKnowledgeUsage"
>;
const empty = (): KnowledgeState => ({
  items: null,
  usage: null,
  itemsReady: false,
  usageReady: false,
  loading: false,
  verifying: false,
  pending: null,
  message: null,
});
const sameFields = (a: client.KnowledgeFields, b: client.KnowledgeFields) =>
  a.name === b.name && a.whenToUse === b.whenToUse && a.content === b.content;
const notFound = (e: unknown) =>
  e instanceof client.KnowledgeClientError &&
  e.status === 404 &&
  e.code === "knowledge_not_found";

/** One actor's small preference workspace, not a command queue or durable business ledger. */
export function createKnowledgeSession(
  initial: ProjectReadBoundary,
  api: Api = client,
) {
  const actor = initial.subject;
  let boundary = { ...initial },
    retired = false,
    epoch = 0,
    loadSequence = 0;
  let state = empty();
  const listeners = new Set<() => void>(),
    controllers = new Set<AbortController>();
  const publish = (patch: Partial<KnowledgeState>) => {
    state = { ...state, ...patch };
    listeners.forEach((fn) => fn());
  };
  const allowed = () =>
    !retired &&
    actor !== null &&
    boundary.subject === actor &&
    boundary.admitted;
  const flight = () => {
    const controller = new AbortController(),
      captured = epoch;
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 15_000);
    return {
      signal: controller.signal,
      current: () => allowed() && captured === epoch,
      dispose: () => {
        clearTimeout(timer);
        controllers.delete(controller);
      },
    };
  };
  const stop = () => {
    epoch++;
    loadSequence++;
    controllers.forEach((c) => c.abort());
    controllers.clear();
  };
  const upsert = (item: client.KnowledgeItem) => {
    if (state.items === null) return;
    const items = [
      ...state.items.filter((row) => row.knowledgeId !== item.knowledgeId),
      item,
    ];
    items.sort(
      (a, b) =>
        Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
        (a.knowledgeId < b.knowledgeId
          ? -1
          : a.knowledgeId > b.knowledgeId
            ? 1
            : 0),
    );
    publish({ items });
  };
  const load = async () => {
    if (!allowed() || state.verifying) return;
    const current = flight(),
      sequence = ++loadSequence;
    publish({ loading: true, itemsReady: false, usageReady: false });
    try {
      const [list, usage] = await Promise.allSettled([
        api.listKnowledge("", current.signal),
        api.readKnowledgeUsage(current.signal),
      ]);
      if (!current.current() || sequence !== loadSequence) return;
      if (current.signal.aborted) {
        publish({ message: "loadFailed" });
        return;
      }
      publish({
        ...(list.status === "fulfilled"
          ? { items: list.value.items, itemsReady: true }
          : {}),
        ...(usage.status === "fulfilled"
          ? { usage: usage.value, usageReady: true }
          : {}),
        message:
          list.status === "rejected" || usage.status === "rejected"
            ? "loadFailed"
            : state.pending
              ? state.message
              : null,
      });
    } finally {
      if (current.current() && sequence === loadSequence)
        publish({ loading: false });
      current.dispose();
    }
  };
  const verify = async (): Promise<boolean> => {
    const pending = state.pending;
    if (
      !allowed() ||
      !pending ||
      state.verifying ||
      state.loading ||
      pending.phase === "saving"
    )
      return false;
    const current = flight(),
      intent = pending.intent;
    publish({ verifying: true });
    try {
      if (intent.kind === "usage") {
        const value = await api.readKnowledgeUsage(current.signal);
        if (
          !current.current() ||
          current.signal.aborted ||
          state.pending !== pending
        )
          return false;
        publish({ usage: value });
        if (
          value.revision === intent.expected + 1 &&
          value.enabled === intent.enabled
        ) {
          publish({ pending: null, message: "saved", usageReady: true });
          return true;
        }
        publish({
          pending: {
            ...pending,
            phase:
              value.revision > intent.expected ||
              (pending.rejected && value.revision === intent.expected)
                ? "conflict"
                : "unconfirmed",
            canAdopt:
              value.revision > intent.expected ||
              (pending.rejected && value.revision === intent.expected),
          },
          message:
            value.revision > intent.expected ||
            (pending.rejected && value.revision === intent.expected)
              ? "conflict"
              : "unconfirmed",
        });
        return false;
      }
      let item: client.KnowledgeItem | null;
      try {
        item = await api.getKnowledge(intent.id, current.signal);
      } catch (e) {
        if (!notFound(e)) throw e;
        item = null;
      }
      if (
        !current.current() ||
        current.signal.aborted ||
        state.pending !== pending
      )
        return false;
      if (item !== null) upsert(item);
      if (intent.kind === "remove" && item === null) {
        publish({
          items:
            state.items?.filter((row) => row.knowledgeId !== intent.id) ?? null,
          pending: null,
          message: "saved",
        });
        return true;
      }
      if (
        intent.kind === "replace" &&
        item?.revision === intent.expected + 1 &&
        sameFields(item, intent.fields)
      ) {
        publish({ pending: null, message: "saved" });
        return true;
      }
      const changed =
        item !== null &&
        (item.revision > intent.expected ||
          (pending.rejected && item.revision === intent.expected));
      // A missing create may still precede its COMMIT. Never free that frozen intent.
      const absentConflict =
        item === null &&
        intent.kind === "replace" &&
        (intent.expected > 0 || pending.rejected);
      if (absentConflict)
        publish({
          items:
            state.items?.filter((row) => row.knowledgeId !== intent.id) ?? null,
        });
      publish({
        pending: {
          ...pending,
          phase: changed || absentConflict ? "conflict" : "unconfirmed",
          canAdopt: changed || absentConflict,
        },
        message: changed || absentConflict ? "conflict" : "unconfirmed",
      });
      return false;
    } catch {
      if (current.current()) publish({ message: "unconfirmed" });
      return false;
    } finally {
      if (current.current()) publish({ verifying: false });
      current.dispose();
    }
  };
  const submit = async (intent: KnowledgeIntent): Promise<boolean> => {
    if (
      !allowed() ||
      state.pending !== null ||
      (intent.kind === "usage" ? !state.usageReady : !state.itemsReady)
    )
      return false;
    const current = flight();
    const frozen: KnowledgeIntent =
      intent.kind === "replace"
        ? { ...intent, fields: { ...intent.fields } }
        : { ...intent };
    publish({
      pending: {
        intent: frozen,
        phase: "saving",
        canAdopt: false,
        rejected: false,
      },
      message: null,
    });
    try {
      if (frozen.kind === "usage")
        await api.replaceKnowledgeUsage(
          frozen.enabled,
          frozen.expected,
          current.signal,
        );
      else if (frozen.kind === "remove")
        await api.removeKnowledge(frozen.id, frozen.expected, current.signal);
      else
        await api.replaceKnowledge(
          frozen.id,
          frozen.fields,
          frozen.expected,
          current.signal,
        );
      if (!current.current()) return false;
      current.signal.throwIfAborted();
      publish({
        pending: {
          intent: frozen,
          phase: "unconfirmed",
          canAdopt: false,
          rejected: false,
        },
      });
    } catch (error) {
      if (!current.current()) return false;
      if (
        error instanceof client.KnowledgeClientError &&
        error.code === "invalid_knowledge_input"
      ) {
        publish({ pending: null, message: "invalid" });
        return false;
      }
      const rejected =
        error instanceof client.KnowledgeClientError &&
        error.code !== null &&
        error.status >= 400 &&
        error.status < 500;
      publish({
        pending: {
          intent: frozen,
          phase: rejected ? "conflict" : "unconfirmed",
          canAdopt: false,
          rejected,
        },
        message: rejected ? "conflict" : "unconfirmed",
      });
      return false;
    } finally {
      current.dispose();
    }
    return verify();
  };
  return {
    subject: actor,
    getSnapshot: () => state,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    bind: (value: ProjectReadBoundary) => {
      if (retired) return;
      if (value.subject !== actor) {
        retired = true;
        stop();
        publish(empty());
        return;
      }
      if (
        value.admitted === boundary.admitted &&
        value.generation === boundary.generation
      )
        return;
      stop();
      boundary = { ...value };
      publish({
        loading: false,
        verifying: false,
        itemsReady: false,
        usageReady: false,
        ...(state.pending?.phase === "saving"
          ? {
              pending: { ...state.pending, phase: "unconfirmed" },
              message: "unconfirmed",
            }
          : {}),
      });
    },
    retire: () => {
      retired = true;
      stop();
      publish(empty());
    },
    pause: () => {
      stop();
      publish({
        loading: false,
        verifying: false,
        itemsReady: false,
        usageReady: false,
        ...(state.pending?.phase === "saving"
          ? {
              pending: { ...state.pending, phase: "unconfirmed" },
              message: "unconfirmed",
            }
          : {}),
      });
    },
    load,
    verify,
    replace: (id: string, fields: client.KnowledgeFields, expected: number) =>
      submit({ kind: "replace", id, fields, expected }),
    remove: (item: client.KnowledgeItem) =>
      submit({ kind: "remove", id: item.knowledgeId, expected: item.revision }),
    setUsage: (enabled: boolean) =>
      state.usage === null
        ? Promise.resolve(false)
        : submit({ kind: "usage", enabled, expected: state.usage.revision }),
    adoptCurrent: () => {
      if (!allowed() || !state.pending?.canAdopt || state.verifying)
        return false;
      publish({ pending: null, message: null });
      return true;
    },
  };
}
export type KnowledgeSession = ReturnType<typeof createKnowledgeSession>;
