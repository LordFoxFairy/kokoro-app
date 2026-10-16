// This adapter owns only instances it created. Permission is requested by a Settings gesture.
export function browserNotificationsSupported(): boolean { return typeof Notification === "function" && typeof Notification.requestPermission === "function" }
export async function enableBrowserNotifications(): Promise<boolean> {
  if (!browserNotificationsSupported()) return false
  if (Notification.permission === "granted") return true
  if (Notification.permission !== "default") return false
  try { return await Notification.requestPermission() === "granted" } catch { return false }
}
export function createTaskBrowserNotifications() {
  const owned = new Set<Notification>()
  let disposed = false
  return {
    deliver(title: string, body: string): boolean {
      if (disposed || !browserNotificationsSupported() || Notification.permission !== "granted") return false
      try {
        const notification = new Notification(title, { body })
        owned.add(notification)
        notification.onclose = () => { owned.delete(notification) }
        return true
      } catch { return false }
    },
    dispose() {
      disposed = true
      for (const notification of owned) { try { notification.close() } catch { /* Already closed. */ } }
      owned.clear()
    },
  }
}
