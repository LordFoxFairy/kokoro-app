"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BookOpen, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/i18n/context";
import type { KnowledgeItem } from "../personal-knowledge-client";
import { useKnowledgeSession } from "./session-context";
import type { KnowledgeSession } from "./session";
import {
  KnowledgeEditor,
  KnowledgeRemoveDialog,
  type KnowledgeSelection,
} from "./knowledge-editor";
import { KnowledgeFeedback } from "./knowledge-feedback";
import styles from "./knowledge.module.css";
export function KnowledgePanel(props: {
  admitted: boolean;
  generation: number;
}) {
  const session = useKnowledgeSession(),
    t = useT();
  return session ? (
    <ConnectedKnowledgePanel
      key={session.subject ?? "anonymous"}
      {...props}
      session={session}
    />
  ) : (
    <p>{t("settings.knowledgeUnavailable")}</p>
  );
}
function ConnectedKnowledgePanel({
  session,
  admitted,
  generation,
}: {
  session: KnowledgeSession;
  admitted: boolean;
  generation: number;
}) {
  const t = useT(),
    state = useSyncExternalStore(
      session.subscribe,
      session.getSnapshot,
      session.getSnapshot,
    );
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<KnowledgeSelection | null>(null);
  const [removing, setRemoving] = useState<KnowledgeItem | null>(null);
  const focus = useRef<HTMLElement | null>(null),
    add = useRef<HTMLButtonElement | null>(null),
    root = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (admitted) void session.load();
  }, [session, admitted, generation]);
  const canWrite = admitted && state.itemsReady && state.pending === null;
  const rows =
    state.items?.filter((item) =>
      [item.name, item.whenToUse, item.content].some((text) =>
        text.toLowerCase().includes(query.toLowerCase()),
      ),
    ) ?? [];
  const close = () => {
    setSelection(null);
    setRemoving(null);
  };
  const returnTarget = () => {
    if (!focus.current?.isConnected || focus.current.hasAttribute("disabled"))
      focus.current = add.current?.disabled ? root.current : add.current;
  };
  return (
    <div
      className={styles.panel}
      ref={root}
      tabIndex={-1}
      aria-busy={state.loading || undefined}
    >
      <div className={styles.usage}>
        <div>
          <p>{t("settings.knowledgeUse")}</p>
          <p>{t("settings.knowledgeUseHint")}</p>
        </div>
        <Switch
          className={styles.usageSwitch}
          aria-label={t("settings.knowledgeUse")}
          checked={admitted && state.usage?.enabled === true}
          disabled={!admitted || !state.usageReady || state.pending !== null}
          onCheckedChange={(value) => void session.setUsage(value)}
        />
      </div>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search aria-hidden="true" />
          <input
            aria-label={t("settings.searchKnowledge")}
            placeholder={t("settings.searchKnowledge")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Button
          ref={add}
          className={styles.add}
          variant="ghost"
          disabled={!canWrite || (state.items?.length ?? 0) >= 100}
          onClick={(e) => {
            focus.current = e.currentTarget;
            setSelection({
              id: crypto.randomUUID(),
              expected: 0,
              fields: { name: "", whenToUse: "", content: "" },
            });
          }}
        >
          <Plus aria-hidden="true" />
          {t("settings.addKnowledge")}
        </Button>
      </div>
      {selection === null && removing === null ? (
        <KnowledgeFeedback
          session={session}
          state={state}
          admitted={admitted}
        />
      ) : null}
      {state.pending?.intent.kind === "replace" && !selection && !removing ? (
        <Button
          className={styles.draft}
          size="sm"
          variant="outline"
          onClick={(e) => {
            const intent = state.pending!.intent;
            if (intent.kind !== "replace") return;
            focus.current = e.currentTarget;
            setSelection({
              id: intent.id,
              fields: intent.fields,
              expected: intent.expected,
            });
          }}
        >
          {t("settings.knowledgeDraft")}
        </Button>
      ) : null}
      {(state.items?.length ?? 0) >= 100 ? (
        <p className={styles.limit}>{t("settings.knowledgeLimit")}</p>
      ) : null}
      {admitted && state.items !== null ? (
        rows.length ? (
          <ul className={styles.list}>
            {rows.map((item) => (
              <li key={item.knowledgeId}>
                <div className={styles.itemText}>
                  <h3>{item.name}</h3>
                  <p>{item.whenToUse}</p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`${t("settings.knowledgeEdit")} ${item.name}`}
                  disabled={!canWrite}
                  onClick={(e) => {
                    focus.current = e.currentTarget;
                    setSelection({
                      id: item.knowledgeId,
                      fields: {
                        name: item.name,
                        whenToUse: item.whenToUse,
                        content: item.content,
                      },
                      expected: item.revision,
                    });
                  }}
                >
                  <Pencil aria-hidden="true" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`${t("settings.knowledgeDelete")} ${item.name}`}
                  disabled={!canWrite}
                  onClick={(e) => {
                    focus.current = e.currentTarget;
                    setRemoving(item);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        ) : state.itemsReady ? (
          <div className={styles.empty}>
            <BookOpen aria-hidden="true" />
            <p>
              {t(
                query
                  ? "settings.knowledgeEmptySearch"
                  : "settings.noKnowledge",
              )}
            </p>
          </div>
        ) : null
      ) : null}
      {state.loading ? (
        <span className="sr-only" role="status">
          {t("settings.loading")}
        </span>
      ) : null}
      {selection ? (
        <KnowledgeEditor
          key={selection.id}
          selection={selection}
          session={session}
          state={state}
          admitted={admitted}
          returnFocus={focus}
          onClose={() => {
            returnTarget();
            close();
          }}
        />
      ) : null}
      {removing ? (
        <KnowledgeRemoveDialog
          item={removing}
          session={session}
          state={state}
          admitted={admitted}
          returnFocus={focus}
          onClose={() => {
            returnTarget();
            close();
          }}
        />
      ) : null}
    </div>
  );
}
