"use client"

// Composer 模型选择器 controller（MODEL-UX）：挂载从 session /models 取候选，
// 选中即注入引擎——
// 下一次开跑随 messageCreate 上 wire。失败/空候选=空列表（选择器不渲染）；null 选择=用 profile 缺省。

import { useEffect, useState } from "react"

import type { ModelCandidate } from "@/contract/http"
import type { SessionEngine } from "@/engine/machine"
import { readChatModel } from "@/ui/settings/chat-prefs"

import { browserListClient } from "./page-clients"

export type ComposerSelectors = {
  models: readonly ModelCandidate[]
  selectedModel: string | null
  setSelectedModel: (value: string | null) => void
}

export function useComposerSelectors(engine: SessionEngine | null, options: { preview?: boolean } = {}): ComposerSelectors {
  const preview = options.preview ?? false
  const [models, setModels] = useState<readonly ModelCandidate[]>([])
  // 选中模型 稳定业务label key：null=用 profile 缺省，不上 wire。初值取 settings 缺省偏好
  // （WEB-FACE 面三）——新对话首帧预填，开跑后 modeLocked 锁定，会话级锁语义不变。
  const [selectedModel, setSelectedModel] = useState<string | null>(() => readChatModel())
  useEffect(() => {
    let live = true
    void browserListClient({ preview })
      .listModels()
      .then((list) => live && setModels(list.models))
      .catch(() => live && setModels([]))
    return () => {
      live = false
    }
  }, [preview])
  useEffect(() => {
    engine?.setModel(selectedModel)
  }, [engine, selectedModel])

  return { models, selectedModel, setSelectedModel }
}
