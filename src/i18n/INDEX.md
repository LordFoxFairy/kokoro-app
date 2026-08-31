# src/i18n — Web 界面静态 i18n

## 职责
Web UI 的多语言:**中文(zh)是唯一源字典**,其余语言是增量覆盖,未译键在解析层回退中文源(绝不裸露 key、绝不半中半英崩溃)。9 种上线语言:zh/en/ja/ko/es/fr/de/pt/ru。

## 公开件 / 数据流
- `messages.ts` — **源真相**:`zh = {...} as const`(全量键),`MessageKey = keyof typeof zh`;`Locale` 联合、`LOCALES`、`DEFAULT_LOCALE="zh"`、`LOCALE_STORAGE_KEY`、`LOCALE_NAMES`(母语显示名)。
- `<locale>.ts` — 各语言 `Partial<Record<MessageKey, string>>` 增量覆盖。
- `overlays.ts` — `OVERLAYS: Record<Locale, Partial<...>>` 数据驱动查表(解析层据此按 locale 取词)。
- `resolve.ts` — 纯解析层(无 DOM/React):`negotiateLocale`(存储偏好 > 浏览器语言前缀 > 默认 zh)+ `resolveMessage`(OVERLAYS[locale] → zh → key 三层 fallback + `{var}` 插值)。
- `context.tsx` — React 绑定:`LocaleProvider`(SSR/水合首帧用默认、挂载后协商,避免注水不一致)、`useLocale`、`useT`。

## 新增一种语言(全流程)
1. `messages.ts`:`Locale` 与 `LOCALES` 加语言码 + `LOCALE_NAMES` 加母语名。
2. 创建 `<code>.ts`，维护该语言对 `messages.ts` 的增量覆盖。
3. `overlays.ts` 挂上该 overlay。
**解析层零改动**;语言切换器(`@/ui/settings/settings-sections` AppearanceCard)从 `LOCALES` 动态列出,零改动。

## 陷阱
- 新文案只在 `zh` 加一行 key；各语言按发布流程补齐并人工校对。en 是手维基线，其余语言可保留人工精修。
- 硬编码护栏 `tests/i18n/no-hardcoded-ui.test.ts` **只查中文字符**——英文硬编码不触发。已修的盲区:mode 的 `Fast`/`Thinking` 曾英文硬编码(`ui/composer/mode-options.ts`),现走 `mode.labelFast`/`mode.labelThinking` 键。新增英文硬编码仍可能漏网,评审留意。
- overlay 完整性由 `tests/i18n/resolve.test.ts` 守:每 overlay 的 key ⊆ zh 源、各语言覆盖率 ≥95%、`LOCALE_NAMES` 覆盖全 `LOCALES`。
