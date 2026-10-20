"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { ModelCandidate } from "@/contract/http";
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
}: {
  preview?: boolean;
}) {
  const t = useT();
  const [models, setModels] = useState<readonly ModelCandidate[]>([]);
  const [model, setModel] = useState<string>(
    () => readChatModel() ?? FOLLOW_PROFILE,
  );
  // 就地保存反馈：改动后闪一枚「已保存」徽标，约 1.6s 后自动消（setState 在 timeout 内，非 effect 体内直接调）。
  const [saved, setSaved] = useState(false);

  const [saveFailed, setSaveFailed] = useState(false);
  const [catalogState, setCatalogState] = useState<{ preview: boolean; phase: "loading" | "error" | "ready" }>({ preview, phase: "loading" });
  if (catalogState.preview !== preview) setCatalogState({ preview, phase: "loading" });
  const catalog = catalogState.preview === preview ? catalogState.phase : "loading";
  const setCatalog = (phase: "loading" | "error" | "ready") => setCatalogState({ preview, phase });
  const attempt = useRef<{ epoch: number; clear: () => void } | null>(null);
  const epoch = useRef(0);

  const loadModels = (): void => {
    attempt.current?.clear();
    const currentEpoch = ++epoch.current;
    const deadline = performance.now() + 10_000;
    const active = () => attempt.current?.epoch === currentEpoch;
    const fail = () => {
      if (!active()) return;
      attempt.current?.clear();
      attempt.current = null;
      setCatalog("error");
    };
    const timer = setTimeout(fail, 10_000);
    attempt.current = { epoch: currentEpoch, clear: () => clearTimeout(timer) };
    try {
      void browserListClient({ preview }).listModels().then((list) => {
        if (!active()) return;
        if (performance.now() >= deadline) { fail(); return; }
        attempt.current?.clear();
        attempt.current = null;
        setModels(list.models);
        setCatalog("ready");
      }).catch(fail);
    } catch { queueMicrotask(fail); }
  };

  useLayoutEffect(() => {
    loadModels();
    return () => {
      attempt.current?.clear();
      attempt.current = null;
    };
    // A preview commit owns a fresh attempt; explicit retry uses the same caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

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
          value={model === FOLLOW_PROFILE ? FOLLOW_PROFILE_VALUE : model}
          onValueChange={(value) =>
            onModelChange(
              value === FOLLOW_PROFILE_VALUE ? FOLLOW_PROFILE : value,
            )
          }
        >
          <SelectTrigger
            id="settings-default-model"
            className={styles.select}
            data-testid="settings-default-model"
            disabled={catalog === "error"}
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
export function ChatPrefsCard({ preview = false }: { preview?: boolean }) {
  return (
    <Card
      className={styles.card}
      data-settings-card
      data-testid="settings-chat"
    >
      <CardContent className={styles.cardContent}>
        <ChatPreferencesSection preview={preview} />
      </CardContent>
    </Card>
  );
}
