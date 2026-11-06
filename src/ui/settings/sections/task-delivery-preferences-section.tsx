"use client";

import { useId, useState } from "react";
import { useT } from "@/i18n/context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { readChatDelivery, writeChatDelivery } from "../chat-prefs";
import styles from "./settings-sections.module.css";

export function TaskDeliveryPreferencesSection({ preview }: { preview: boolean }) {
  const t = useT();
  const previewReasonId = useId();
  const [delivery, setDelivery] = useState(() => preview ? "queue" : readChatDelivery());
  const [saveFailed, setSaveFailed] = useState(false);

  return (
    <section
      className={styles.chatPreferencesSection}
      aria-labelledby="settings-task-delivery-heading"
    >
      <div className={styles.chatPreferencesHead}>
        <h3 id="settings-task-delivery-heading">{t("settings.chatTitle")}</h3>
      </div>
      <div className={styles.chatPreferenceRow}>
        <div className={styles.preferenceCopy}>
          <span className={styles.rowLabel}>{t("settings.taskDelivery")}</span>
          <p className={styles.chatPreferenceHint}>{t("settings.taskDeliveryHint")}</p>
        </div>
        <Select value={delivery} onValueChange={(value) => {
          if (preview || (value !== "queue" && value !== "interrupt" && value !== "steer")) return;
          const saved = writeChatDelivery(value);
          if (saved) setDelivery(value);
          setSaveFailed(!saved);
        }}>
          <SelectTrigger
            id="settings-task-delivery"
            className={styles.select}
            data-testid="settings-task-delivery"
            aria-label={t("settings.taskDelivery")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={styles.deliveryOptions}>
            {preview ? <p id={previewReasonId} className={styles.chatPreferenceHint}>{t("settings.taskDeliveryPreview")}</p> : null}
            <SelectItem value="steer" disabled={preview} aria-describedby={preview ? previewReasonId : undefined}>{t("settingsServices.sendWithoutInterrupt")}</SelectItem>
            <SelectItem value="queue">{t("settings.taskDeliveryQueue")}</SelectItem>
            <SelectItem value="interrupt" disabled={preview} aria-describedby={preview ? previewReasonId : undefined}>{t("settingsServices.interruptAndSend")}</SelectItem>
          </SelectContent>
        </Select>
        {saveFailed ? <p role="alert">{t("settings.taskDeliveryNotSaved")}</p> : null}
      </div>
    </section>
  );
}
