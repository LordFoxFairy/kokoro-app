# Kokoro API contract source

状态：当前 `kokoro-app` 的 checked-in contract source（2026-08-31）。

本仓库目前没有 `contract/spec/*.yaml` 或生成器；因此 `src/contract/` 不是从缺失文件生成的
产物，而是运行时实际使用的唯一 TypeScript/Zod 契约来源：

| 文件 | 负责范围 |
| --- | --- |
| `src/contract/http.ts` | Session、artifact、模型/Agent、billing 和公共错误/receipt 的 JSON schema 与路径 helper |
| `src/contract/control.ts` | Run control、HITL decision 和 pause/resume 结构 |
| `src/contract/session-events.ts` | Session SSE event union、payload 和 watermark 结构 |

## 修改规则

1. 先修改或新增 Zod schema，再同步 `docs/integration/user-web-api-contract-v4.md` 和
   `docs/integration/business-bff-contract-v1.md` 的浏览器路径、字段、状态和错误语义。
2. 每个新增/变更 schema 都要有对应 domain test 的 parse/拒绝未知字段/边界用例；
   `contract/api-contract.test.ts` 是 HTTP/SSE wire shape 的集中回归入口，engine/app 测试
   负责状态机与页面接线；不要在 UI 组件中复制 JSON shape。
3. Web 浏览器只调用同源 `/api/session/*`、`/api/hub/*` 等已注册 BFF 路径；内部 BFF/runtime
   URL、凭据、tenant 和服务 namespace 不进入浏览器入站身份字段。
4. 未来若引入 OpenAPI/JSON Schema 生成流程，必须把它作为本仓库的显式工具链加入 CI，并把
   生成结果与本目录的 runtime parser 一起校验；在此之前不得引用不存在的 generator/spec 路径。

## 现阶段与 BFF 的关系

`kokoro-app` 只保留 UI 与同源 Web 适配路由；统一业务编排由
`LordFoxFairy/kokoro-bff` 的 `modules/chat` 与业务 modules 承接。Web 只调用同源
`/api/session/*` 等兼容路径，服务端由 BFF 负责 Chat、Agent、Billing、Capability、Model、
Storage 和 System 的业务投影。BFF 的实现不会以 `file:` 依赖引入其它仓库源码。

完整路径、Preview/Live 状态、Forwarded 和部署边界见：

- [`docs/integration/user-web-api-contract-v4.md`](../docs/integration/user-web-api-contract-v4.md)
- [`docs/integration/business-bff-contract-v1.md`](../docs/integration/business-bff-contract-v1.md)
