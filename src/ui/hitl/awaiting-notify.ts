import { readCommunicationPreferences } from "@/ui/notifications/communication-preferences"

// 待批系统通知（HITL-NOTIFY，可选增强）：只有用户在设置中开启并已授予
// 浏览器权限时才弹出；授权请求只可由设置中的明确开关发起。
export function notifyAwaiting(title: string, body: string): void {
  if (
    typeof window === "undefined"
    || typeof Notification === "undefined"
    || !readCommunicationPreferences().browser_notifications
    || Notification.permission !== "granted"
  ) {
    return
  }
  try {
    new Notification(title, { body })
  } catch {
    // 某些环境（无 HTTPS / 被 iframe 策略拦截）会抛：静默吞掉。
  }
}
