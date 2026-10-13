export type CommunicationPreference = "browser_notifications" | "sound_notifications" | "product_updates" | "brand_ads"
export type CommunicationPreferences = Readonly<Record<CommunicationPreference, boolean>>
export const DEFAULT_COMMUNICATION_PREFERENCES: CommunicationPreferences = Object.freeze({ browser_notifications: false, sound_notifications: false, product_updates: false, brand_ads: false })
const snapshots = new Map<string, CommunicationPreferences>()
const listeners = new Map<string, Set<() => void>>()
function storageKey(subject: string): string { return `kokoro.communication-preferences.subject.${encodeURIComponent(subject)}` }
export function readCommunicationPreferences(subject?: string | null): CommunicationPreferences {
  if (!subject || typeof window === "undefined") return DEFAULT_COMMUNICATION_PREFERENCES
  let next = DEFAULT_COMMUNICATION_PREFERENCES
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey(subject)) ?? "null")
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const value = parsed as Partial<CommunicationPreferences>
      next = { browser_notifications: value.browser_notifications === true, sound_notifications: value.sound_notifications === true, product_updates: false, brand_ads: false }
    }
  } catch { /* Unavailable/corrupt storage grants no preference. */ }
  const cached = snapshots.get(subject)
  if (cached && cached.browser_notifications === next.browser_notifications && cached.sound_notifications === next.sound_notifications) return cached
  snapshots.set(subject, next)
  return next
}
export function serverCommunicationPreferences(): CommunicationPreferences { return DEFAULT_COMMUNICATION_PREFERENCES }
export function subscribeCommunicationPreferences(subject: string | null, listener: () => void): () => void {
  if (!subject || typeof window === "undefined") return () => {}
  const subscribers = listeners.get(subject) ?? new Set<() => void>()
  subscribers.add(listener); listeners.set(subject, subscribers)
  const onStorage = (event: StorageEvent) => { if (event.storageArea === window.localStorage && (event.key === storageKey(subject) || event.key === null)) listener() }
  window.addEventListener("storage", onStorage)
  return () => { subscribers.delete(listener); if (!subscribers.size) listeners.delete(subject); window.removeEventListener("storage", onStorage) }
}
export function writeCommunicationPreferences(value: CommunicationPreferences, subject?: string | null): boolean {
  if (!subject || typeof window === "undefined") return false
  const next = { ...value, product_updates: false, brand_ads: false }
  try { window.localStorage.setItem(storageKey(subject), JSON.stringify(next)) } catch { return false }
  for (const listener of listeners.get(subject) ?? []) { try { listener() } catch { /* Independent consumers. */ } }
  return true
}
