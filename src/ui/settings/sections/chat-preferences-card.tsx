"use client";

import { useEffect, useState } from "react";

import type { ModelCandidate } from "@/contract/http";
import { useT } from "@/i18n/context";
import { browserListClient } from "@/ui/shell/page-clients";
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

import { readChatModel, writeChatModel } from "../chat-prefs";
import styles from "./settings-sections.module.css";

const FOLLOW_PROFILE = "";
const FOLLOW_PROFILE_VALUE = "__follow_profile__";

function modelSelector(model: ModelCandidate): string {
  return `${model.provider}:${model.name}`;
}

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

  useEffect(() => {
    let live = true;
    void browserListClient({ preview })
      .listModels()
      .then((list) => live && setModels(list.models))
      .catch(() => live && setModels([]));
    return () => {
      live = false;
    };
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
    writeChatModel(value === FOLLOW_PROFILE ? null : value);
    setSaved(true);
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
          >
            <SelectValue placeholder={t("settings.followProfile")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={FOLLOW_PROFILE_VALUE}>
                {t("settings.followProfile")}
              </SelectItem>
              {models.map((candidate) => (
                <SelectItem
                  key={modelSelector(candidate)}
                  value={modelSelector(candidate)}
                >
                  {candidate.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <p className={styles.chatPreferenceHint}>{t("settings.chatHint")}</p>
    </section>
  );
}

/** Kept as a deep-linkable panel for existing /settings/chat URLs. The left rail
 * follows Manus and surfaces this real preference within General instead. */
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
