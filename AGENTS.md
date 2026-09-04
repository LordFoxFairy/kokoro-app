<!-- BEGIN:nextjs-agent-rules -->
# Next.js 本地版本规则

当前项目使用的 Next.js 版本可能与训练资料不同。写代码前先读取本仓
`node_modules/next/dist/docs/` 中与任务相关的官方指南，并遵守当前版本的 breaking changes、弃用提示和
运行时约束；不要凭旧版 API 经验猜测。
<!-- END:nextjs-agent-rules -->

# kokoro Web 子仓工程规则

本文件服从父级 `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/AGENTS.md`，只补充 Web 事实。修改前
读取父级手册、`README.md`、`INDEX.md`、`docs/INDEX.md`、`docs/CURRENT.md`、`docs/TECHNICAL_DESIGN.md`、
`docs/API_CONTRACT.md` 和相关测试；先执行 `git status --short`，保护协作者未提交文件。

## Owner 与边界

- Web 只拥有页面、交互状态、浏览器组件、同源 `/api/*` adapter、HttpOnly session cookie 和 AG-UI →
  Vercel AI SDK `UIMessage` 的本地视图适配。
- 浏览器业务调用唯一进入 BFF；Web 源码不得直接读取 IAM、System、Model、Billing、Capability、Storage、
  Agent 或 Scheduler 的 URL、数据库、Redis 或 SDK。服务端同源 adapter 也不得伪造可信 tenant/actor。
- AG-UI 是 Agent 网络事件唯一事实协议；`AgUiChatTransport` 是 Web 内部唯一 transport，Vercel AI SDK
  只负责 UI 状态/渲染，不新增第二套 SSE、replay 或 legacy wire。
- 外部 wire 使用 `snake_case`，内部 view model 使用 `camelCase`；Request、Wire、UI state 和 response
  类型分离，未知 JSON 先运行时校验再进入业务状态。

## UI 与代码粒度

- 按 feature 和真实 responsibility 拆分组件、hooks、reducer/view state、transport、mapper 和 CSS；不按
  行号机械切割，也不把所有状态塞进一个 page/component。
- 每个交互显式覆盖 loading、empty、error、disabled、optimistic、reconnecting、partial 和 success；
  异步 Chat 状态至少区分 `idle/submitting/queued/streaming/awaiting_approval/resuming/cancelling/
  reconnecting/completed/failed`。
- CSS 使用语义 design token；禁止品牌色/状态色散落硬编码、`!important` 和无替代的 outline 移除。
  必须保留 `:focus-visible`、键盘操作、`prefers-reduced-motion`、窄屏布局和清晰的错误/不可用反馈。
- 不为形式上的 DDD 创建空目录；组件、hook、view model 和 adapter 都应只有一个 owner。禁止新增万能
  `utils`、`common`、兼容 alias、双读双写或 production mock/fake。

## 契约与验证

- Web 的同源 API/AG-UI 契约由本仓 `contract/` 和 `docs/API_CONTRACT.md` 维护；generated 文件只生成不手改。
- 修改网络或 UI 行为必须同步更新组件/engine/contract/e2e 测试和相邻 `INDEX.md`，并在提交前运行：

```bash
pnpm contract
pnpm test:architecture
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

- 本地验证不启动或重复创建 PostgreSQL/Redis；Web 不拥有数据库，直接复用 BFF 的同源边界。跳过的命令必须
  在报告中明确列出。
- 一个写入 Agent 只修改声明的文件集合；大切片拆成可审查 commit。完成报告必须列出绝对路径、commit、
  实际命令结果、未完成风险和后续 owner。
