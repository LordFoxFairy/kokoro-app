"use client";

import { useState } from "react";

import { Switch } from "@/components/ui/switch";
import { useT } from "@/i18n/context";

import styles from "./settings-sections.module.css";

import {
  enableBrowserNotifications,
  readCommunicationPreferences,
  type CommunicationPreference,
  type CommunicationPreferences,
  writeCommunicationPreferences,
} from "@/ui/notifications/communication-preferences";

type PreferenceRowProps = {
  id: CommunicationPreference;
  title: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

function PreferenceRow({
  id,
  title,
  hint,
  checked,
  onCheckedChange,
}: PreferenceRowProps) {
  return (
    <div className={styles.notificationRow}>
      <div>
        <strong>{title}</strong>
        <span>{hint}</span>
      </div>
      <Switch
        id={`settings-${id}`}
        aria-label={title}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

/** Browser-local communication preferences are intentionally separate from
 * account and billing data: the Web owns notification delivery permissions
 * and must not invent an unavailable remote profile contract. */
export function CommunicationPreferencesSection() {
  const t = useT();
  const [preferences, setPreferences] = useState<CommunicationPreferences>(
    readCommunicationPreferences,
  );

  const setPreference = async (
    preference: CommunicationPreference,
    checked: boolean,
  ): Promise<void> => {
    const enabled = preference === "browser_notifications" && checked
      ? await enableBrowserNotifications()
      : checked;
    const next = { ...preferences, [preference]: enabled };
    setPreferences(next);
    writeCommunicationPreferences(next);
  };

  return (
    <section
      className={styles.notificationSection}
      aria-labelledby="settings-notifications-heading"
    >
      <h3 id="settings-notifications-heading">
        {t("settings.notificationsGroup")}
      </h3>
      <PreferenceRow
        id="browser_notifications"
        title={t("settings.browserNotifications")}
        hint={t("settings.browserNotificationsHint")}
        checked={preferences.browser_notifications}
        onCheckedChange={(checked) =>
          void setPreference("browser_notifications", checked)
        }
      />
      <PreferenceRow
        id="sound_notifications"
        title={t("settings.soundNotifications")}
        hint={t("settings.soundNotificationsHint")}
        checked={preferences.sound_notifications}
        onCheckedChange={(checked) =>
          void setPreference("sound_notifications", checked)
        }
      />
      <PreferenceRow
        id="product_updates"
        title={t("settings.productUpdates")}
        hint={t("settings.productUpdatesHint")}
        checked={preferences.product_updates}
        onCheckedChange={(checked) => void setPreference("product_updates", checked)}
      />
      <PreferenceRow
        id="brand_ads"
        title={t("settings.brandAds")}
        hint={t("settings.brandAdsHint")}
        checked={preferences.brand_ads}
        onCheckedChange={(checked) => void setPreference("brand_ads", checked)}
      />
    </section>
  );
}
