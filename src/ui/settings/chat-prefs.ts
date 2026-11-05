"use client"

// 浏览器本地对话偏好；不是服务端偏好或运行权限。
// 缺省模型 null 跟随空间，任务提交方式缺省排队。

import { z } from "zod"

const CHAT_PREFS_KEY = "kokoro.web.chat-prefs.v2"
const chatDeliverySchema = z.enum(["queue", "interrupt", "steer"])
type ChatDelivery = z.infer<typeof chatDeliverySchema>

const chatPrefsSchema = z
  .object({
    // raw业务label key（允许冒号，不拆分）；null/缺省=跟随空间缺省。
    model: z.string().nullable().optional(),
    taskDelivery: chatDeliverySchema.optional(),
  })
  .strict()

export function readChatModel(): string | null {
  try { return readStoredPrefs().model ?? null }
  catch { return null }
}

export function writeChatModel(value: string | null): boolean {
  return writeChatPrefs({ model: value })
}

export function readChatDelivery(): ChatDelivery {
  try { return readStoredPrefs().taskDelivery ?? "queue" }
  catch { return "queue" }
}

export function writeChatDelivery(value: ChatDelivery): boolean {
  return writeChatPrefs({ taskDelivery: value })
}

function readStoredPrefs(): z.infer<typeof chatPrefsSchema> {
  // Unavailable storage is not an empty record: a merge must not drop the
  // other preference just because its current value could not be read.
  const raw = window.localStorage.getItem(CHAT_PREFS_KEY)
  if (raw === null) return {}
  try {
    const parsed = chatPrefsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : {}
  } catch {
    return {}
  }
}

function writeChatPrefs(value: z.infer<typeof chatPrefsSchema>): boolean {
  try {
    const parsed = chatPrefsSchema.safeParse({ ...readStoredPrefs(), ...value })
    if (!parsed.success) return false
    window.localStorage.setItem(CHAT_PREFS_KEY, JSON.stringify(parsed.data))
    return true
  } catch {
    return false
  }
}
