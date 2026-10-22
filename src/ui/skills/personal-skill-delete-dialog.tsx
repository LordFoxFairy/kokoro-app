"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { HubClientError } from "@/hub/client";
import {
  deletePersonalSkillSeriesRequestSchema,
  type DeletePersonalSkillSeriesRequest,
  type ManagedPersonalSkill,
} from "@/hub/schemas";
import type { SkillPublishClient } from "@/hub/skill-publish-client";
import { useT } from "@/i18n/context";

/** One confirmed series deletion. Closing or re-admission never replaces its body/key. */
export function PersonalSkillDeleteDialog({
  skill,
  client,
  open,
  admitted,
  generation,
  onOpenChange,
  onIntentStarted,
  onConfirmed,
  returnFocusRef,
}: {
  skill: ManagedPersonalSkill;
  client: Pick<SkillPublishClient, "listHistory" | "deleteSeries">;
  open: boolean;
  admitted: boolean;
  generation: number;
  onOpenChange: (open: boolean, retainIntent?: boolean) => void;
  onIntentStarted: () => void;
  onConfirmed: () => void;
  returnFocusRef: RefObject<HTMLInputElement | null>;
}) {
  const t = useT();
  const [snapshot, setSnapshot] = useState<{
    generation: number;
    body?: DeletePersonalSkillSeriesRequest;
    error?: boolean;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [intent, setIntent] = useState<{
    body: DeletePersonalSkillSeriesRequest;
    key: string;
  } | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "unknown" | "rejected">(
    "idle",
  );
  const flight = useRef<AbortController | null>(null),
    uncertain = useRef(false);
  const [lastFlight, setLastFlight] = useState<AbortController | null>(null);
  const visible =
    state === "busy" && lastFlight?.signal.aborted ? "unknown" : state;
  useLayoutEffect(() => {
    if (!open || !admitted || intent) return;
    const controller = new AbortController();
    void client
      .listHistory(skill.skill_id, undefined, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        if (page.series_id !== skill.series_id)
          throw new Error("Deletion series mismatch");
        const publication =
          page.publication === null
            ? null
            : {
                current_version_id: page.publication.current_version_id,
                state_version: page.publication.state_version,
              };
        setSnapshot({
          generation,
          body: deletePersonalSkillSeriesRequestSchema.parse({
            expected_state_version: skill.product.state_version,
            expected_publication: publication,
          }),
        });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setSnapshot({ generation, error: true });
      });
    return () => controller.abort();
  }, [open, admitted, generation, skill, client, intent, attempt]);
  useLayoutEffect(
    () => () => {
      if (flight.current) uncertain.current = true;
      flight.current?.abort();
      flight.current = null;
    },
    [admitted, open, generation],
  );
  const current = snapshot?.generation === generation ? snapshot : null;
  const close = () => {
    if (flight.current) {
      uncertain.current = true;
      flight.current.abort();
      flight.current = null;
      setState("unknown");
    }
    onOpenChange(false, intent !== null && visible !== "rejected");
  };
  const submit = async () => {
    if (!admitted || flight.current || visible === "rejected") return;
    let command = intent;
    if (!command) {
      if (!current?.body) return;
      const body = deletePersonalSkillSeriesRequestSchema.parse(current.body);
      if (body.expected_publication) Object.freeze(body.expected_publication);
      command = {
        body: Object.freeze(body),
        key: `delete_${crypto.randomUUID()}`,
      };
      setIntent(command);
      onIntentStarted();
    }
    const controller = new AbortController();
    flight.current = controller;
    setLastFlight(controller);
    setState("busy");
    try {
      const receipt = await client.deleteSeries(
        skill.skill_id,
        command.body,
        command.key,
        controller.signal,
      );
      if (flight.current !== controller || controller.signal.aborted) return;
      if (receipt.series_id !== skill.series_id)
        throw new Error("Deletion receipt series mismatch");
      uncertain.current = false;
      onConfirmed();
    } catch (error) {
      if (flight.current !== controller || controller.signal.aborted) return;
      const rejected =
        error instanceof HubClientError &&
        error.reason === "http" &&
        ([400, 401, 403, 404, 412, 413].includes(error.status ?? 0) ||
          (error.status === 409 &&
            error.code === "skill_idempotency_conflict"));
      uncertain.current = uncertain.current || !rejected;
      setState(uncertain.current ? "unknown" : "rejected");
    } finally {
      if (flight.current === controller) flight.current = null;
    }
  };
  return (
    <Dialog
      open={open && admitted}
      onOpenChange={(value) => {
        if (!value) close();
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (admitted) returnFocusRef.current?.focus();
        }}
      >
        <DialogTitle>{t("skills.delete.title")}</DialogTitle>
        <DialogDescription>{t("skills.delete.warning")}</DialogDescription>
        <p className="break-words text-sm font-medium">{skill.name}</p>
        {!intent && !current ? (
          <p role="status">{t("skills.loading")}</p>
        ) : null}
        {!intent && current?.error ? (
          <p role="alert">
            {t("skills.history.failed")}
            <Button
              variant="outline"
              onClick={() => {
                setSnapshot(null);
                setAttempt((v) => v + 1);
              }}
            >
              {t("skills.retry")}
            </Button>
          </p>
        ) : null}
        {visible !== "idle" ? (
          <p role={visible === "busy" ? "status" : "alert"}>
            {t(
              visible === "busy"
                ? "skills.loading"
                : visible === "unknown"
                  ? "skills.lifecycle.unknown"
                  : "skills.lifecycle.rejected",
            )}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close}>
            {t("skills.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={
              !admitted ||
              visible === "busy" ||
              visible === "rejected" ||
              (!intent && !current?.body)
            }
            onClick={() => void submit()}
          >
            {t(visible === "unknown" ? "skills.retry" : "skills.delete.action")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
