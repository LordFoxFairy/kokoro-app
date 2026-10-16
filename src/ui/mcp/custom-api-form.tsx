"use client";

import { type FormEvent, useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/context";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import type { CustomApiCreateFlow } from "./custom-api-create-flow";

import styles from "./custom-api-form.module.css";

type EnvironmentDraft = { id: string; name: string; value: string };

/**
 * Custom API has an owner-backed write-only secret lifecycle.  This component
 * deliberately owns only that form; it does not share state or fields with
 * MCP URL/transport creation.
 */
export function CustomApiForm({
  flow,
  boundary,
  onCancel,
  onDone,
}: {
  flow: CustomApiCreateFlow;
  boundary: ProjectReadBoundary;
  onCancel: () => void;
  onDone: () => Promise<void>;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  // Manus starts an API profile with one explicit secret pair. Keeping that
  // row visible makes the required owner input discoverable and avoids an
  // empty framed area that looked like a failed/unfinished form.
  const [environment, setEnvironment] = useState<EnvironmentDraft[]>(() => [
    { id: crypto.randomUUID(), name: "", value: "" },
  ]);
  const subscribe = useCallback((listener: () => void) => flow.subscribe(() => {
    // Clear the actual draft at the ACK transition, including a late ACK after
    // recheck. Merely masking the DOM would reveal it again when finish resets.
    if (flow.getSnapshot().kind === "completed")
      setEnvironment(items => items.map(item => ({ ...item, value: "" })));
    listener();
  }), [flow]);
  const state = useSyncExternalStore(subscribe, flow.getSnapshot, flow.getSnapshot);
  const [completion, setCompletion] = useState<"idle" | "closing" | "retry">("idle");
  const scope = useMemo(() => ({ flow, boundary }), [flow, boundary]);
  const committed = useRef<typeof scope | null>(null);
  useLayoutEffect(() => {
    committed.current = scope;
    return () => { if (committed.current === scope) committed.current = null; };
  }, [scope]);
  const admitted = boundary.admitted && flow.matches(boundary);
  const submitting = state.kind === "running";
  const locked = !admitted || submitting || state.kind === "unknown" || state.kind === "completed" || completion !== "idle";
  const editable = () => !locked && committed.current === scope;
  const done = async () => {
    if (committed.current !== scope || !admitted || completion === "closing") return;
    if (completion === "idle" && flow.getSnapshot().kind !== "completed") return;
    setCompletion("closing");
    if (completion === "idle" && !flow.finish(boundary)) { setCompletion("idle"); return; }
    try { await onDone(); }
    // Closing state belongs to this mounted form/flow, not a read generation.
    // A recheck must not leave it stuck, while a new form has a different ref.
    catch { if (committed.current?.flow === flow) setCompletion("retry"); }
  };

  const updateEnvironment = (id: string, patch: Partial<EnvironmentDraft>) =>
    setEnvironment((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  const addEnvironment = () =>
    setEnvironment((items) => [
      ...items,
      { id: crypto.randomUUID(), name: "", value: "" },
    ]);
  const configuredEnvironment = environment.filter(
    (item) => item.name.trim() || item.value,
  );
  const valid =
    name.trim().length > 0 &&
    configuredEnvironment.every((item) => item.name.trim() && item.value) &&
    new Set(configuredEnvironment.map((item) => item.name.trim())).size ===
      configuredEnvironment.length;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!admitted || committed.current !== scope || submitting || completion !== "idle") return;
    const confirmed = state.kind === "unknown"
      ? await flow.retry(boundary)
      : editable() && valid && await flow.submit({
        name: name.trim(),
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        environment: configuredEnvironment.map((item) => ({
          name: item.name.trim(),
          value: item.value,
        })),
      }, boundary);
    if (confirmed) await done();
  };

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <header className={styles.header}>
        <div>
          <h2>{t("connectorCatalog.customApiCreateTitle")}</h2>
          <p>{t("connectorCatalog.customApiCreateDescription")}</p>
        </div>
      </header>
      <div className={styles.body}>
        {!admitted ? <p role="status" className="sr-only">{t("mcp.apiCreateSession")}</p> : null}
        {state.kind === "unknown" || state.kind === "rejected" ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{state.kind === "unknown" && state.name ? <><strong>{state.name}</strong>{" — "}</> : null}{t(state.kind === "unknown" ? "mcp.apiCreateUnknown" : "mcp.actionFailed")}</AlertDescription>
          </Alert>
        ) : null}
        {state.kind === "completed" || completion !== "idle" ? <p role="status">{t("mcp.apiCreateConfirmed")}</p> : null}
        {completion === "retry" ? <p role="alert">{t("mcp.actionFailed")}</p> : null}
        <div className={styles.field}>
          <Label htmlFor="custom-api-name">{t("connectorCatalog.name")}</Label>
          <Input
            id="custom-api-name"
            value={name}
            maxLength={400}
            required
            readOnly={locked}
            placeholder={t("connectorCatalog.namePlaceholder")}
            onChange={(event) => { if (editable()) setName(event.target.value); }}
          />
        </div>
        <div className={styles.iconField} aria-label="图标">
          <Label>图标</Label>
          <div className={styles.iconUploadRow}>
            <span className={styles.iconPreview} aria-hidden="true">
              <ImagePlus />
            </span>
            <div className={styles.iconUploadCopy}>
              <Button type="button" variant="outline" size="sm" disabled>
                上传
              </Button>
              <small>PNG 或 JPG，最大 1 MB。推荐尺寸 256×256 像素。</small>
            </div>
          </div>
        </div>
        <div className={styles.field}>
          <Label htmlFor="custom-api-instructions">
            {t("connectorCatalog.notes")} {t("connectorCatalog.optional")}
          </Label>
          <Textarea
            id="custom-api-instructions"
            value={instructions}
            readOnly={locked}
            maxLength={4000}
            placeholder={t("connectorCatalog.notesPlaceholder")}
            onChange={(event) => { if (editable()) setInstructions(event.target.value); }}
          />
        </div>
        <section
          className={styles.environment}
          aria-labelledby="custom-api-secrets-title"
        >
          <Label
            id="custom-api-secrets-title"
            className={styles.environmentTitle}
          >
            {t("connectorCatalog.secrets")}{" "}
            {t("connectorCatalog.environmentVariables")}
          </Label>
          <div className={styles.environmentContent}>
            {environment.map((item, index) => (
              <div className={styles.environmentRow} key={item.id}>
              <div>
                <Label htmlFor={`custom-api-secret-name-${item.id}`}>
                  {t("connectorCatalog.secretName")}
                </Label>
                <Input
                  id={`custom-api-secret-name-${item.id}`}
                  value={item.name}
                  readOnly={locked}
                  maxLength={128}
                  placeholder={t("connectorCatalog.secretNamePlaceholder")}
                  onChange={(event) =>
                    editable() && updateEnvironment(item.id, { name: event.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor={`custom-api-secret-value-${item.id}`}>
                  {t("connectorCatalog.secretValue")}
                </Label>
                <Textarea
                  id={`custom-api-secret-value-${item.id}`}
                  value={item.value}
                  readOnly={locked}
                  maxLength={4096}
                  placeholder={t("connectorCatalog.secretValuePlaceholder")}
                  onChange={(event) =>
                    editable() && updateEnvironment(item.id, { value: event.target.value })
                  }
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={locked}
                aria-label={`${t("connectorCatalog.removeSecret")} ${index + 1}`}
                onClick={() =>
                  editable() && setEnvironment((items) =>
                    items.filter(({ id }) => id !== item.id),
                  )
                }
              >
                <Trash2 aria-hidden="true" />
              </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            className={styles.addSecret}
            disabled={locked}
            onClick={() => { if (editable()) addEnvironment(); }}
          >
            <Plus aria-hidden="true" />
            {t("connectorCatalog.addSecret")}
          </Button>
        </section>
      </div>
      <footer className={styles.footer}>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
        >
          {t("mcp.cancel")}
        </Button>
        {state.kind === "completed" || completion !== "idle" ? <Button type="button" disabled={!admitted || completion === "closing"} onClick={() => void done()}>{t("mcp.apiCreateDone")}</Button> : <Button
          type="submit"
          disabled={!admitted || submitting || !flow.available || (state.kind !== "unknown" && !valid)}
        >
          {submitting ? <Spinner aria-hidden="true" /> : null}
          {t(state.kind === "unknown" ? "mcp.retryOriginal" : "mcp.save")}
        </Button>}
      </footer>
    </form>
  );
}
