"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { ModelCandidate } from "@/contract/http";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { useT } from "@/i18n/context";
import { browserListClient } from "@/ui/shell/page-clients";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { modelLabel, modelSelector } from "@/ui/composer/composer-model";

import { readChatModel, writeChatModel } from "../chat-prefs";
import styles from "./settings-sections.module.css";

const FOLLOW_PROFILE = "";
const FOLLOW_PROFILE_VALUE = "__follow_profile__";


// —— 卡三：对话偏好 —— 缺省模型（/models）；就地存 localStorage，
// 工作台新对话首帧预填（会话级锁语义不变）。
export function ChatPreferencesSection({
  preview = false,
  readBoundary,
}: {
  preview?: boolean;
  readBoundary?: ProjectReadBoundary;
}) {
  const t = useT();
  const canRead = preview || Boolean(readBoundary?.admitted && readBoundary.subject !== null);
  const scope = JSON.stringify([preview, readBoundary?.admitted ?? false, readBoundary?.subject ?? null, readBoundary?.generation ?? 0]);
  const token = useMemo(() => ({ scope }), [scope]);
  const live = useRef<typeof token | null>(null);
  const [model, setModel] = useState<string>(
    () => readChatModel() ?? FOLLOW_PROFILE,
  );
  // 就地保存反馈：改动后闪一枚「已保存」徽标，约 1.6s 后自动消（setState 在 timeout 内，非 effect 体内直接调）。
  const [saved, setSaved] = useState(false);

  const [saveFailed, setSaveFailed] = useState(false);
  const [catalogState, setCatalogState] = useState<{ scope: string; phase: "loading" | "error" | "ready" | "blocked"; models: readonly ModelCandidate[] }>({ scope, phase: canRead ? "loading" : "blocked", models: [] });
  if (catalogState.scope !== scope) setCatalogState({ scope, phase: canRead ? "loading" : "blocked", models: [] });
  const catalog = !canRead ? "blocked" : catalogState.scope === scope ? catalogState.phase : "loading";
  const models = catalogState.scope === scope ? catalogState.models : [];
  const setCatalog = (phase: "loading" | "error" | "ready") => setCatalogState(current => ({ scope, phase, models: current.scope === scope ? current.models : [] }));
  const attempt = useRef<{ epoch: number; clear: () => void } | null>(null);
  const epoch = useRef(0);

  const loadModels = (): void => {
    if (!canRead || live.current !== token) return;
    attempt.current?.clear();
    const currentEpoch = ++epoch.current;
    const deadline = performance.now() + 10_000;
    const active = () => attempt.current?.epoch === currentEpoch && live.current === token;
    const controller = new AbortController();
    const fail = () => {
      if (!active()) return;
      attempt.current?.clear();
      attempt.current = null;
      setCatalog("error");
    };
    const timer = setTimeout(fail, 10_000);
    attempt.current = { epoch: currentEpoch, clear: () => { clearTimeout(timer); controller.abort(); } };
    try {
      void browserListClient({ preview }).listModels({ signal: controller.signal }).then((list) => {
        if (!active()) return;
        if (performance.now() >= deadline) { fail(); return; }
        attempt.current?.clear();
        attempt.current = null;
        setCatalogState({ scope, phase: "ready", models: list.models });
      }).catch(fail);
    } catch { queueMicrotask(fail); }
  };

  useLayoutEffect(() => {
    live.current = token;
    loadModels();
    return () => {
      if (live.current === token) live.current = null;
      attempt.current?.clear();
      attempt.current = null;
    };
    // Each admission owns its catalog, including preview. Explicit retry keeps
    // this lifetime; retired requests cannot repopulate it or save an option.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canRead]);

  useEffect(() => {
    if (!saved) {
      return;
    }
    const id = setTimeout(() => setSaved(false), 1600);
    return () => clearTimeout(id);
  }, [saved]);

  const onModelChange = (value: string): void => {
    setModel(value);
    const written = writeChatModel(value === FOLLOW_PROFILE ? null : value);
    setSaved(written);
    setSaveFailed(!written);
  };

  return (
    <section
      className={styles.chatPreferencesSection}
      aria-labelledby="settings-chat-preferences-heading"
    >
      <div className={styles.chatPreferencesHead}>
        <h3 id="settings-chat-preferences-heading">
          {t("settings.chatTitle")}
        </h3>
        {saved ? (
          <div className={styles.cardHead}>
            <span
              className={styles.savedBadge}
              role="status"
              data-testid="settings-saved"
            >
              {t("settings.saved")}
            </span>
          </div>
        ) : null}
      </div>
      {catalog === "loading" ? <p role="status">{t("settings.modelCatalogLoading")}</p> : null}
      {catalog === "error" ? (
        <div role="alert">
          <p>{t("settings.modelCatalogFailed")}</p>
          <Button variant="outline" size="sm" onClick={() => { setCatalog("loading"); loadModels(); }}>{t("settings.modelCatalogRetry")}</Button>
        </div>
      ) : null}
      {catalog === "ready" && models.length === 0 ? <p>{t("settings.modelCatalogEmpty")}</p> : null}
      <Field orientation="horizontal" className={styles.chatPreferenceRow}>
        <FieldLabel
          className={styles.rowLabel}
          htmlFor="settings-default-model"
        >
          {t("settings.defaultModel")}
        </FieldLabel>
        <Select
          key={scope}
          value={model === FOLLOW_PROFILE ? FOLLOW_PROFILE_VALUE : model}
          onValueChange={(value) => {
            if (!canRead || live.current !== token || catalog !== "ready") return;
            if (value !== FOLLOW_PROFILE_VALUE && !models.some(candidate => modelSelector(candidate) === value)) return;
            onModelChange(value === FOLLOW_PROFILE_VALUE ? FOLLOW_PROFILE : value);
          }}
        >
          <SelectTrigger
            id="settings-default-model"
            className={styles.select}
            data-testid="settings-default-model"
            disabled={catalog !== "ready"}
          >
            <SelectValue placeholder={t("settings.followProfile")}>
              {catalog !== "ready" ? (model === FOLLOW_PROFILE ? t("settings.followProfile") : model) : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {catalog === "loading" ? <p role="status">{t("settings.modelCatalogLoading")}</p> : null}
              {catalog === "ready" ? <SelectItem value={FOLLOW_PROFILE_VALUE}>
                {t("settings.followProfile")}
              </SelectItem> : null}
              {(catalog === "ready" ? models : []).map((candidate) => (
                <SelectItem
                  key={modelSelector(candidate)}
                  value={modelSelector(candidate)}
                >
                  {modelLabel(candidate)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      {saveFailed ? (
        <div role="alert">
          <p>{t("settings.modelPreferenceNotSaved")}</p>
          <Button variant="outline" size="sm" onClick={() => onModelChange(model)}>{t("settings.retryPreferenceSave")}</Button>
        </div>
      ) : null}
      <p className={styles.chatPreferenceHint}>{t("settings.chatHint")}</p>
    </section>
  );
}

/** Kept as a deep-linkable panel for existing /settings/chat URLs. The left rail
 * follows Manus; this model preference is not a General control. */
export function ChatPrefsCard({ preview = false, readBoundary }: { preview?: boolean; readBoundary?: ProjectReadBoundary }) {
  return (
    <Card
      className={styles.card}
      data-settings-card
      data-testid="settings-chat"
    >
      <CardContent className={styles.cardContent}>
        <ChatPreferencesSection preview={preview} {...(readBoundary === undefined ? {} : { readBoundary })} />
      </CardContent>
    </Card>
  );
}
