# Kokoro User Web 验收清单

## 页面入口

- `/`：Kokoro 产品稳定入口，服务端重定向到 `/app`。
- `/preview/marketing`：公开营销预览，不加载工作区会话。
- `/login`：User Web 登录面。
- `/app`：桌面工作区；直接聊天、项目聊天、Agent、Skills、Scheduled、Library 和设置由当前
  产品仓库的 AppFrame 装配。

## 运行时边界

```text
Browser
  → same-origin Kokoro BFF (/api/*)
  → User / Session / System / Hub / Billing
  → backend resolves tenant, identity, permission and data scope
```

- 本地 checkout `kokoro` 对应 GitHub 独立仓库 `LordFoxFairy/kokoro-app`，就是一个产品部署；不在 React 中维护 Site registry 或 tenant selector。
- `KOKORO_DOMAIN` 只在服务端读取；每个 BFF 上游请求都带 `Forwarded: host=<KOKORO_DOMAIN>`。
- 浏览器不提交或保存域名上下文、`tenant_id`、`site_id`、内部 namespace、workload token 或 JWT。
- Session JWT、refresh token 和服务身份只存在服务端；公开响应只返回 browser-safe projection。
- 后端负责同邮箱在不同租户下的数据隔离，Web 不从浏览器 Host 推导隔离键。

## UI 验收（桌面）

- Rail expanded/icon、缩窄自动收起、手动收起、Resizable 主区和 Context Panel 无双线、跳动或横向溢出。
- 直接聊天和项目内聊天资源关系清晰；路由切换使用客户端状态，不整页白屏。
- Composer 的加号、连接器、环境胶囊、语音、发送按钮和关闭状态尺寸稳定；dismiss 不请求后端。
- Skills、Library、Scheduled、Agent 均验证列表、空态、创建/详情、错误、权限和重试。
- Dialog/Sheet/Popover/Dropdown/Tabs/Tooltip/Command/ScrollArea/Resizable 使用 shadcn/Radix 行为；
  大内容 body 可滚动，header/footer 不被吃掉。
- 只做桌面 Web 回归；手机端不属于当前部署验收范围。

## 发布验收

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
docker build -t kokoro-app:local .
pnpm run cf:build  # 选择 Cloudflare 路径时
```

生产 smoke：

```bash
KOKORO_WEB_URL=https://app.example.com \
KOKORO_DOMAIN=app.example.com \
pnpm smoke:first-site
```

Smoke 必须验证 `/api/system/runtime-manifest`、`/app` HTML、匿名/认证态、Session BFF（若提供 cookie）
以及浏览器响应不暴露内部身份字段。
