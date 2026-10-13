export type CommunicationPreference =
  | "browser_notifications"
  | "sound_notifications"
  | "product_updates"
  | "brand_ads";

export type CommunicationPreferences = Record<CommunicationPreference, boolean>;

const STORAGE_KEY = "kokoro.communication-preferences";

export const DEFAULT_COMMUNICATION_PREFERENCES: CommunicationPreferences = {
  browser_notifications: false,
  sound_notifications: false,
  product_updates: false,
  brand_ads: false,
};

export function readCommunicationPreferences(): CommunicationPreferences {
  if (typeof window === "undefined") return DEFAULT_COMMUNICATION_PREFERENCES;
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return DEFAULT_COMMUNICATION_PREFERENCES;
    }
    const candidate = value as Partial<Record<CommunicationPreference, unknown>>;
    return {
      browser_notifications: candidate.browser_notifications === true,
      sound_notifications: candidate.sound_notifications === true,
      product_updates: candidate.product_updates === true,
      brand_ads: candidate.brand_ads === true,
    };
  } catch {
    return DEFAULT_COMMUNICATION_PREFERENCES;
  }
}

export function writeCommunicationPreferences(value: CommunicationPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Preference storage is optional; the current view remains interactive.
  }
}

/** Requests the browser capability only from the explicit Settings control. */
export async function enableBrowserNotifications(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission !== "default") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}
