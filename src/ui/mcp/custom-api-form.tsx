"use client";

import { type FormEvent, useState } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { HubClient } from "@/hub/client";
import { useT } from "@/i18n/context";

import styles from "./custom-api-form.module.css";

type EnvironmentDraft = { id: string; name: string; value: string };

/**
 * Custom API has an owner-backed write-only secret lifecycle.  This component
 * deliberately owns only that form; it does not share state or fields with
 * MCP URL/transport creation.
 */
export function CustomApiForm({
  client,
  onCancel,
  onDone,
}: {
  client: HubClient;
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

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
    if (!valid || !client.createCustomApi) return;
    setSubmitting(true);
    setError(false);
    try {
      await client.createCustomApi({
        name: name.trim(),
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        environment: configuredEnvironment.map((item) => ({
          name: item.name.trim(),
          value: item.value,
        })),
      });
      await onDone();
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
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
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{t("mcp.actionFailed")}</AlertDescription>
          </Alert>
        ) : null}
        <div className={styles.field}>
          <Label htmlFor="custom-api-name">{t("connectorCatalog.name")}</Label>
          <Input
            id="custom-api-name"
            value={name}
            maxLength={400}
            required
            placeholder={t("connectorCatalog.namePlaceholder")}
            onChange={(event) => setName(event.target.value)}
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
            maxLength={4000}
            placeholder={t("connectorCatalog.notesPlaceholder")}
            onChange={(event) => setInstructions(event.target.value)}
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
                  maxLength={128}
                  placeholder={t("connectorCatalog.secretNamePlaceholder")}
                  onChange={(event) =>
                    updateEnvironment(item.id, { name: event.target.value })
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
                  maxLength={4096}
                  placeholder={t("connectorCatalog.secretValuePlaceholder")}
                  onChange={(event) =>
                    updateEnvironment(item.id, { value: event.target.value })
                  }
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`${t("connectorCatalog.removeSecret")} ${index + 1}`}
                onClick={() =>
                  setEnvironment((items) =>
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
            onClick={addEnvironment}
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
          disabled={submitting}
          onClick={onCancel}
        >
          {t("mcp.cancel")}
        </Button>
        <Button
          type="submit"
          disabled={submitting || !valid || !client.createCustomApi}
        >
          {submitting ? <Spinner aria-hidden="true" /> : null}
          {t("mcp.save")}
        </Button>
      </footer>
    </form>
  );
}
