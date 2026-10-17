## 动态响应式职责（2026-10-17）

`src/ui/shell/layout-constraints.ts` 提供桌面起点768px；`use-mobile`、细指针rail观察与shell首屏CSS统一使用 `<768px`，含小数CSS视口，不把项目内容的容器断点与窗口断点混为一谈。项目网格、编辑器和技能面板仍各守原职责，未给总组件增加响应式业务分支。

共享 `DialogContent` 禁止几何过渡，保原进入/退出keyframes；业务面板继续只定义自己的尺寸/排版，不逐个补窗口缩放定时器。原项目会话E2E承接窗口往返、草稿/焦点与面板首帧边界检查，未新增套件。

## 项目技能确认框焦点（2026-10-17）

确认框由 `project-skills-section.tsx` 持实际打开按钮与父面板引用；卡片只传当前操作按钮。取消/Escape返回原按钮，已提交导致按钮停用或移除时回仍打开的父面板；父面板关闭时不抢其焦点。无全局焦点服务、定时器或命令状态改动。

## 项目概览布局职责（2026-10-17）

文档与文档外编辑区共用相同网格定义，实际 workspace 达768px才分双栏；中宽右栏未达320px时编辑区仍与左列严格同宽。断点与对齐保护并入原项目会话E2E，不另建像素快照套件。

`src/features/app/project-conversations.tsx` 独立拥有最近会话的 loading/error/list/empty，workspace 只组合身份、上下文、会话与编辑区。`project-workspace-layout.module.css` 负责统一可滚动文档与文档外底部编辑区；卡片视觉仍在 `kokoro-project-workspace.module.css`。没有新增请求、权限或状态模型。 Toolbar与空态共用 `project-skill-add-menu.tsx`；真实空态不显示无效默认保存栏，有选择或未保存改动时仍可操作。

### Project Skills 独立业务组件

`src/features/app/project-skills-section.tsx` 只组合项目技能入口、Dialog、默认草稿和确认交互；`project-skill-card.tsx` 只展示真实安装；`project-skill-source-picker.tsx` 独立读取个人安装池和正式官方目录；`use-project-skills.ts` 管本项目 lease、分页、真实命令与 ACK 后回读。安装≠默认；未知原意图跨同主体重核保留，不跨账号/项目，不自动重试。旧 workspace/dialog 聚合的技能名称开关、假卡、callback 和相邻 CSS 已退休，旧名称路径在同源边界直接拒绝。资源/技能使用明确 section 正常排版，不再依赖子元素序号定位。正常服务/库配对与执行链另验，不把组件或空预览成功冒完整产品验收。

### Project Skills 传输职责

`src/lib/server/skill-installations.ts` 独立持有 personal/project 共用的安装生命周期 adapter，catch-all 只分派；`src/lib/server/project-skill-selection.ts` 仅处理项目默认 GET/PUT。`src/hub/project-skills.schema.ts` 与 `project-skill-selection-client.ts` 分别维护 wire 和浏览器请求。现安装 client 显式 Project target，个人默认不变；无新 owner/兼容路径。独立项目面板已接线、旧名称开关已删除；正常产品浏览器整链另验。

### 2026-10-17 S3 BFF 来源契约消费

唯一src/generated/bff-public-openapi.yaml固定BFF e60ff31/Public15；原Team与Agent-failure生成器同步精确digest，Team业务派生和failure tuples保持。公开八类只在owner快照，网站publisher与分享五类schema不改；本片没有新增公开list UI client。验收与正常配对后继见docs/CURRENT，不以pin更新冒功能执行完成。

### MCP 管理原请求与 Prepare 互锁

`src/ui/mcp/mcp-management-commands.ts` 在现稳定shell构造typed MCP lifecycle，五项管理沿原key/body/CAS恢复，`mcp-preparation-commands`通过必需predicate承接互锁；API/JSON/OAuth不进入该管理index。`mcp-management-status.tsx`只为三个既有详情呈现非敏感状态。Hub五方法显式caller key并复用同源adapter的正式ACK matcher；缺行不结清命令。正常元数据编辑/断开与故障覆盖范围见CURRENT及现三suite，不另建UI测试中心。

### Custom API 管理原命令恢复

`src/ui/mcp/custom-api-management-commands.ts` 由现稳定shell按actor/client持有每profile的typed update/remove意图，复用现单命令核；`custom-api-detail-dialog`承接只读未知态/原请求恢复/ACK清草稿。Hub update/remove显式要求caller key，核目标与已写安全字段。窗口/准入退休保原命令，actor退休清理，列表缺资源不充当ACK。纯命令、现rail与Hub三suite承接独有风险，不另建UI套件；实际正常编辑/回读与故障证据范围见CURRENT。

### Custom API／JSON 创建命令恢复

稳定 AppFrameRuntime 的 `ConnectorCommandProvider` 在窗口／Settings 之外按 actor/client 明确保留 API 和原子 JSON 两个内存命令槽，两个入口共用；同 actor 重核暂停并保原 key/body，unknown 只显式恢复，确认后清命令正文，换 actor 清草稿。Hub client 创建签名显式要求 caller key，并严格绑定安全 ACK；API绑定名称、备注及环境变量名，JSON复用原完整导入投影校验，不拆成单项注册。共享纯命令核和表单关闭hook承接真实重复的准入/未知结果/清secret/关闭恢复机制，输入与投影失活仍由各自typed flow拥有。失败不是未提交证明，关闭也不是回滚；不写浏览器存储、不改 owner wire，MCP 多阶段创建与共享 Prepare 见 `src/ui/mcp/INDEX.md`，不归 API/JSON 单步 flow 所有。纯 flow 单元和既有 rail/client 行为回归验证该边界，不新增 CSS/DOM 字符串套件。

### 创建窗口的迟到完成

`McpCreateDialog` 将关闭与排队聚焦限制在已提交的 client／mode／open 窗口生命周期内。旧窗口的已确认写仍执行原投影失活，但迟到完成不关闭后开的窗口；Settings 不再另行重复关闭。现 rail 回归覆盖两个入口、组件保留时的模式切换与关闭重开。此围栏不是创建表单的完整准入或未知命令恢复实现。

### Custom API 创建投影刷新

全局创建与 Settings 内部创建在确认成功后，共用 `invalidateCustomApiProjection` 精确失活原 client／subject 的 Custom API 投影；不重挂整个 Settings、不误刷新 MCP／Provider。既有 rail 行为测试覆盖打开前的旧预热、挂载共享读者及取消后迟到的旧页；创建准入和命令恢复另由上述独立 actor flow 承接，MCP 创建后继不混算。

### 登录 URL 日志边界

`next.config.ts` 对既有验证链接/登录交互及精确 OAuth authorize、产品 callback 路径关闭开发请求 URL 日志，避免记录授权参数；不关闭普通业务日志，不改变路由或认证。`tests/system/iam-relay-next-http.integration.test.ts` 通过隔离真实 Next 的 stdout 验证敏感 marker 不出现，普通及 callback 相似路径 marker 继续出现。

### Skills 探索条目响应式布局

`src/ui/skills/skills-panel.module.css` 的窄屏封面与其网格列同宽，覆盖 inline 样式的尺寸优先级，避免遮住标题/说明；桌面布局保持。既有 `tests/e2e/public-shell.spec.ts` 用实际渲染的封面、文字与操作几何关系验证互不重叠，不锁 CSS 字符串或固定像素基线；显式预览数据不代表正常 owner 链路验收。

### Skills 导入窗口展示意图

`src/ui/skills/skills-panel.tsx` 只保留同 actor 的本地上传/GitHub 窗口打开意图。两个 importer 仍独立按 admission/generation 退休私有事实与未决工作、阻止失准入操作；actor-keyed 父级负责换账号清除窗口。相邻 `tests/ui/skills-import-regression.test.tsx` 验证父级重核、暂停操作及 A→B→A 不复活，原 flow/回执退休回归继续保留。

### T-K03.13 本人 MCP 只读接线

`src/app/api/hub/[...path]/route.ts` 精确保 self 映射四个已发行本人 reads；`src/hub/mcp-personal.schema.ts` 校验独立 wire/错误/资源绑定，原 active Connection projection 不变。相邻 `tests/app/hub-proxy.test.ts` 与 `tests/hub/mcp-personal-schema.test.ts` 覆盖闭集及网络生命周期；CRUD/授权 connection/Admin 是后继，不冒本片完成。

<!-- T-K03.14-WEB-PERSONAL-LIFECYCLE D0: target, not implemented -->
本人managed详情将显示真实例子/更新时间；更新沿personal-skill-publish flow正规新版本包链，撤回独立personal-skill-withdraw-dialog。仅owner范围；实现闭集及待验门见三设计具名前缀。

<!-- T-K03.14-WEB-GITHUB-IMPORT UI -->
现GithubImportDialog → personal-skill-github-import-flow → focused GitHub client / 现Publish owner+CAS / 真实Installation ACK；删除旧Hub optional URL导入与preview模拟写，不影响local-import/真实reader。

<!-- T-K03.14-WEB-LOCAL-IMPORT UI slice -->
普通Skills本地导入：`src/ui/skills/skill-upload-dialog.tsx` + `personal-skill-import-flow.ts` → `src/hub/skill-local-import-client.ts` → 现同源四路径。旧preview/confirm client/schema/factory已删除；personal publish仅保已有draft更新/恢复。

## R256 侧栏会话命中入口

现 workspace-rail-items.module.css 限定 conversation sibling flow 保标题/改名/移动/删除命中区独立；folder、读准入、路由与数据不改。真实原浏览器证据及未验项见 CURRENT/ACCEPTANCE；后台入口当前仍需正式管理员准入接线。

## R255 左栏展示意图入口

`workspace-rail-shell` 的 `folderIntentIdentity` 只保同已验证主体的非数据展开意图；read identity/generation/admitted 仍负责私有读取隔离。当前证据见 `docs/CURRENT.md`。

## R255 未开户正常状态与错误隔离（2026-10-06）

15现生产路径+1现UI测试，freeze报告d33e64be/final独审eadda7dd。contract/billing.ts消费正规严格404 billing_account_not_found错误体（meta/header request_id一致）；billing/client.ts复用原唯一10秒/16MiB/fatalUTF8/abort读取链，非404失败保持早抛。summary/ledger独立missing_account，不画假0/空流水/Retry，不在GET开户；另一面的真实异常与原actor/分页控制保持。九语言现键，无新文件/依赖/generated/API/资金写。

Root真实IAM用户正常3310积分页硬刷新：两“尚未开通积分账户”status，Retry0/假0为0，无永久loading。正常owner确实暂无本人credit account，本片不是开户或授权赠送/预占/结算/释放/模型费用闭环。原44例全部保留+新增26例=本UI70/0；Root最终冻结98文件1782/0/exit0，lint/typecheck0、contract275/0、architecture50/0、正常build0仅辅助工程。未跑全量system fixture/全页Playwright/axe/视觉/bundle，不用这些数量冒全产品通过。原563行测试完整/四mixed/uv/registry保持；观察失败和当前风险在Root同任务及测试台账。

## R255 左栏触屏滑动与文件夹信息密度（2026-10-06）

原正常 Web66e6f76 + protected四mixed。唯一生产路径 src/components/blocks/workspace-rail/workspace-rail-items.module.css，最终SHA93009a203dec9ac624983742405edd7ef7733c32d307a9423bd24b61f9c4171f：draggable行none→pan-y，desktop manipulation/HTML5/Space-Arrow-Escape接线不变；原nested toolbar定位所属folder行，仅重复视觉标题隐藏，nav aria-label及全部反馈/分页/创建排序保持。无新API/数据/框架/组件。

Root正常3310真实IAM用户浏览器：390×640 coarse/touch模拟，项目行起滑原0→0而资料库0→171.5；修后原同手势0→171.5、会话行反向171.5→101.5。最终CSS硬刷新后两folder展开项目起滑0→234.5、44px四按钮center hit全true、真实排序菜单可达；不是物理触屏验收。Desktop1200×460 wheel0→262→0，宽276/scrollWidth276，Direct底346.80<固定footer356.80；两分支自身空态、children77.92→43.52px且只一次project名，keyboard P收起不动Q/Space grab Escape释放。回Direct既有两历史marker及两行不丢，最终硬刷新无工作区loading。只读/list/sort/导航，无新消息/持久CRUD/模型/资金写。

Root最终冻结98文件1782辅助断言/0失败/exit0、正常build exit0；此前lint/typecheck0、contract275/0、architecture50/0，CSS最终真实页面另验。最终只读独审2227f645；这些不代替完整CRUD/70组。原用户IAB tab7 debugger同步超时，未冒其已刷新；多次HMR后旧disclosure locator、mobile中心命中既有rename overlay、错误/ready探针均保留为观察失败，据实际DOM/readyz纠正。实际正常9root/listener alive+既有probe200，原registry/uv/四mixed及其他候选保持。证据Root var/dev/r255-preserve/sidebar-billing-browser-final.json、sidebar-final-desktop.png、sidebar-billing-final-frozen-regression.log；用户IAB未操作。

## R255 用户侧栏树与滚动已修（2026-10-06）

Web基线df609a0；仅现workspace-rail-navigation.tsx一处folder class、items CSS与rail CSS，未改数据/API/身份/scope/Move/拖拽/宽栏cookie。Root正常3310既有IAM真实复现：项目children横排超内容列（scrollWidth455/276），1200×460主content hidden使wheel700仍top0且Direct裁切。现项目纵向树/同元素padding、各列表自然高、唯一content纵向滚动/横向约束，header/footer固定；compact同样滚动。另退役违背R254的空Direct旧隐藏规则，不重造业务。

实际浏览器GREEN：两空项目子列表位于自身header下/反馈可见；1200×460最终top253、Direct bottom346.68<固定footer356.8、原QA点击与4条历史保持；上下滚回0，700×460 fine-pointer top0→265后回宽hard-refresh仍展开/Direct2/loadingfalse；1200×320图标栏top0→170最后项目可达；键盘disclosure不导航，252px栏宽等动画后content228/scroll228，恢复300。项目概览→外部会话列表始终在，但概览另有会话GET404，不算Project完整成功。0 owner数据写/模型推理/资金调用，无服务重启或PG/Redis reset；用户IAB未动。

Root Node22辅助门：lint0/typecheck0、contract275/0、architecture50/0；最终现5UI文件146/0且actual exit0、最终CSS build0。独审最终e0829f2b，三source冻结准确。两前置locator/对dialog错误假设与过早动画测量保留，不伪装产品失败/静态E2E。真实0Direct、触屏Sheet/长分页/故障注入、全量test与所有页面test:e2e、axe/视觉/bundle未验；普通2Direct不证明空账号业务闭环。原三mixed设计文档与OIDC/Root uv/gitlinks/registry保护，70组11/8/14/36/1不变。原任务/QA台账与ignored sidebar-scroll-*证据续接，无新计划中心。

## R243 Project rename consumer candidate（2026-10-05；待 Root 真实门）

- `src/contract/project-rename.ts`：canonical target、normalized name/key、闭合 ACK/error/headers 与 duplicate-key JSON 校验。
- `src/features/app/project-rename.ts`、`src/lib/server/project-rename.ts`：单一 immutable PATCH、10 秒总预算和 exact 同源 adapter；ACK 不是 Project resource。
- `use-project-list.ts` 与现 AppFrame project/header/menu：pending/unknown/GET-only retry、scope/route/subject fence；ACK 后强制 target GET 再 list，不写 route/draft。
- 固定 BFF `886a25a1c0158dbf71eb4b3b72522508b1c9a8f5` public `7.2.0`，snapshot SHA-256 `bf64f0c66bea31a62285d64366686f3097bba21259b6c652977d28185097ed73`；正常现两 generators 生成，不改旧 Chat/Team 事实。
- 现邻接 contract/adapter/read-fence/UI tests 与 R242 真浏览器 oracle 供 Root 复验；作者静态检查不是产品 PASS，正式 3310 未由此切片更新。三 D0 原设计段冻结，任务入口仍为 Root `docs/task.md`。

## R85 Plugins目录真实度切片（2026-10-02）

- `src/features/app/kokoro-plugins-surface.tsx`：发现目录、搜索、分页、轮播及已有管理入口；不拥有连接安装/授权事实，删除本地Set形成的Add/Remove/checkmark假成功。
- 连接器广场不再保留 UI 测试套件；视觉与交互以已登录 Manus 页面、真实 owner 返回与浏览器主路径为唯一验收基线。
- 实际Root门与尚未接通的MCP调用链见`docs/CURRENT.md` R85；此源码切片不是正式连接或整个用户旅程已完成。

## R79-WEB-PROJECT-D0 当前入口（2026-10-02；仅方案，待 Root 门审）

Web基线main `dc330a99332be28bb74a4fa2d2196ba8425f9dc5`；此新前缀覆盖下方历史阶段现状，旧正文保持原字节。项目关联创建尚未实施，当前只更新五份文档；同Root `docs/task.md` R79为唯一任务卡，不另建计划/ADR/目录。

- 技术与精确后继10source＋5test职责：`/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/apps/kokoro-app/docs/TECHNICAL_DESIGN.md` R79。
- browser创建上下文/public5消费边界：`/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/apps/kokoro-app/docs/API_CONTRACT.md` R79。
- 无持久化owner与实例/回执生命周期：`/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/apps/kokoro-app/docs/DATA_MODEL.md` R79。
- actual阶段/未运行/Root门审：`/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/apps/kokoro-app/docs/CURRENT.md` R79。

采用现Project卡深链 `/app/scheduled?project_id=<exact编码>#scheduled-tasks/new`，在现独立Scheduled surface复用同editor；query不进入BFF POST，personal无关联，PATCH不改归属。现入口仍是project workspace、scheduled location/surface/editor/operations、contract/scheduled.ts与scheduled client/model，不新增第二live项目editor/store；owner任务列表仍个人全集，不称Project筛选。固定P5 blob/Team/safe12与R74保护保持。源码/测试授权、RED/GREEN和真实浏览器门均待Root后续放行。

---

# Kokoro User Web 仓库索引

状态：当前代码与治理入口，更新于 2026-09-30。

## 1. Owner 与非 Owner

本仓只拥有：

- User Web 页面与浏览器交互状态；
- 当前站点的 Auth.js/OIDC Product Session 与同源请求边界；
- `/api/*` browser-private adapter；
- 固定 BFF policy 约束的 `/iam/*` 原生 OAuth/OIDC 同源传输边界；
- AG-UI 到 Web 内部 view state 的适配职责。

本仓不拥有：

- Conversation、Message、Share、Project、ScheduledTask 或 durable AG-UI ledger；这些属于
  `kokoro-bff`；
- Run、Checkpoint、Lease、Tool Journal、HITL 或执行事件；这些属于 `kokoro-agent`；
- IAM、System、Model、Billing、Capability、Storage 或 Scheduler 的业务事实；
- PostgreSQL schema、Redis keyspace、migration 或服务端业务 repository。

## 2. 运行时入口

| 入口 | 说明 |
| --- | --- |
| `src/app/layout.tsx` | 根布局与 provider 装配 |
| `src/app/app/layout.tsx` | 登录后的桌面工作区布局 |
| `src/i18n/context.tsx`、`src/ui/theme/theme-context.tsx` | 浏览器 locale/theme 偏好 Provider；存储拒绝时分别回到既有语言协商/系统主题，写失败只保留内存选择，不拥有认证事实 |
| `src/features/app/kokoro-app-surface.tsx` | mounted surface 路由投影 |
| `src/features/app/kokoro-skills-surface.tsx` | 技能广场的搜索／分类由正式目录查询，资源与追加 cursor 绑定同一筛选和准入 client；默认目录保留共享预热 key |
| `src/components/blocks/app-frame/app-frame.tsx`、`app-frame-main-surface.tsx` | 桌面 shell 组合；准入期间只呈现无数据占位，并遵守路由的独立页面／会话及标题标志，不挂私有 Runtime |
| `src/components/blocks/workspace-header/workspace-header.tsx` | 工作区导航入口；移动端标签与展开状态只读取抽屉状态，开关不修改桌面侧栏偏好 |
| `src/components/blocks/app-frame/use-app-frame-navigation.ts` | URL归属与水合派生状态；终态错误不被错路由loading遮蔽，重试保留原深链 |
| `src/app/api/session/[...path]/route.ts` | Chat JSON/SSE/二进制的同源 BFF adapter；只转发显式 `Idempotency-Key` header，不从 JSON body 提升旧 key |
| `src/app/api/system/runtime-manifest/route.ts` | 经 BFF 获取 runtime manifest |
| `src/app/api/{hub,agents,scheduled-tasks,billing}/` | 业务 browser-private adapter；Hub 精确个人文件 1 MiB 缓冲与 Artifact 二元 1 GiB 流式下载分别校验同源二进制及安全头 |
| `src/app/api/auth/`、`src/app/api/team/` | 当前认证/团队适配；仍含 IAM 直连缺口 |
| `src/app/iam/[...path]/route.ts` | 固定 policy 的只读 IAM GET 同源 relay；仅 authorize 200 redirect JSON 转受限浏览器 302；直接 browser POST 与 server-only 凭据路由拒绝 |
| `src/app/iam/interactions/invitation/route.ts` | 邀请邮件的唯一静态入口：独立 issuer 登录/注册、recipient-only context、一次性 CSRF 接受/拒绝；`same-origin` Referrer-Policy 保留浏览器同源 POST Origin 且不向跨站发送邀请 URL；仅接受成功后转 Product `/login` |
| `src/proxy.ts`、`src/app/auth/sign-in/form/page.tsx`、`src/app/auth/sign-in/route.ts` | 签名 GET 经 Proxy 签发一次性 CSRF 并内部 rewrite 到真实 shadcn React 表单；原路径 POST 仍处理凭据、Origin 和签名 query，401/429/503 回同一表单 |
| `src/app/auth/{select-tenant,consent}/route.ts` | IAM 固定外层交互 URI 的严格 GET 到 `/iam/interactions/*`；外层 POST 405 |
| `src/app/iam/interactions/select-tenant/route.ts` | `/iam` cookie path 内的 owner `/organization/list` 候选、选择重核及 set-active 续接 |
| `src/app/iam/interactions/consent/route.ts` | `/iam` cookie path 内的未验签 scope 预览、明确同意及 IAM 最终验签；RP callback 未安装时受控 503 |

## 3. Chat 与契约入口

| 文件 | 角色 |
| --- | --- |
| `src/contract/project-resource.ts`、`src/features/app/project-resource-list.ts`、`src/features/app/use-project-resources.ts` | 固定 BFF CLEAN 资源页面校验、同源 GET 与项目内有界分页/取消/失败状态 |
| `src/contract/library-file.ts`、`src/features/app/kokoro-library-file-client.ts` | 固定 BFF 个人 CLEAN FILE 页与上传回执的独立 Zod 消费校验、同源列表 GET 与个人原字节下载；不复用 Artifact wire |
| `src/contract/library-artifact.ts`、`src/features/app/kokoro-library-artifact-client.ts` | 固定 BFF 作品页级 oneOf/二元详情严格校验、同源列表/详情与原生 attachment 发起；不复用旧 hash 或个人 File wire |
| `src/features/app/kokoro-library-file-state.ts`、`src/features/app/kokoro-library-files.tsx` | 个人文件的局部分页/取消/错误状态、GET 权威 Asset 列表及现有卡片的下载/取消/重试 |
| `src/features/app/kokoro-library-file-upload-{client,state}.ts`、`kokoro-library-file-upload.tsx` | 原生 multipart 整体限额/同源 POST、跨页签 File/key 意图与 shadcn 单文件上传 UI；只在 CLEAN 回执后触发 GET |
| `src/contract/project-create.ts`、`src/features/app/project-create.ts`、`src/components/blocks/app-frame/use-app-frame-project.ts` | 固定 BFF ProjectResponse consumer 校验、同源 POST 与正式/预览创建意图区分；仅 canonical id 导航 |
| `src/contract/agui-events.ts` | 严格解析 AG-UI wire frame；不拥有 reducer 投影 |
| `src/contract/agent-failure.ts` | 从 generated owner tuple 派生唯一 safe Agent failure schema/type；不维护第二码表 |
| `src/core/chat-projection-event.ts` | Web 内部 Chat 投影事件 schema；不是 wire contract |
| `src/contract/{chat,control,artifacts,catalog,billing,scheduled}.ts` | browser-private JSON DTO 的 Zod schema |
| `src/contract/paths.ts` | 同源路径 helper |
| `src/contract/http.ts` | 当前 contract canonical barrel；不定义 schema、alias 或兼容协议 |
| `src/generated/bff-public-openapi.yaml`、`src/generated/bff-agent-failure.ts` | 固定 BFF public owner 原字节与由其生成的 safe failure 12 tuple/provenance |
| `scripts/generate-bff-agent-failure.mjs`、`tests/contract/bff-agent-failure-public.test.ts` | import-safe exact pin 的 pure inspector/renderer、`--write/--check` 与独立语义 mutation/drift 门 |
| `src/engine/client.ts` | `/api/session` JSON/SSE client、cursor 与重连 |
| `src/engine/machine.ts` | Chat 状态机与 snapshot/event reconciliation；仅未获 create receipt 的冻结意图可同键恢复 |
| `src/core/reducer.ts` | 纯 UI 投影；Agent/dispatch/generic 使用 closed failure union，dispatch string sourceSequence 不进入 numeric lastSeq |
| `src/ui/composer/composer-voice-actions.tsx`、`composer-controls.module.css`、`composer.module.css` | VoiceActions自身flex/color由controls CSS Module维护；父Composer只通过voice-actions slot管理跨模块位置，发送/停止组在桌面及触屏贴右 |
| `tests/e2e/web-governance.spec.ts` | 独占preview浏览器的桌面十档轴线/overflow/操作右缘与Pixel7两档触屏回归；成功截图及安全computed附件写入单次测试output，不进源码 |
| `contract/README.md` | owner、visibility、version、generation、breaking、provenance |
| `contract/api-contract.test.ts`、`tests/contract/` | contract 回归 |

规范目标是 AG-UI 为唯一 Web↔BFF 网络事件协议。`SessionEvent`、未来 Vercel AI SDK
`ChatTransport`/`UIMessage` 都是 Web 内部表示，不能被发布成 Developer API 或第二条 SSE。

## 4. 服务端边界

| 文件 | 说明 |
| --- | --- |
| `src/lib/server/same-origin.ts` | 六个业务同源 adapter 复用的 Origin/Host 守卫 |
| `src/lib/server/product-bff.ts` | 普通受保护 BFF adapter 的在线 Product Session admission、唯一 Bearer 与 service identity |
| `src/lib/server/product-identity.ts` | RP callback/refresh 对固定 BFF `/v1/me` 的严格 subject/tenant 在线准入；wire 类型在此终止 |
| `src/lib/server/domain-context.ts` | server-only `KOKORO_DOMAIN` 与 `Forwarded` |
| `src/app/iam/[...path]/route.ts` | server-only `KOKORO_WEB_ORIGIN`、固定 GET allowlist 与请求准入 |
| `src/lib/server/service-config.ts` | BFF 地址读取 |
| `src/lib/server/upstream-http.ts` | 上游 header 清洗与流式 transport |
| `src/lib/server/bff-response.ts` | BFF envelope、request id 与 no-store 响应 |
| `src/generated/iam-relay-policy.json` | 固定 BFF commit 的只读 policy snapshot |
| `src/lib/server/iam-relay-policy.ts` | snapshot provenance、只读 GET 子集、issuer cookie 入站过滤 |
| `src/lib/server/iam-relay-config.ts` | `/iam` 与 sign-in 共用的固定 Web origin/BFF/service-secret 配置解析 |
| `src/lib/server/iam-interaction-csrf.ts` | Redis 原子一次性 CSRF 摘要/交互绑定；唯一允许 Redis import 的 server-only 文件 |
| `src/lib/server/iam-interaction-page.ts` | 邀请与 consent 等 IAM issuer 交互的无脚本品牌 HTML/CSS 外壳；正式登录表单改用 React 页面 |
| `src/lib/server/iam-sign-in-target.ts`、`src/lib/server/iam-sign-in-feedback.ts` | 登录原始签名 query 校验、短时加密表单错误反馈；不拥有 IAM 凭据或 Product Session |
| `src/lib/server/iam-invitation-input.ts` | 邀请入口 query、owner context 与有界表单的纯校验；不拥有网络调用或页面编排 |
| `src/lib/server/iam-invitation-page.ts` | 邀请专用中文登录、注册与 recipient-only 预览页面；不拥有 IAM/BFF 业务事实 |
| `src/lib/server/iam-invitation-page.ts` | 邀请登录、注册、context 的纯 HTML 投影；只对邀请启用紧凑视觉 variant，不改变已有 OAuth 交互外壳 |
| `src/lib/server/iam-interaction-route.ts` | 外层同源跳转及内层 tenant/consent 共用的严格 Origin/query/form 与安全导航边界 |
| `src/lib/server/iam-relay-transport.ts` | `/iam` 专用原生 HTTP transport；保持多 `Set-Cookie`、限额、deadline 与取消 |
| `src/lib/server/iam-relay-response.ts` | 原生 status/header/Location/issuer `Set-Cookie` 出站校验 |

## 5. Browser-only 状态

- `src/core/`、`src/lib/persisted-store.ts`：受 Zod 校验的 browser store；
- `src/dev/preview-transport.ts`：local/test 合成 Chat 历史；
- `src/features/app/kokoro-scheduled-surface.tsx`：preview Scheduled localStorage；
- `src/features/app/kokoro-library-surface.tsx`：同页文件/Agent 作品 Tabs；正式作品消费 BFF Product 二元身份，显式 preview/fixture 独立，错误与重试可见；
- `src/ui/theme/`、`src/i18n/`、`src/ui/shell/`：主题、locale、草稿和 UI 偏好；theme/locale 的持久化是可失败偏好，读取异常回既有默认协商，写入异常不撤销当前内存选择。认证索引仍独立 fail closed。

这些数据不是服务端业务事实；完整分类见 [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)。

## 6. 文档阅读顺序

1. [`docs/CURRENT.md`](docs/CURRENT.md)
2. [`docs/TECHNICAL_DESIGN.md`](docs/TECHNICAL_DESIGN.md)
3. [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md)
4. [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)
5. [`docs/SECURITY.md`](docs/SECURITY.md)
6. [`docs/RELIABILITY.md`](docs/RELIABILITY.md)
7. [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md)
8. [`docs/SLO.md`](docs/SLO.md)
9. [`docs/RUNBOOK.md`](docs/RUNBOOK.md)
10. [`docs/ADR/`](docs/ADR/)

历史设计、视觉审计和迁移资料的权威性分类见 [`docs/INDEX.md`](docs/INDEX.md)。

## 7. 验证入口

S9 Chat Delivery 候选的当前/目标态见 `docs/CURRENT.md` 顶部；正式成果卡/Canvas 复用
BFF Library 二元详情及原生同源附件，不再使用旧 hash 下载。真实 IAM/Agent/Storage 浏览器链由 Root 独立验收。
OIDC system fixture 可用测试专属 `KOKORO_TEST_NEXT_DEV_ENGINE=webpack|programmatic` 对照集成 CLI Webpack 与
programmatic Turbopack；未设置保持 Webpack，未知值 fail closed。该开关不进入生产配置，也不替代完整工程门或真实 owner E2E。
真实 Redis fixture 必须按 exact origin/prefix 保存启动前 baseline，并只清理由本次运行新增的 CSRF、OIDC state 与
Product Session record/tombstone；清理后执行零增量断言。禁止通过 `FLUSHDB`、删除 baseline 或等待 TTL 来伪造资源门通过。

```bash
pnpm contract
pnpm test:architecture
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Root 静态审计从父仓执行：

```bash
python3 scripts/verify-ten-repository-standard.py --format json
```

该命令会审计十仓；评估本仓时只提取 `repository == "kokoro"` 的诊断。它不替代本仓的真实
lint、typecheck、test、build、浏览器 E2E 或 live BFF 验收。

- Skill Share: `src/hub/skill-share.schema.ts` / `skill-share-client.ts` 严格消费正式六字段链接与精确 revision 摘要；`src/app/skills/shared/[id]/page.tsx` 复用真实摘要/包 reader，安装独立读取和 ACK。未知 Create 不自动重建；复制失败复用原 ACK。共享页消费既有 browser-private exact 下载句柄，严格绑定 source_ref/revision，流式下载原包，不借 series current 下载。 分享入口按 actor＋share ID 保详情展示实例，summary/installation/动作 ACK 按 admission/generation/读重试 token 退休；pending/fresh 失败保通用详情或 reader 框架。unknown 安装仅保原意图/key、用户显式恢复，旧响应不更新后继代际。

- 目录重核：外层保同 actor 的搜索/筛选/精确详情 locator；`use-catalog-skill-installation` 拥有本代安装动作与冻结未知命令。详情/包文件展示仍按代际退休，`SkillPackageFiles` 仅渲染 owner 文件树。分享未知墓碑与当代 ACK 分离，导入只读/已确认结果重核退役，未知恢复意图保留。
- 技能广场和 Settings Explore：每页9条，只有默认首读传 `shuffle:true`，续页由 owner cursor 延续同一随机序列，查询/分类首读不传 shuffle。两种展示使用独立内存资源键，写后失活整个 client 目录 namespace。探索页的 query/category 同样由 owner 查询；本地筛选只用于 preview 或新读期间的上页临时投影，未确认页禁动作、失败显式重读。分页按已提交的 key/base/next-cursor/open 退休，迟到的旧 observer 也没有重新发读或占用当前 pending 的资格。
- 插件广场：route wrapper铺满主区，MCP reader的plaza展示独立48px标题栏与内部滚动body，管理/创建锚定标题栏右端，目录限宽768px居中；Settings与非plaza保持原布局。管理入口仍交给同源Settings，创建只交付原命令选择；推荐区不使用静态实体或伪连接，仍需owner运营展示数据后继。

- Settings技能重核：SkillsContent按actor/preview隔离纯展示意图，同actor换client保搜索/分类与精确series/revision详情窗口；池、目录追加页、开关投影、错误/忙态和命令闭包按当前owner退休。详情仅从新安装池或当前目录/游标页找回原版本，缺失保pending/error壳并可显式续页/重读；不缓存整张旧卡跨代替代新事实。关闭时原触发器失效则回当前搜索框。正文/文件读取仍沿原详情组件的代际清理，不承诺跨代保文件内容。显式preview只用fixture client，真实admission/updateFlow不放宽。


## MCP 写后投影失效（2026-10-16）

全局创建与 Settings 内部注册／JSON 导入成功后，按 client／subject 失活个人连接器缓存并重读；在途预热按 revision 退休，不覆盖写后新结果。个人已确认命令复用该投影失效入口，Provider 元数据不随之重读；内容不因写入重挂，原搜索保留。既有 AppFrame 行为文件覆盖全局导入后立即管理、迟到预热、另一主体隔离及读取失败重试；不新增 UI 套件或源码／样式字符串断言。


## MCP 同 actor 重核（2026-10-16 候选）

MCP Settings/Plugins 的纯展示意图按 actor 保持，事实/命令按 read generation 退休；精确详情、配置 dirty 字段和目录控件不因重核整面板重挂。`src/ui/mcp/INDEX.md` 记录事实重读、失败恢复、OAuth 退休与独立 Custom API 写后失活边界。行为回归复用既有 rail suite，不恢复已退役的 UI 套件；正常浏览器与完整门的当前证据归 Root 有效闭环计划，不由此索引宣称完成。


MCP/Custom API配置的焦点后继：保留readonly配置控件而不是临时卸载；owner-only值仍立即退休，选择/内部滚动按纯metadata恢复且不抢用户新焦点。具体边界见`src/ui/mcp/INDEX.md`，不涉及auth/owner契约或数据库变更。


### Connector browser-private恢复错误消费

`src/generated/bff-connector-command-errors.{json,ts}` 是固定BFF profile的原字节/正规派生；`scripts/generate-bff-connector-command-errors.mjs` 只检查或生成此窄profile。`src/hub/connector-command-error.ts` 与现MCP/Custom API schema在Hub和同源adapter共享严格tuple规则，不增网络层、错误registry或UI自动重试；后继actor恢复提示单独接线。


### Connector恢复原因与原请求重试边界

现 `src/ui/mcp/connector-command-failure.ts` 消费已固定profile给出非敏感reason/消息key；单命令和Register持失败限制，Prepare创建/详情共享，终止原因不重试、不换key。九语言与原alert/button接线，原UI布局/HTTP/owner事实保持；人工核验与真正OAuth闭环不冒本片完成。
