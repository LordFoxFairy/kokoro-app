"use client"

// 对话偏好（WEB-FACE 面三）：缺省模型的本地 UI 偏好（localStorage）。null=跟随空间缺省
// （不发送 model 字段）。settings 就地保存；工作台新对话首帧由 useComposerSelectors 读此作选择器初值——
// 发首条时预填，会话级锁语义不变（开跑后 modeLocked 锁住）。非机密、不进服务端契约。

import { z } from "zod"

import { createPersistedStore } from "@/lib/persisted-store"

const chatPrefsSchema = z
  .object({
    // wire 选择子（"provider:name"）；null/缺省=跟随空间缺省。
    model: z.string().nullable().optional(),
  })
  .strict()

const store = createPersistedStore({
  key: "kokoro.web.chat-prefs",
  schema: chatPrefsSchema,
})

export function readChatModel(): string | null {
  return store.read()?.model ?? null
}

export function writeChatModel(value: string | null): boolean {
  const parsed = chatPrefsSchema.safeParse({ model: value })
  if (!parsed.success) return false
  try {
    window.localStorage.setItem("kokoro.web.chat-prefs", JSON.stringify(parsed.data))
    return true
  } catch {
    // The persisted store reparses only a successful changed raw value.
    return false
  }
}
