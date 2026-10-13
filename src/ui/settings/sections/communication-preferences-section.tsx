"use client";

import { useState } from "react";

import { Switch } from "@/components/ui/switch";
import { useT } from "@/i18n/context";

import styles from "./settings-sections.module.css";

type CommunicationPreference =
  | "browser_notifications"
  | "sound_notifications"
  | "product_updates"
  | "brand_ads";

type CommunicationPreferences = Record<CommunicationPreference, boolean>;

const STORAGE_KEY = "kokoro.communication-preferences";

const DEFAULT_PREFERENCES: CommunicationPreferences = {
  browser_notifications: false,
  sound_notifications: false,
  product_updates: false,
  brand_ads: false,
};

function readPreferences(): CommunicationPreferences {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return DEFAULT_PREFERENCES;
    }
    const candidate = value as Partial<Record<CommunicationPreference, unknown>>;
    return {
      browser_notifications: candidate.browser_notifications === true,
      sound_notifications: candidate.sound_notifications === true,
      product_updates: candidate.product_updates === true,
      brand_ads: candidate.brand_ads === true,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function writePreferences(value: CommunicationPreferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Preference storage is optional; the current session remains interactive.
  }
}

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
    readPreferences,
  );

  const setPreference = (
    preference: CommunicationPreference,
    checked: boolean,
  ): void => {
    const next = { ...preferences, [preference]: checked };
    setPreferences(next);
    writePreferences(next);
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
          setPreference("browser_notifications", checked)
        }
      />
      <PreferenceRow
        id="sound_notifications"
        title={t("settings.soundNotifications")}
        hint={t("settings.soundNotificationsHint")}
        checked={preferences.sound_notifications}
        onCheckedChange={(checked) =>
          setPreference("sound_notifications", checked)
        }
      />
      <PreferenceRow
        id="product_updates"
        title={t("settings.productUpdates")}
        hint={t("settings.productUpdatesHint")}
        checked={preferences.product_updates}
        onCheckedChange={(checked) => setPreference("product_updates", checked)}
      />
      <PreferenceRow
        id="brand_ads"
        title={t("settings.brandAds")}
        hint={t("settings.brandAdsHint")}
        checked={preferences.brand_ads}
        onCheckedChange={(checked) => setPreference("brand_ads", checked)}
      />
    </section>
  );
}
