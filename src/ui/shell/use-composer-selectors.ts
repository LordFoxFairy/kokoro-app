"use client"

// Composer 模型选择器 controller（MODEL-UX）：挂载从 session /models 取候选，
// 选中即注入引擎——
// 下一次开跑随 messageCreate 上 wire。读取失败可显式重试；null 选择=用 profile 缺省。

import { useEffect, useLayoutEffect, useMemo, useState } from "react"

import type { ModelCandidate } from "@/contract/http"
import type { SessionEngine } from "@/engine/machine"
import { readChatModel } from "@/ui/settings/chat-prefs"

import { browserListClient } from "./page-clients"

export type ComposerSelectors = {
  models: readonly ModelCandidate[]
  modelCatalogStatus: "loading" | "ready" | "error"
  retryModels: () => void
  selectedModel: string | null
  setSelectedModel: (value: string | null) => void
}

export function useComposerSelectors(engine: SessionEngine | null, options: { preview?: boolean } = {}): ComposerSelectors {
  const preview = options.preview ?? false
  const scope = useMemo(() => ({ engine, preview }), [engine, preview])
  const [attempt, setAttempt] = useState(0)
  const [catalog, setCatalog] = useState<{
    scope: typeof scope; attempt: number
    models: readonly ModelCandidate[]; status: ComposerSelectors["modelCatalogStatus"]
  }>({ scope, attempt, models: [], status: "loading" })
  const sameScope = catalog.scope === scope
  const models = sameScope ? catalog.models : []
  const modelCatalogStatus = sameScope && catalog.attempt === attempt ? catalog.status : "loading"
  // 选中模型 稳定业务label key：null=用 profile 缺省，不上 wire。初值取 settings 缺省偏好
  // （WEB-FACE 面三）——新对话首帧预填，开跑后 modeLocked 锁定，会话级锁语义不变。
  const [selection, setSelection] = useState(() => ({ scope, value: readChatModel() }))
  const selectedModel = selection.scope === scope ? selection.value : null
  const setSelectedModel = (value: string | null) => setSelection({ scope, value })
  useLayoutEffect(() => {
    let live = true
    const controller = new AbortController()
    void browserListClient({ preview })
      .listModels({ signal: controller.signal })
      .then((list) => {
        if (live) setCatalog({ scope, attempt, models: list.models, status: "ready" })
      })
      .catch(() => {
        if (live) setCatalog(previous => ({ scope, attempt,
          models: previous.scope === scope ? previous.models : [], status: "error" }))
      })
    return () => {
      live = false
      controller.abort()
    }
  }, [scope, preview, attempt])
  useEffect(() => {
    engine?.setModel(selectedModel)
  }, [engine, selectedModel])

  return { models, modelCatalogStatus, retryModels: () => setAttempt(value => value + 1), selectedModel, setSelectedModel }
}
