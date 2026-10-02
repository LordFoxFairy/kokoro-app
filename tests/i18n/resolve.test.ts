import { describe, expect, it } from "vitest"

import { LOCALES, LOCALE_NAMES, zh } from "@/i18n/messages"
import { OVERLAYS } from "@/i18n/overlays"
import { negotiateLocale, resolveMessage } from "@/i18n/resolve"

describe("i18n 协商（technical/14）", () => {
  it("存储偏好优先于浏览器语言", () => {
    expect(negotiateLocale("en", ["zh-CN"])).toBe("en")
    expect(negotiateLocale("zh", ["en-US"])).toBe("zh")
  })
  it("无存储时按浏览器语言前缀匹配", () => {
    expect(negotiateLocale(null, ["en-GB", "zh"])).toBe("en")
    expect(negotiateLocale(null, ["zh-TW"])).toBe("zh")
  })
  it("非法存储值/无匹配 → 默认中文", () => {
    expect(negotiateLocale("xx", ["xx-XX"])).toBe("zh")
    expect(negotiateLocale(null, [])).toBe("zh")
  })
  it("已上线语言按前缀协商命中", () => {
    expect(negotiateLocale(null, ["ja-JP"])).toBe("ja")
    expect(negotiateLocale("ko", ["en-US"])).toBe("ko")
  })
})

describe("i18n 解析 fallback（未译回退中文源，绝不裸露 key）", () => {
  it("en 有译取译文，缺译回退中文源", () => {
    expect(resolveMessage("en", "rail.newChat")).toBe("New chat")
    // lang.zh 在 en 表里恒为中文（语言名不翻）——同源即回退无损。
    expect(resolveMessage("zh", "rail.newChat")).toBe("新对话")
  })
  it("{插值} 命中替换、缺参保留原样", () => {
    expect(resolveMessage("zh", "thread.toolCount", { tools: 3 })).toBe("3 个工具")
    expect(resolveMessage("en", "composer.modeLocked", { mode: "Fast" })).toBe(
      "Response mode: Fast (locked this turn)",
    )
  })
})

const homePromptMessages = [
  {
    key: "firstSite.presentationPrompt",
    zh: "帮我制作一份关于「主题」的简报，包含清晰的大纲、关键要点和可直接用于投影片的内容。",
    en: "Create a presentation about [topic] with a clear outline, key points, and slide-ready content.",
  },
  {
    key: "firstSite.designPrompt",
    zh: "帮我设计一张关于「主题」的视觉作品，说明风格、版式、色彩和需要传达的核心信息。",
    en: "Design a visual for [topic], including the style, layout, colors, and key message to communicate.",
  },
  {
    key: "firstSite.gamePrompt",
    zh: "帮我制作一个关于「主题」的游戏，说明核心玩法、目标、规则和基本操作。",
    en: "Create a game about [theme], including its core gameplay, objective, rules, and basic controls.",
  },
] as const

type PendingHomePromptKey = (typeof homePromptMessages)[number]["key"]

function resolvePendingHomePrompt(locale: (typeof LOCALES)[number], key: PendingHomePromptKey): string {
  // RED 阶段 key 尚未进入中文事实源；只在测试边界桥接动态 key，避免用 TypeScript future-key 错误冒充行为失败。
  return resolveMessage(locale, key as keyof typeof zh)
}

function pendingOverlayValue(locale: Exclude<(typeof LOCALES)[number], "zh">, key: PendingHomePromptKey): string | undefined {
  return (OVERLAYS[locale] as Readonly<Record<string, string | undefined>>)[key]
}

describe("Home 主建议使用意图专用草稿", () => {
  it.each(homePromptMessages)("$key 提供精确中文源与英文译文", ({ key, zh: zhMessage, en: enMessage }) => {
    expect.soft(resolvePendingHomePrompt("zh", key)).toBe(zhMessage)
    expect.soft(resolvePendingHomePrompt("en", key)).toBe(enMessage)
  })

  it("三个专用 key 在九个上线 locale 都解析为实际文案，非中文语言不静默回退中文", () => {
    for (const { key, zh: zhMessage } of homePromptMessages) {
      for (const locale of LOCALES) {
        const resolved = resolvePendingHomePrompt(locale, key)
        expect.soft(resolved, `${locale}:${key} 裸露 key`).not.toBe(key)
        expect.soft(resolved.trim(), `${locale}:${key} 为空`).not.toBe("")
        if (locale === "zh") continue
        expect.soft(pendingOverlayValue(locale, key), `${locale}:${key} 缺少显式 overlay`).toBeTruthy()
        expect.soft(resolved, `${locale}:${key} 静默回退中文`).not.toBe(zhMessage)
      }
    }
  })
})

describe("i18n 语言包完整性（构建期可校验）", () => {
  const zhKeys = new Set(Object.keys(zh))

  it("每个 overlay 的 key 都是 zh 源的合法子集（无孤儿 key）", () => {
    for (const [locale, overlay] of Object.entries(OVERLAYS)) {
      for (const key of Object.keys(overlay)) {
        expect(zhKeys.has(key), `${locale}:${key} 不在 zh 源`).toBe(true)
      }
    }
  })

  it("每种上线语言(zh 源除外)覆盖率 ≥ 95%（MT 管线产物完整,缺译回退中文源）", () => {
    for (const locale of LOCALES) {
      if (locale === "zh") continue
      const covered = Object.keys(OVERLAYS[locale]).length
      expect(covered / zhKeys.size, `${locale} 覆盖率 ${covered}/${zhKeys.size} 不足`).toBeGreaterThanOrEqual(0.95)
    }
  })

  it("LOCALE_NAMES 覆盖全部 LOCALES（切换器可列全）", () => {
    for (const locale of LOCALES) expect(typeof LOCALE_NAMES[locale]).toBe("string")
  })

  it("命令菜单的可见文案在所有上线语言都有覆盖", () => {
    const commandKeys = [
      "shell.closeNav",
      "shell.openCommands",
      "shell.commandTitle",
      "shell.commandDescription",
      "shell.commandPlaceholder",
      "shell.commandEmpty",
      "shell.commandWorkspace",
      "shell.commandPreferences",
    ] as const
    for (const locale of LOCALES) {
      if (locale === "zh") continue
      for (const key of commandKeys) {
        expect(OVERLAYS[locale][key], `${locale}:${key} 缺少命令菜单翻译`).toBeTruthy()
      }
    }
  })

  it("核心导航使用名词化译文，不把设置和工作区翻成动词", () => {
    expect(resolveMessage("de", "settings.title")).toBe("Einstellungen")
    expect(resolveMessage("de", "rail.navLibrary")).toBe("Bibliothek")
    expect(resolveMessage("fr", "settings.title")).toBe("Paramètres")
    expect(resolveMessage("ja", "rail.navBilling")).toBe("残高")
    expect(resolveMessage("ko", "rail.navMcp")).toBe("연결")
  })
})


it("信息架构新增会话语义在全部上线语言有明确翻译", () => {
  const keys = ["firstSite.startConversation", "firstSite.currentProject", "firstSite.conversationsLoading",
    "firstSite.conversationsError", "firstSite.independentScheduledTasks", "firstSite.openScheduledTasks", "rail.conversationSort"] as const
  for (const locale of LOCALES) {
    if (locale === "zh") continue
    for (const key of keys) expect(OVERLAYS[locale][key], `${locale}:${key}`).toBeTruthy()
  }
})

it("本人安装管理与未知结果文案在全部语言中明确覆盖", () => {
  const keys = Object.keys(zh).filter((key) => key.startsWith("skills.personal.")) as Array<keyof typeof zh>
  expect(keys).toHaveLength(19)
  for (const locale of LOCALES) {
    if (locale === "zh") continue
    for (const key of keys) expect(OVERLAYS[locale][key], `${locale}:${key}`).toBeTruthy()
  }
})


describe("无 owner 事实时不承诺收费方式", () => {
  const neutral = {
    zh: "向 FixtureBrand 提问任何问题",
    en: "Ask FixtureBrand anything",
    de: "Frage FixtureBrand alles",
    es: "Pregúntale cualquier cosa a FixtureBrand",
    fr: "Posez n’importe quelle question à FixtureBrand",
    ja: "FixtureBrand に何でも質問できます",
    ko: "FixtureBrand에게 무엇이든 물어보세요",
    pt: "Pergunte qualquer coisa ao FixtureBrand",
    ru: "Спросите FixtureBrand о чем угодно",
  } as const

  it.each(LOCALES)("%s 的提问提示仅插值品牌，不宣称免费或扣点", (locale) => {
    expect(resolveMessage(locale, "composer.directPlaceholder", { brand: "FixtureBrand" })).toBe(neutral[locale])
  })

  it("删除所有语言的静态收费 Badge key，不保留孤立翻译", () => {
    expect(Object.hasOwn(zh, "thread.creditNote")).toBe(false)
    for (const overlay of Object.values(OVERLAYS)) {
      expect(Object.hasOwn(overlay, "thread.creditNote")).toBe(false)
    }
  })
})
