> **已归档：禁止按本文件实现。** 这是早期多 Site/`SiteDefinition`/`SITE_ID` 构建选择方案，
> 当前已改为一个产品一个独立 Web 仓库；通用 package 迁移到 `kokoro-web-shared`，不在 React
> 中通过 Site registry 选择布局。当前基线见 [`site-repository-architecture-v2.md`](./site-repository-architecture-v2.md)。

# Kokoro User Web 通用包与 Site 定制方案 v1（已被 v2 站点仓库方案取代）

> 历史文档：本文件记录最初的“单仓库多 Site”方案。它不再是当前实现基线。
> 当前采用“一站点一仓库、通用能力以版本化 package 复用”，详见
> [`site-repository-architecture-v2.md`](./site-repository-architecture-v2.md)。

## 结论

User Web 不是“一套布局换颜色”，而是：

```text
通用能力包（可复用）
  + Site 产品包（布局/信息架构/文案/皮肤/能力组合）
  + Runtime Manifest（运行时配置与租户绑定）
  = 一个可独立部署的 Site Web
```

第一站的 Codex-like 工作台只是 `site-kokoro` 的一个产品实现，不把它升级成所有 site 必须服从的全局布局。

## 包的边界

```text
packages/
├── web-core/                 纯 TS：领域类型、resource/action state、错误映射、注册表
├── web-data/                 BFF client、query/cache、SSE/session adapter
├── web-ui/                   shadcn primitives、tokens、无业务的可访问交互组件
├── web-blocks/               可组合 blocks：Rail、Composer、Timeline、ContextPanel 等
└── web-runtime/              SiteDefinition、manifest 投影、能力过滤、skin 注入

sites/
├── kokoro/                   第一个 site：Codex-like layout + Kokoro 文案/资产/能力组合
├── SITE_B/
└── SITE_C/
```

通用包只约束协议、状态、可访问性和交互，不规定每个 site 的页面排布。

## Site 定制方式

每个 site 提供一个静态 `SiteDefinition`，由构建时注册；Runtime Manifest 只能提供数据，不能注入 React/JS/CSS。

```ts
export type SiteDefinition = {
  id: string
  productId: string
  defaultLocale: string
  layout: "codex" | "custom"
  theme: SiteThemeAdapter
  navigation: NavigationRegistry
  copy: CopyNamespace
  assets: AssetRegistry
  capabilities: CapabilityRegistry
  surfaces: {
    app: React.ComponentType<AppSurfaceProps>
    public?: React.ComponentType<PublicSurfaceProps>
  }
}
```

第一站结构：

```text
sites/kokoro/
├── definition.ts
├── app/                         Codex-like 工作台与 site 专属组合
├── theme.ts                     semantic token preset
├── navigation.ts                routeKey 与 iconKey 注册
├── copy/                        首页/空状态/错误/SEO 文案
└── assets.ts                    logo、字体和素材引用
```

Site 可以组合 `web-blocks`，也可以在确有差异时替换整个 `app` surface。通用包不阻止定制，只约束数据、错误、权限和可访问性契约。

## 哪些通用，哪些定制

| 能力 | 通用包 | Site 包 |
|---|---:|---:|
| shadcn primitive 与键盘行为 | ✓ | 组合使用 |
| Dialog/Sheet/Popover 焦点管理 | ✓ | 不重写 |
| BFF、SSE、资源状态、错误映射 | ✓ | 不复制 |
| 页面布局 | 提供 blocks | ✓ 决定排列 |
| 菜单文字与菜单分组 | 类型/注册机制 | ✓ |
| CSS token 语义 | schema/校验 | ✓ preset |
| 首页营销文案、SEO | 基础元数据接口 | ✓ |
| Logo、字体、素材 | asset contract | ✓ |
| 实验开关 | 读取机制 | ✓ 声明实验 |

## 部署模型（历史方案，已废弃）

同一个独立子仓库通过静态 site registry 可以构建多个站点产物：

```bash
SITE_ID=kokoro pnpm build
SITE_ID=SITE_B pnpm build
```

应用入口只读取 `getSiteDefinition()` 得到当前构建的 surface；Runtime Manifest 不参与代码选择。当前 registry 已接入 `kokoro`，后续 site 只需增加自己的 `definition.ts` 和 surface，不修改通用包。

以上是 v1 历史方案。当前已拆为一个 Site 一个仓库；保留本段只是为了说明为什么不再使用 `SITE_ID` 构建时切换。

## 硬约束

1. Manifest 只能配置数据，不能下发代码。
2. Site 包不能绕过 `web-data` 直连 IAM/System/数据库。
3. Site 包不能自行实现 shadcn overlay/focus/keyboard 逻辑。
4. `tenant_id` 只在服务端上下文存在，浏览器不接收也不提交。
5. 通用包不能反向依赖 `sites/kokoro`。
6. Site 定制可以替换布局，但必须遵守 `ResourceState`、错误、权限和可访问性契约。
