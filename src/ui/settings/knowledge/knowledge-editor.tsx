"use client";
import { useId, useState, type RefObject } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/context";
import { knowledgeFieldsSchema } from "@/contract/personal-knowledge";
import type {
  KnowledgeFields,
  KnowledgeItem,
} from "../personal-knowledge-client";
import type { KnowledgeSession, KnowledgeState } from "./session";
import { KnowledgeFeedback } from "./knowledge-feedback";
import styles from "./knowledge.module.css";
export type KnowledgeSelection = {
  id: string;
  fields: KnowledgeFields;
  expected: number;
};
type Common = {
  session: KnowledgeSession;
  state: KnowledgeState;
  admitted: boolean;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
};
export function KnowledgeEditor({
  selection,
  session,
  state,
  admitted,
  onClose,
  returnFocus,
}: Common & { selection: KnowledgeSelection }) {
  const t = useT(),
    counter = useId();
  const [fields, setFields] = useState(selection.fields);
  const frozen = !admitted || state.pending !== null || !state.itemsReady;
  const valid = knowledgeFieldsSchema.safeParse({
    name: fields.name,
    when_to_use: fields.whenToUse,
    content: fields.content,
  }).success;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={styles.editor}
        closeLabel={t("settings.knowledgeClose")}
        aria-describedby={undefined}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus.current?.focus({ preventScroll: true });
        }}
      >
        <div className={styles.dialogHeader}>
          <DialogTitle>
            {t(
              selection.expected === 0
                ? "settings.addKnowledgeTitle"
                : "settings.knowledgeEditTitle",
            )}
          </DialogTitle>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!frozen && valid)
              void session
                .replace(selection.id, fields, selection.expected)
                .then((ok) => {
                  if (ok) onClose();
                });
          }}
        >
          <div className={styles.dialogBody}>
            <label>
              <span>{t("settings.knowledgeNameLabel")}</span>
              <Input
                autoFocus
                value={fields.name}
                disabled={frozen}
                required
                placeholder={t("settings.knowledgeNamePlaceholder")}
                onChange={(e) => setFields({ ...fields, name: e.target.value })}
              />
            </label>
            <label>
              <span>{t("settings.knowledgeWhenLabel")}</span>
              <Input
                value={fields.whenToUse}
                disabled={frozen}
                required
                placeholder={t("settings.knowledgeWhenPlaceholder")}
                onChange={(e) =>
                  setFields({ ...fields, whenToUse: e.target.value })
                }
              />
            </label>
            <label>
              <span>{t("settings.knowledgeContentLabel")}</span>
              <div className={styles.contentField}>
                <Textarea
                  aria-label={t("settings.knowledgeContentLabel")}
                  value={fields.content}
                  disabled={frozen}
                  required
                  aria-describedby={counter}
                  placeholder={t("settings.knowledgeContentPlaceholder")}
                  onChange={(e) =>
                    setFields({ ...fields, content: e.target.value })
                  }
                />
                <p id={counter} className={styles.counter}>
                  {[...fields.content].length} / 2000
                </p>
              </div>
            </label>
            {!admitted ? (
              <p role="status">{t("settings.knowledgeReadOnly")}</p>
            ) : null}
            <KnowledgeFeedback
              session={session}
              state={state}
              admitted={admitted}
              onAdopt={onClose}
            />
          </div>
          <div className={styles.dialogFooter}>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("settings.knowledgeCancel")}
            </Button>
            <Button type="submit" disabled={frozen || !valid}>
              {t("settings.knowledgeSave")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function KnowledgeRemoveDialog({
  item,
  session,
  state,
  admitted,
  onClose,
  returnFocus,
}: Common & { item: KnowledgeItem }) {
  const t = useT(),
    description = useId();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={styles.removeDialog}
        aria-describedby={description}
        closeLabel={t("settings.knowledgeClose")}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus.current?.focus({ preventScroll: true });
        }}
      >
        <DialogTitle>{t("settings.knowledgeDeleteTitle")}</DialogTitle>
        <p className={styles.removeName}>{item.name}</p>
        <p id={description}>{t("settings.knowledgeDeleteHint")}</p>
        <KnowledgeFeedback
          session={session}
          state={state}
          admitted={admitted}
          onAdopt={onClose}
        />
        <div className={styles.recoveryActions}>
          <Button variant="outline" onClick={onClose}>
            {t("settings.knowledgeCancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={!admitted || !state.itemsReady || state.pending !== null}
            onClick={() =>
              void session.remove(item).then((ok) => {
                if (ok) onClose();
              })
            }
          >
            {t("settings.knowledgeDeleteConfirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
