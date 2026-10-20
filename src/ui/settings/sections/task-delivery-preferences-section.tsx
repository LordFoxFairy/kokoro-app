"use client";

import { useId } from "react";
import { useT } from "@/i18n/context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import styles from "./settings-sections.module.css";

/**
 * The current durable chat contract admits a message during an active run as a
 * queued successor.  The other two Manus behaviors require one atomic BFF
 * operation that persists the message while steering or cancelling the exact
 * run.  Keep the setting visibly honest until that owner contract exists.
 */
export function TaskDeliveryPreferencesSection() {
  const t = useT();
  const reasonId = useId();

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
        <Select value="queue">
          <SelectTrigger
            id="settings-task-delivery"
            className={styles.select}
            data-testid="settings-task-delivery"
            aria-label={t("settings.taskDelivery")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={styles.deliveryOptions}>
            <p id={reasonId} className={styles.chatPreferenceHint}>{t("settingsServices.steeringUnavailable")}</p>
            <SelectItem value="send" disabled aria-describedby={reasonId}>{t("settingsServices.sendWithoutInterrupt")}</SelectItem>
            <SelectItem value="queue">{t("settings.taskDeliveryQueue")}</SelectItem>
            <SelectItem value="interrupt" disabled aria-describedby={reasonId}>{t("settingsServices.interruptAndSend")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}
