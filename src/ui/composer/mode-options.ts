import { createElement } from "react"
import { Sparkles, Zap } from "lucide-react"

import type { AgentMode } from "@/core/conversations"
import type { MessageKey } from "@/i18n/messages"

import type { MenuOption } from "./composer-menu"
import styles from "./composer.module.css"

type Translate = (key: MessageKey, vars?: Readonly<Record<string, string | number>>) => string

// 模式：Fast（闪电·更快）/ Thinking（火花·更深思考）下拉单选；纯 UI 偏好，不上 wire。
// hint 走 i18n key，由消费组件（composer 菜单）在渲染时 t() 解析。
// 模式名 i18n key（Fast/Thinking 不再硬编码——各 locale 可译；也喂进相位文案作 {mode} 插值）。
const MODE_LABEL_KEYS: Record<AgentMode, MessageKey> = {
  fast: "mode.labelFast",
  thinking: "mode.labelThinking",
}

export const modeLabelText = (t: Translate, mode: AgentMode): string => t(MODE_LABEL_KEYS[mode])

export function modeOptions(t: Translate): MenuOption[] {
  return [
    {
      key: "fast",
      label: t("mode.labelFast"),
      hint: t("mode.hintFast"),
      icon: createElement(Zap, { className: styles.modeGlyph }),
    },
    {
      key: "thinking",
      label: t("mode.labelThinking"),
      hint: t("mode.hintThink"),
      icon: createElement(Sparkles, { className: styles.modeGlyph }),
    },
  ]
}

// 菜单回调的 key 是 string，按已知模式键集收窄，非法 key 不再被强断言为枚举。
export const isAgentMode = (value: string): value is AgentMode =>
  Object.hasOwn(MODE_LABEL_KEYS, value)
