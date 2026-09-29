# Kokoro User Web 技术设计

## S9-WEB-DOC：Chat Delivery / Canvas 二元消费设计门（2026-09-28；仅文档）

**当前态。** Web main `102033e34be89ba0e9958447e4d4021fcbf257b7` 的 Library 作品页已使用
`(conversation_id,artifact_id)` 与同源原生 attachment；Chat 是另一条未迁移链。`src/core/chat-projection-event.ts`
仍按旧 hash/path 校验 `delivery.created`，`src/contract/artifacts.ts` 的 snapshot Delivery 也仍是旧形状；
`src/core/{state,hydration,reducer}.ts`、`src/ui/thread/delivery-card.tsx`、
`src/ui/shell/use-canvas-workspace.ts`、`src/ui/canvas/canvas-store.ts`、
`src/ui/canvas/canvas-panel.tsx` 仍用 hash 去重/定位、
`deliveryPath` 和 fetch→Blob/内嵌预览。当前 `AgUiChatTransport` 遇 HTTP 410 只回调错误，machine 进入 FAIL，
尚不会因 `event_cursor_expired` 自动重取快照；run 终态的 `syncWorkspaceFiles` 直接整表替换 deliveries，
未处理新 live 事件与较旧快照的竞态。不能把 Library 的已验收证据移作 Chat 证据。

**Owner 与目标。** BFF main `bd1f794e7b1115d96965aa03d8a3a83a33c42fd7` 的 public OpenAPI
SHA-256 `a224b186813615467b6c045d3be83082d3e164e140d6da9722bf3f8d7e33b219` 是唯一机器契约；
BFF 持久拥有 Conversation↔Artifact、最近 100 件快照、`deliveries_has_more`、同事务 AG-UI 水位与 replay，
Storage 拥有 FINAL/CLEAN 原字节。Web 只在现有同源 adapter 后严格解析 wire、投影 React Chat/Canvas，
不新增数据 owner、业务 SQL、Redis 或第二条 SSE。Browser→Web `/api/*`→BFF public→内部 owner；
本人私有，Project/Team 不因同组自动共享。

| 放置比较 | 裁决 |
| --- | --- |
| 采用既有 Chat / Canvas / Library 边界 | 在现有 `src/contract/{chat,artifacts}.ts` 与 AG-UI parser 严格解析；`src/core` 负责 live、replay、snapshot 统一二元投影；现有 thread 卡/Canvas 只管视图，调用既有 Library 二元详情与原生下载 helper。文件只按 wire、状态、视图各自变化原因扩展，不新建顶层目录。 |
| 淘汰新建第二 Chat store / 复制 BFF 表 | 会产生双 cursor、重复事实和跨 owner 授权假象；`asset_id`、hash、path、MIME 只作经校验的来源/显示字段，不作选择器、去重或下载许可。不得从旧 hash 猜二元 ID。 |

**恢复与交互。** 正式 `delivery.created` live/replay 先按完整 Agent 事件字段校验，以受校验
AG-UI thread/session envelope 的 `session_id` 作 `conversation_id`，再只把
`(conversation_id,artifact_id)`、kind、title、mime、size、run/time 投影为 `SessionDelivery`；
snapshot 以 BFF 同事务 `deliveries + event_watermark` 水合，随后只回放水位后的 durable AG-UI。
同二元 ID 重复帧/水合项只显示一件；相同 hash 的不同 artifact_id 必须保留两件。终态同步不得让较旧
snapshot 覆盖并丢失新 live 项；须比较当前水位/代际并用二元 ID 对账。`event_cursor_expired` 的流建立
HTTP 410 是 replay 过期，不是 Conversation 已删除：transport 必须保留稳定错误码供 machine 区分，
停止旧流、重读当前本人快照/水位，再从新水位续流；
重取失败显示可重试错误，绝不以空 Chat 或旧 hash 回退。快照最多 100 件，`deliveries_has_more=true`
时 Chat/Canvas 提供现有 Library“查看全部作品”入口，而不是把 100 件冒称全集。

**首片 UI 与删除。** 复用现有 shadcn 卡、Canvas 布局及 Library 交互，Chat 卡和 Canvas 先只显示
metadata、本人二元详情、同源原生 attachment 下载；不让 1 GiB 内容进入 JS Blob、iframe、图片/媒体内嵌
预览或 React state。详情预检不授予内容下载权，浏览器发起下载不代表已落盘；404/失效/网络/解析错误
可见且不降级 preview。删除正式 `deliveryPath`、hash URL、fetch→Blob/内嵌二进制链与正式双读；
显式 local/test preview fixture 保持隔离，不伪装正式 owner。个人 File/workspace file 原有小对象展示另属
独立边界，不因删除 Delivery Blob 而误删。代码门需另锁文件集、TDD 及 Root 真浏览器验收，本门不触代码。

## W2-WEB-AGENT-ARTIFACT-F2-CODE：作品页实施边界（2026-09-28；S9 前历史基线）

当前正式作品页在既有 shadcn Library 页签，经具名 Artifact consumer/client 从同源 Hub 读取
BFF Product 页级 `oneOf`；空页也保留 cursor，`(conversation_id,artifact_id)` 是唯一去重、
收藏、详情、下载与来源键，预览 fixture 不作为正式失败 fallback。`src/contract/library-artifact.ts`
只校验 owner wire，`kokoro-library-artifact-client.ts` 只做浏览器同源读与原生 attachment 发起，
`kokoro-library-surface/sections` 管理 React 生命周期内列表、翻页、取消、错误和已发起状态。
已删除作品页正式 hash 列表/下载和无运行引用的旧 panel；个人文件页/1 MiB 下载不变。

专用 Hub Artifact 内容分支在成功头发出前校验精确二元路径、无 query、长度 ≤1 GiB、
Content-Disposition/Type、no-store/no-referrer/nosniff/request ID；只白名单回传安全头。
`requestWithDomain` 对该流采用 600 秒建连、1,800 秒总时长、30 秒空闲计时、Node
pause/resume 背压和严格长度/`response.complete`，Route 另计流字节并传播取消。
上游短/超字节或断流会终止已发出的响应，不能把已发成功头撤回；原生浏览器下载管理器的保存
结果也不回传 JS，因此 UI 只显示“已发起”。详情预检有可见 401/403/404/503 失败，但
内容 GET 仍由 BFF 重新授权，预检到下载之间存在竞态。最终 Proxy 仅精确无 query Artifact
GET 设 `Referrer-Policy:no-referrer`，不泛化给 Hub。Web 不存下载字节或持久 Artifact 事实。

BFF live `delivery.created` 已有二元 ID，但 Web strict Chat schema 仍拒新字段，BFF snapshot
仍 `deliveries: []`；Chat/Canvas 的身份与恢复须后续协同，不借 Library 成功宣布已切换。
此代码片的直接测试与 Root 真浏览器门分别记录在 CURRENT；3310 和共享服务不由本片触碰。

## W2-WEB-AGENT-ARTIFACT-F2：作品页 Product 接入设计基线（2026-09-28；代码前）

**当前态与目标态。** Web main `eaa7ebd56502cf05b6b402a8a013973c1904b8aa` 的正式 Library 作品页仍经
`/api/session/artifacts` 读取 `ArtifactRecord(content_hash,session_id,...)`，以 hash 去重、下载和收藏，
并以 `session_id` 打开来源；这条旧作品路径不是 BFF 新 Product Artifact 的身份或授权依据。
BFF main `55d3c9cd55386d9dcc074e893cc388924dd94c13` 已发布本人私有 FINAL CLEAN 作品
`GET /v1/library?kind=artifact`、`GET /v1/library/artifacts/{conversation_id}/{artifact_id}` 和同二元路径的
`/content`；唯一 public OpenAPI 原字节 SHA-256 为
`8a0849dcf3ae557d5f3166ad624c5eea9f42bc0b65c7a6ae7fda1741224d567b`。
Web 当前 generated 仍是 BFF `d5c868f` 的
`3f8aba161444d8b617df7ff1789e698269a4a6dd2c8b2ae7b3aaadb331947681`，未回钉本次作品契约。
本门只改四份设计/CURRENT 文档，不把目标写成已运行事实。

| 放置与依赖   | 裁决                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner / 采用 | BFF 拥有 Conversation↔Artifact 关联、Product API、当前 subject/active Conversation 准入；Storage 拥有 FINAL/CLEAN Artifact 元数据与原字节。Web 只在既有 `kokoro-library-surface`/`kokoro-library-sections` 作品页签、相邻具名单责 consumer client/state 与 `src/contract/` wire 校验，以及现有 Hub Route Handler 的**精确**作品 GET 分支实现浏览器视图；继续用 shadcn Tabs/Card/Button/Alert。Browser→Web HttpOnly Product Session/同源 `/api/hub`→BFF public→Storage，不直连 BFF/Storage。                                                                                                                                                                  |
| 淘汰         | 不建第二 Library 页面或万能大对象代理；不把个人 `asset_id`、旧 `content_hash/session_id`、MIME 或 cursor 当 Artifact selector/权限，不复用个人文件 1 MiB 完整缓冲。作品页切换后删除其正式 `/api/session/artifacts` 读取、hash URL 和 hash 键控/降级；不留双轨。显式 preview/fixture 的样本语义单独保留，不作为正式失败 fallback。                                                                                                                                                                                                                                                                                                                            |
| 列表与交互   | 作品页显式 `kind=artifact&limit=50`，只能消费页级 `oneOf` 的空页或非空纯 artifact 页；`items:[]` 也可能有非空 `next_cursor`，不能据此宣称全集为空或停止翻页。opaque cursor 只用于同查询/身份的下一页，不是快照和权限；跨页以 `(conversation_id,artifact_id)` 去重。按需用二元详情 GET 重核当前项；作品卡下载只由二元 `/content` 发起。切页/卸载取消在途列表、详情并忽略迟到响应；下载前可用二元详情 GET 给出可见预检错误，但内容 GET 仍由 BFF 重新授权且存在预检到下载的竞态。用同源原生 attachment 导航交给浏览器下载管理器流式保存，UI 只显示“已发起”，不虚称已保存完成或承诺页面切换可取消浏览器下载；加载、真空、空页待翻、失败/重试和下载发起各自可见。收藏若仍是本地 UI 偏好，应改键为二元 ID，不能沿用 hash；来源导航仅用经校验的 `conversation_id`。                                                                                           |
| 有界字节     | 精确作品 `/content` 最大 `1,073,741,824` bytes（1 GiB），而非个人文件 `1,048,576` bytes，也非通用 Hub 默认 16 MiB/15 秒。Hub 专用 GET 在发成功头前校验 200 元信息、长度 `0..1 GiB` 和安全头，采用独立总时长与空闲 deadline、断连取消传播、1 GiB 累计上限与真实背压的**流式**同源转发，不在 Web 服务器 `arrayBuffer()`/Blob 全量缓冲、磁盘落副本或调高通用默认。现有 `requestWithDomain` 的 `onData` 直接 enqueue、未显式 pause/resume，非 SSE 也无独立 idle timeout，end 未核 `Content-Length`/`response.complete`；代码门须补齐 pause/resume 背压、独立总/空闲计时、声明长度与实际长度及完整结束核对；上游断流、超限、短字节必须终止响应，不能在 Web 伪装完整 200。浏览器采用原生 attachment，不走 `fileFetch().blob()` 的最大 1 GiB 内存缓冲；页面只知下载请求已发起，真实保存完成由浏览器管理器负责。BFF 已在发头前校验原对象长度/摘要并以每进程两个 spool 名额背压，Web 不能依赖它替代自身边界。                                                                                                                 |
| 安全头/错误  | 只对精确路径、GET、无额外 query 窄透传已校验的 `Content-Type`、`Content-Length`、安全 `Content-Disposition`、`Cache-Control: no-store`、`Referrer-Policy: no-referrer`、`X-Content-Type-Options: nosniff`、`x-request-id`；最终 Next Proxy 也须对该精确路径保留 `no-referrer`。不跟 302、不暴露 ObjectStore URL/Cookie/Bearer/任意上游 header。401/403 与登录/固定租户准入分开呈现；同租户他人/错二元组/非 FINAL CLEAN 404 不泄露存在性；400 输入、429、502 owner/字节不可信、503 依赖或 `artifact_download_busy` 可见且按 owner `retryable`/`Retry-After` 提示，未知错误不自动降级旧 hash。BFF 每次列表/详情/内容 GET 重新准入；Web 不自报 tenant/subject。 |

**Chat 边界不随 Library 隐式切换。** BFF live Agent `delivery.created` payload 已包含
`artifact_id`、`asset_id`、`artifact_kind`，但 Web `src/core/chat-projection-event.ts` 的严格 payload schema
仍只接受旧 hash/path/title/mime/size/note，正式 live 事件会被拒；`SessionDelivery`、Canvas 与卡片仍按 hash
寻址。BFF `src/application/chat-service.ts` 当前 snapshot 返回 `deliveries: []`，不足以证明交付恢复。
Library F2 可先独立消费 Product API；Chat live schema/投影、snapshot/replay 与 Canvas 二元 ID 需 BFF/Web
另切协同并有恢复证据，不能由 Web 从 hash 猜 ID 或保留正式双读。只有新作品页的列表/详情/下载与负例通过
当前 commit 和真 Chromium 门，才删除**作品页**旧正式路径；Chat/Canvas 旧路径的删除须等其各自新身份与恢复链验收。
下一代码门先原字节重钉 BFF OpenAPI/生成 drift，再以直接 contract/adapter/UI/真实 Next 测试及 Root 真
IAM→Web→BFF→Agent→Storage/MinIO/ClamAV 浏览器点击、浏览器下载管理器原字节与私有负例放行；本设计门不触 3310。

## W2 个人文件下载 Web consumer 代码现状（2026-09-28；个人下载真纵切已验收）

Web 已原字节固定 BFF `d5c868f8ab8b8a33750e1286e9d020ca72895641` public OpenAPI
SHA-256 `3f8aba161444d8b617df7ff1789e698269a4a6dd2c8b2ae7b3aaadb331947681`，生成检查无漂移。
正式 `/app/library` 个人文件卡已复用 shadcn Button 和既有 `fileFetch`/`downloadFetchedFile`，按卡提供下载、取消与失败重试；
窄屏卡片仅对个人文件改为两行布局，文件名不与操作按钮争宽；异步 Blob 保存前再次核对取消信号。
`/api/hub` 仅对精确个人文件 GET 校验 1 MiB 完整原字节、类型、长度及下载安全头，其他 Hub 请求仍无条件传播取消信号。
本仓 Node22 `pnpm check` 通过（contract 100、architecture 36、Vitest 1583、lint/typecheck/build），
独立 3449 Playwright 11 pass/1 既有 skip。Root 固定 `44ee670f` 的真实 IAM/Chromium/PG/Redis/MinIO/ClamAV 用户卡片两次下载原字节、320px 布局、刷新及他人404 PASS，运行自有资源清理完成；
这仅验收个人下载纵切，完整 W2/Agent Artifact F2 等跨仓能力仍未闭环。

## W2 个人文件下载 Web consumer 设计门历史基线（2026-09-28；代码前）

**代码前事实。** Web main `224d473758041928a79acfa063eadb13cd779386` 的 `/app/library` 已有个人文件
GET/上传及 shadcn 文件卡，但卡片没有下载动作；`/api/hub/[...path]` 只转发通用
`content-type/cache-control/content-length`，Web generated public OpenAPI 仍固定下载前 BFF 来源
`6fa107540c6cc60ec8b45f1bcc19c8930f19c803b16f4c6d418c2edc9393fc52`。BFF owner main
`d5c868f8ab8b8a33750e1286e9d020ca72895641` 已发布唯一 public OpenAPI 原字节 SHA-256
`3f8aba161444d8b617df7ff1789e698269a4a6dd2c8b2ae7b3aaadb331947681` 与
`GET /v1/library/files/{asset_id}/content`；这是 **BFF 已实现、Web 尚未消费**，不等于浏览器可下载。

- **Owner / 采用：** Web 仅在现有 `KokoroLibraryFiles` 个人文件卡复用 shadcn `Button` 和既有 `fileFetch`/`downloadFetchedFile`；文件卡保持单项下载中、失败、重试、取消状态。现有 Hub adapter 仅在精确 `GET /api/hub/library/files/{asset_id}/content` 增加二进制响应头校验/白名单透传。
- **淘汰：** 不建 `/app/files` 新页、通用下载代理或第二条下载协议；不复用 Agent 作品 `content_hash/session_id` 与旧 Artifact 下载；不把 Storage 签名 URL 交给浏览器。
- **依赖：** Browser → Web 同源 Hub adapter（当前 HttpOnly Product Session）→ BFF public GET → Storage owner；`asset_id` 来自已校验的个人列表项，但不是授权凭证，BFF 每次依当前 tenant/subject 重新准入并只返回 CLEAN ASSET 的完整已校验原字节。Web 不提交 tenant/subject、Storage scope 或凭据。
- **状态/失败：** 按卡禁重复点击；卸载/切页取消在途请求且忽略迟到结果。只在 HTTP 200、有效下载头与完整 Blob 获取后触发已有锚点下载；就近展示 401/403、私有/失效 404、429、网络/502/503 与畸形响应，主动取消回到可操作状态，不把失败显示为空文件或上传失败。可重试错误由用户显式重试；404 不泄露文件所属信息。
- **安全头/文件名：** 精确 GET 成功时只接受并转发经校验的 `Content-Disposition`、`Referrer-Policy: no-referrer`、`X-Content-Type-Options: nosniff`，以及现有类型/长度/`no-store`；不开放上游任意 header、重定向或跨源浏览器 fetch。锚点文件名使用已校验的当前文件项名称，不能把上游 header 原样注入 DOM；坏/缺失安全头不产生成功下载。

先原字节固定 BFF OpenAPI commit/digest 与生成消费者，再实现精确 Hub GET、文件卡和直接测试；不新增页面、模块或
持久事实。Web 单仓 Node22 `pnpm check`、独立端口 Playwright 与直接 200 原字节/404/坏 header/取消测试仅是本仓门；
Root 还须在固定 BFF/Storage/IAM/MinIO/ClamAV 真组合用 Chromium **点击文件卡按钮** 核对原字节、刷新及同租户
他人不可见，方可宣布该用户下载纵切闭环。Agent Artifact F2 是后续独立切片。

## W2 个人文件可见上传代码片（2026-09-28；历史切片，已由 Root 验收）

**代码前基线与 owner。** Web main `29673babe37d01a2fbf7d0347f99d8e04c22da16` 已在同一
`/app/library` 用 shadcn Tabs 默认显示个人文件，另一页签保留 Agent 作品；个人列表由现有同源
`/api/hub/library?kind=file` 读取。现有 Hub adapter 已为精确
`POST /api/hub/library/files` 设置整个请求体 1 MiB、上游 50 秒边界，Root 已通过隔离真实链验证
同源 POST→CLEAN→个人 GET/刷新与同租户他人空页，但该基线正式页面尚无上传控件，Web generated public
OpenAPI 仍固定 BFF `a67ae2d` 只读版本。唯一新 public 写契约已由 BFF owner
`8a90fdd9ec3809000924229bfc7b986ba8ba1522` 发布在
`contract/openapi/v1/openapi.yaml`，原字节 SHA-256
`6fa107540c6cc60ec8b45f1bcc19c8930f19c803b16f4c6d418c2edc9393fc52`；Web 只消费固定
来源，不编辑第二份 OpenAPI。

| 放置项 | 裁决 |
| --- | --- |
| 采用 | 在既有 `kokoro-library-files` 的个人文件页签放可见的 shadcn Button/Input/Alert；同一 feature 的独立 upload client/交互状态负责单文件意图、同键重试和 GET 刷新；`src/contract/` 增加仅校验 BFF 上传回执的 wire schema；复用既有 Hub adapter，不增加 route。 |
| 淘汰 | 新建 `/app/files` 页面会拆裂 Library；复用 Project scope/选择器会混淆个人与项目授权；复用 Artifact hash 下载或把 Asset cast 成作品会混淆身份；空泛 upload 框架没有独立 owner。 |
| 依赖/事实 | Browser→Web `/api/hub/library/files`→BFF `POST /v1/library/files`→Storage；BFF 负责 Product 准入、幂等 receipt 与个人 scope，Storage 是 Upload/Asset/Scan 唯一 writer。Web 不传 tenant/subject/scope/project，不持久化 Asset 或扫描事实。 |
| 失败恢复 | 每次**文件意图**持有唯一 `File` 与 `Idempotency-Key`，提交中禁双击；网络断开、响应未知、已发请求后的 408/429/全部 5xx 及 `409 idempotency_in_progress` 保留同一 File/key，明确由用户重试；扫描待定和幂等处理中显示稍后同文件重试，不误报失败。`409 idempotency_conflict`、`409 file_upload_aborted` 和 `422 library_file_infected` 是该意图终态，不能以同键误重试。上传意图放在切换页签仍挂载的 Library feature 状态，不因 Radix 页签卸载丢失待确认 File/key；卸载页面或切新意图不得把迟到结果写回，不把未知结果声明成功。 |
| 成功可见性 | 严格校验 200 回执的 `kind:file`、CLEAN、`asset_id`、文件名与大小后，重新调用个人 `GET /api/hub/library?kind=file`；只有 GET 返回的本人 CLEAN 项进入持久列表，GET 失败显示可重试读取错误，不把 POST 回执伪装成列表。 |

目标交互为单文件选择、显示文件名与限额、显式提交/上传中/成功/错误/同键重试；不可用、键盘焦点、移动端与错误信息沿用本页 shadcn 语义样式。浏览器构造 multipart 后按**整段 body**计量，超出
1,048,576 bytes 在提交前就近提示；`File.size` 仅可作预筛，BFF 与现有 Web adapter 的整体上限仍是最终裁决。刷新或重新选择文件是新意图，不能把未知结果的旧 key 自动套给不同文件；未知结果需明确保留当前页面的 File/key 供用户重试，不承诺浏览器重新载入后恢复原 File。正式模式不回退 preview。

**已发布实现。** 已原字节重钉当时 BFF 上传 OpenAPI，复用现有 shadcn 个人文件页签。`kokoro-library-file-upload-state` 在仍挂载的 Library 页面保存 File/key 与状态，`kokoro-library-file-upload-client` 先快速拒绝 `File.size > 1 MiB`，其余用原生 FormData 构造 Request、读取 clone 的实际完整 multipart 字节数，再发送原 Request；不手拼 boundary。CLEAN 回执仅递增刷新版本，既有文件 GET state 重新请求；GET 失败显示读错误，不插入 POST 回执。UI 聚焦与 native multipart contract 测试覆盖成功后 GET、读取失败、未知响应同键重试、可恢复 408/429/5xx/待扫/处理中 409、冲突/中止/感染终态、整个 multipart 超限、双击和页签切换、作品旧行为。Root 隔离 Node22 `pnpm check`（contract 99、architecture 36、Vitest 1546、lint/typecheck/build）与隔离 3447 Playwright 11 pass/1 既有 skip 已通过；固定 Root `0a9206969b2edfcf40bb8d5f0f2d85952995fb8f` 的真实 Chromium **UI 点击**上传、刷新、同租户他人私有、EICAR/同键回放和并发门已 PASS。本片无新路由/持久数据；BFF 下载 public 契约现已发布，但 Web 下载 consumer 与 Agent Artifact F2 均是后续独立代码片，不借上传片放按钮。

## W2 Library 个人文件页面代码片（2026-09-28；已发布的只读基线）

历史代码前基线：`/app/library` 的 `KokoroLibrarySurface` 仅显示 Agent `ArtifactRecord`，正式 GET 是
`/api/session/artifacts`；开发环境也已不再隐式退回 preview。Web 固定的 BFF public OpenAPI 仍为
`31c4803`/SHA-256 `87b1ff3a39f5fa0a67cabdf6b78df59697874bd817aa218ca676ec1472ec15e6`，
不含 BFF 新 `kind=file` 成功契约。该只读切片随后已原字节重钉 BFF owner `a67ae2d`，SHA-256
`82df2303f9f86e9b4caa4b5965f930735740d8c044c955450e45406dc29cabb9`；当前 Web main 已发布，Root 真浏览器个人列表/刷新/隐私正向已验。

当前实现：复用现有 Library 页面和成熟 shadcn `Tabs`，默认“个人文件”，另一页签“Agent 作品”保留原
Artifact 读取、筛选、收藏、来源和下载语义。文件页签独立读取同源
`GET /api/hub/library?kind=file&limit=50[&cursor=...]`，由现有 Product Session adapter 转 BFF
`GET /v1/library`；只以 `asset_id` 标识文件，不把 Asset cast 成 `ArtifactRecord` 或复用
`content_hash/session_id` 动作。文件列表仅投影已校验的文件名、类型、大小、创建时间；此只读切片当时尚无个人
Product 上传/下载契约，故当时未放上传、下载或来源假按钮。上传控件已在上节后续切片发布；BFF 下载 public 契约已发布但 Web 下载按钮仍待本次后续代码门。显式 preview 可保持本地样本语义，但不能伪造正式成功页。

放置裁决：采用现有 `kokoro-library-surface` 作页签组装，在同一 feature 拆文件列表/读取状态，
在 `src/contract/` 增加独立文件 wire 校验；复用 `/api/hub/[...path]`，不新建 route、顶层模块或缓存。
淘汰另建 `/app/files`（拆裂同一 Library 导航）和给 `ArtifactRecord` 添加可选 Asset 字段（混淆身份及生命周期）。
首次/翻页分别有 loading、真实空页、错误与手动重试；切换页签/卸载取消请求并忽略迟到结果，
按 `asset_id` 去重并阻止重复 cursor。本片已有 BFF 新 OpenAPI 原字节 pin/生成检查、独立 Zod consumer、
组件测试与 Node22 单仓门；Root 随后已在固定来源真登录浏览器验个人列表刷新/隐私。该证据不覆盖本次可见上传 UI。

## W2 正式项目创建纵切（2026-09-28）

当前态：rail `useAppFrameProject.createProject` 无条件生成 `preview-project-*`；欢迎页的“新建专案”也先生成 preview ref。正式模式因此跳转到 BFF 中不存在的项目。BFF 是 Project 唯一 writer，既有 `/api/hub/[...path]` 同源 adapter 已支持 POST 和透传 `Idempotency-Key`；Web 无 Project schema 或事务。

目标态：显式 preview 仍只用本地 fixture。正式新建入口统一由现有 app-frame project hook 管理一次创建意图，保留点击时的草稿、唯一幂等 key 与请求 name；同一意图的并发点击不重发，未知结果后无论从错误条、rail 或欢迎页重进都用原 body/key 重试，且展示就近错误，不把 preview ref 当作成功。经 `/api/hub/projects` POST 到 BFF `/v1/projects`；只有严格校验 `ProjectResponse.data.project` 的 canonical `id`、`slug` 等字段后，才写入一次性 draft handoff 并按 `id` 导航。终态冲突才释放意图，新点击可使用新 key；Web 不静默把未知提交改成新意图。BFF 授权、幂等 receipt、slug 唯一性和持久状态不在 Web 复制。

放置裁决：采用现有 app-frame hook（UI 意图/导航）、项目 consumer validator/client（wire 校验与同源 POST）、现有 hub adapter；不在欢迎页或 rail 自建第二 BFF client，不新建 API route/模块，也不把临时 create 状态保存为 Web Project 事实。新校验文件只因 ProjectResponse 与 resource 页面语义不同；生成 OpenAPI 保持 owner 原样。验证聚焦 unit/contract/UI，随后 Node22 `pnpm check`、生成 drift 与 diff check；真实 BFF 联调仍需 Root 在固定提交后执行。

草稿归属：Direct Chat 的 `__pending__` 与尚无 conversation 的 `__project__:{projectRef}` 是不同本地编辑键。显式创建 handoff 一次性封套把 A 草稿写进 A 项目键；A 请求期间新编辑的 Direct B 草稿仍留 `__pending__`，返回 Direct 后可恢复。原有 Direct→既有项目 rail 导航无显式封套时，只在该项目没有草稿时复制最后的 Direct 草稿，不把两者重新共享一个键。BFF POST 已成功而导航回调失败时保存已确认 canonical id，重试只重新导航，绝不重发 mutation。consumer 对 BFF 将来增加的兼容字段容忍，但 id/slug 与必需 Project 字段严格校验。

## W2 项目资源 GET consumer 当前方案（2026-09-28）

BFF 是 Project/owner 资源列表的唯一事实与授权入口，Storage 保留 Asset/CLEAN 事实。Web 无资源数据库、
Redis cache、下载 URL、第二查询 API 或跨 owner join。BFF main `31c4803b3df0e90c031a97844f89df384ca1a35c`
的 public OpenAPI 原始字节固定在 `src/generated/bff-public-openapi.yaml`（SHA-256
`87b1ff3a39f5fa0a67cabdf6b78df59697874bd817aa218ca676ec1472ec15e6`）。

当前代码路径：`useAppFrameProject` 按当前 projectRef 绑定读取回调 → browser-private `/api/hub/projects/{id}/resources`
→ BFF GET；`src/features/app/project-resource-list.ts` 固定每页 50、只读 opaque cursor、`no-store`/AbortSignal，
`src/contract/project-resource.ts` 严格校验 CLEAN 页面并投影 camelCase。`use-project-resources.ts` 仅持有
页面内列表/请求状态，首次进入和项目变更重新 GET，取消旧请求且用请求序号拒绝迟到页；增量页以 assetId
去重，错误不转成空页。浏览器不接触 tenant/actor 或 Storage URL。POST 200 仅确认该 mutation，随后 owner
GET 成功才把资源加入持久列表；刷新失败显示 read 错误，不同键重发 POST。preview fixture 仅 explicit
preview 模式使用，并纳入 workbench remount key 防止 live/preview 状态串用。

放置裁决：复用现有 `/api/hub` 同源 adapter 和项目 feature；不在组件里直接拼上游 URL，也不新建
GET route/缓存。读取 client 与上传 mutation 分文件，因请求方法、错误与测试边界独立；分页 React hook
只管理界面状态，不拥有业务事实。失败恢复由用户重试 GET；不自动循环分页，不影响 BFF 的权限校验。

## W1D-WEB-IAM-DIRECT-CUT 当前实现（2026-09-26，Root 集成待验）

### Owner、切片前基线与当前职责

Web RP 与浏览器同源安全边界由 `kokoro-app` 唯一维护；identity、issuer Session、token 与授权事实仍只属于
IAM，`/iam` relay policy 与转发仍只属于 BFF。切片前生产源码中唯一读取 `KOKORO_IAM_BASE_URL` 并直接请求
IAM 的入口是 `src/lib/server/auth.ts`。该文件当时保留旧 magic-link、refresh、revoke、team-session、
`kokoro_auth_nonce` 与 AES-256-GCM `kokoro_session` helper；`src/lib/server/session-envelope.ts` 只服务这套旧
sealed envelope。切片前旧 `POST /api/auth/logout` 与 `GET /api/auth/session-state` 消费这些 helper；当前两条 route
和 helper 均已删除，Auth.js catch-all 对旧 URL 显式返回 404，不接受旧 cookie。
`src/app/api/auth/[...nextauth]/route.ts` 已独立承接正式 Product Session 主链：`GET /api/auth/session`
只在线核对 Redis generation/expiry 并返回非敏感只读投影；`POST /api/auth/session` 先验证 Auth.js CSRF，
再执行 refresh reservation、经固定 BFF `/iam` relay 的 IAM token refresh、BFF `/v1/me` 身份重核与 finalize CAS，成功后推进 generation、
轮换 Product Session cookie 并返回新投影；`POST /api/auth/signout` 承接 tombstone、远端 revoke 与 issuer
confirmation。正式三条 operation 都不是旧路由的 alias。

本切片已删除 `auth.ts`、`session-envelope.ts`、两条旧 auth route 及其失效测试/配置引用，未触碰 Auth.js
OIDC callback、Product Session cookie、在线 generation、refresh 双 CAS、tombstone 或 issuer logout-confirmation。
当前跨仓调用方向只有 `Browser → Web same-origin adapter → BFF → IAM`；Web 生产源码不再读取 IAM base URL，
也不再持有旧 sealed session/nonce 的第二身份通道。

### 放置与粒度裁决

| 项 | 裁决 |
| --- | --- |
| 方案 A：留下瘦 `auth.ts` | 淘汰。文件只剩通用 Origin guard，却继续暗示它拥有登录、会话或 IAM client，保留错误 owner 名称并为后续代码重新塞回认证职责留下入口。 |
| 方案 B：既有 `src/lib/server/` 下新建 `same-origin.ts` | 采用。目录已经承载 server-only HTTP 边界；文件只拥有 `sameOriginOk(request)` 一项同源判断，不新建目录、auth facade、兼容 re-export 或第二套 CSRF。 |
| 依赖方向 | 六个现有业务 route 直接依赖 `same-origin.ts`：`api/session/[...path]`、`api/hub/[...path]`、`api/team/[...path]`、`api/scheduled-tasks/[[...path]]`、`api/billing/checkout`、`api/billing/mock-pay`。`same-origin.ts` 不依赖 Auth.js、Product Session、BFF client、IAM config、Redis 或业务 contract。 |
| 保留语义 | `sameOriginOk` 原样保留现有行为：有 `Origin` 时解析并与 `Host` 比较，缺 `Host` 才回退 request URL；畸形或不匹配拒绝；缺失 `Origin` 继续交由各 route 既有方法门、Cookie/SameSite 与相邻 CSRF 约束处理。本切片不借重命名改变状态码、错误体、Bearer、幂等、SSE 或 body 限额。 |
| 删除项 | 删除旧 IAM 直连、magic-link/refresh/revoke/team-session helper，`kokoro_session`/`kokoro_auth_nonce` sealed 路径，两条旧 auth route、对应测试和仅服务旧路径的配置引用；不保留 alias、fallback、双读或双 cookie。 |

### 失败恢复与验证

这是一项 clean-slate 删除，不增加迁移期双轨。旧 URL 经 Auth.js catch-all 显式返回 404；调用方继续只使用正式 Auth.js
session/signout。`sameOriginOk` 搬迁失败在 architecture/typecheck 阶段暴露，不回退导入 `auth.ts`。正式
Product Session 的 Redis 失联、refresh 竞争、logout tombstone 与远端撤销未知仍按既有 fail-closed 状态机
恢复；本切片不新增 Redis key、重试队列、缓存、事务或补偿事实。

实现片先以 architecture RED 证明生产源码仍存在 IAM 直连、旧 route 或 sealed cookie，再 GREEN 删除；随后覆盖
六个消费者的允许/拒绝 Origin 与既有错误行为、Auth.js session/signout、Product Bearer/CSRF、OIDC 登录与退出。
单仓已执行 Node 22 `pnpm check`（contract 69、architecture 36、Vitest 1474、lint/typecheck/build）与
独立端口 E2E 11 pass/1 预期 skip；生产 Next `/app` 为 private no-store、旧 URL GET/POST 为 404。
Root 固定 SHA 的真实 Product Session 登录/退出及 main-only/compatibility 门仍待集成复验；
下节记录本切片后最新的 relay 来源。

## 当前 W1E IAM relay 来源（2026-09-26）

Web 只读消费 BFF `1105553cfc24d4f44a90f626132bc30323a77946` 的 policy `2.1.0` 原始字节，
SHA-256 `8f7d4f4cb6fa0ec34d2cce8702d8882d3270a316a6cbdb2d8bdaccefb9c6b4a1`；其 IAM owner 为
`a4c2b61467f1fc1772d6b6d8e98f081c090289fb`，OpenAPI `0.6.0`/SHA-256
`392ca0e49544c0ec6e0d2fa782c46c33c1847e2c350102e7ad3b8af43f858ced`。复用现有 `src/generated/iam-relay-policy.json`
及 `src/lib/server/iam-relay-policy.ts`，不新增路径或第二来源。唯一变化是 provenance；登录/邀请状态机和失败恢复不变。

## W1D IAM relay 来源（历史验收）

唯一静态 `/iam/interactions/invitation` 已实现独立 issuer 登录/注册、recipient-only context 与
一次性 CSRF 约束的接受/拒绝；接受仅在 owner 200 后转 `/login`。Web 当前固定消费 BFF main
`bc45632b8654db7e06eb9878bb4d7a609d12dc7b` 的 policy `2.1.0` 原始 blob，SHA-256
`b18a559d162509c3029908b2e1c77ee7e59ed6af61b82e18be6b2e7669a0ef0c`，其中 IAM owner
`6a55ffb4c22f0b155ddb83157735c0ace766701d`；本切片只替换现有只读生成快照、运行 provenance 与相邻断言，
无新目录、协议、SQL、Redis 或 UI 行为。Web 不自行编辑 BFF policy；BFF owner commit 的 artifact 原始字节
是唯一来源，运行时继续校验版本、IAM commit、OpenAPI 摘要与关键路由。
下节“目标态，尚未实现”指 `63aca94` 时的设计门历史基线；真 SMTP/HTTPS 浏览器及用户 3310 尚待 Root 验收。

## R5-INVITE-WEB-ENTRY：独立邀请入口设计门（目标态，尚未实现）

**当前态与唯一来源。** Web main `63aca94f93095722425340a0a95985e8796a5b33` 仍消费 BFF relay policy `2.0.0`，没有
`/iam/interactions/invitation` 静态路由；`/iam/[...path]` 只允许既定 issuer GET，`/auth/sign-in` 只接受 OAuth 签名 query，
`/login` 只启动已具备成员资格后的 Product RP OIDC。任何一个都不是未入组收件人的邀请入口。BFF main
`d6dc8a0ea5a3fee7a4f54f01fefdeff0e28892e7` 已发布 policy `2.1.0`（SHA-256
`b3ff912e70858cc5a5cf7bdbc597c8872ab29c5bfec4dfbe070ce4b37500239d`），固定 IAM
`ac94f152daffa2293801ea4f56f98b3ae59452d7`/OpenAPI `0.4.0`，它是目标 Web 只读消费来源；Web 尚未重钉该 artifact，
本文不是已上线或 3310 已打通的证据。下文的 policy 2.0.0 和早期邀请空缺描述是历史基线，不与本目标并行运行。

| 设计门 | 裁决 |
| --- | --- |
| Owner/当前入口 | IAM 唯一拥有 User、issuer Session、Invitation、Member、recipient/expiry/role 与审计；BFF 只拥有固定 browser-private relay；Web 只拥有页面、表单状态、同源 Route Handler、一次性 CSRF。当前 Web `src/app/iam/[...path]`、`src/app/auth/sign-in`、`src/lib/server/iam-interaction-csrf.ts` 已存在，邀请静态路由和 2.1.0 consumer 未实现。 |
| 放置选择 | 采用唯一 `src/app/iam/interactions/invitation/route.ts` 静态 GET/POST，并窄化复用现有 server-only relay transport、issuer Cookie 过滤、交互页面壳与 CSRF 算法；拒绝扩展 `[...path]` 通配、把未入组者送 Product `/login`、复用 OAuth 签名专属 `/auth/sign-in`，也不新建独立登录 SPA 或第二套认证 store。现有 CSRF binding 只覆盖签名 OAuth path，须为邀请 ID/动作单独扩展绑定而非原样误用。 |
| 依赖/数据 | Browser → Web 静态同源入口 → BFF `/iam/*` → IAM。Web server-only `KOKORO_TENANT_ID` 决定 path tenant，Web origin/service secret 只在服务端；浏览器不能自报 tenant/actor/recipient，不持有 service credential。只固定消费 BFF policy/blob，不复制或编辑 IAM OpenAPI；无 Web SQL/Invitation 副本、跨仓事务、缓存或持久 receipt。 |
| 删除项 | 不创建 `/auth/invitation` 假入口或 alias，不保留可见“连接中／整页重试”页面、通用 proxy、旧 policy 双读或未验证时的 Product fallback。 |
| 验证 | Web Node 22 的 `pnpm contract && pnpm test:architecture && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`；Root 固定三仓 SHA 的真实 PG/Redis/SMTP/HTTPS Chromium 首登、已有账号、错人/过期/并发、cookie Path 与 Product OIDC。构建须隔离 `.next`，不触碰用户 3310。 |

**唯一交互状态机。** 邮件链接只允许精确 `GET /iam/interactions/invitation?id=<canonical-lowercase-UUID>`，
`/iam/verify-email` 来源的失败跳转只允许再追加一个 policy 枚举 `error`。页面验证原始 path/query、Web origin 和长度后，
只用固定 tenant 和过滤后的 `Path=/iam` issuer Cookie 向 BFF GET context。无有效 issuer Session 时，同一静态入口呈现**独立真实**
邮箱/密码登录与新邮箱注册表单，不触发 Product RP；登录调用既有精确 `/iam/sign-in/email`，注册调用新增精确
`/iam/sign-up/email`，其 `callbackURL` 由服务端根据当前 canonical ID 构造，绝不信任表单自报。注册 200 不代表登录：只显示
“检查邮箱”的局部状态；IAM 邮件验证完成后精确回到同一静态入口，新用户重新登录 issuer Session。已有用户登录后重新 GET
context；只有 IAM 返回 recipient-matched pending context，才显示组织、角色、到期与接受/拒绝操作。不能从邮件地址、邀请 ID、
Product Session 或匿名页面自行推断收件人和权限。

每个写表单都要求同源 Origin、严格字段/大小限制及 Web Redis 一次性 CSRF；接受/拒绝的绑定至少包含固定 Web origin、静态 path、
canonical invitation ID、动作、issuer Cookie 摘要及短 TTL，`GETDEL` 消耗后才注入 Web service credential 发往 BFF。注册与独立
issuer 登录也要有同源、一次性 CSRF，但注册尚无 issuer Cookie，绑定不能假设有登录 Session。Web 响应和日志不包含密码、
验证 token、原始 owner 错误、完整敏感 query；页面用受控文案、`no-store`、`same-origin` Referrer-Policy、request ID，凭据错误留在表单附近，
不跳转到整页重试。四种邮箱验证失败码只映射固定用户文案，不渲染原始 code/message/query。错人/不存在/终态 context 保持
不可见 404；过期或租户停用按 IAM 契约显示安全终态，不暴露邀请详情。非成功、超时、取消、Cookie/contract/依赖异常
均不创建 Product Session；写操作无 receipt，绝不自动重试。accept **200** 才导航 `/login` 启动 Product OIDC；reject **200**
仅显示完成。若 POST 结果未知，重新读取 context 仅用于观察可见 pending 状态，终态 404 不能证明接受成功，不据此启动 Product
登录或盲重放写入。签入/注册/预览/应答/完成均在同一紧凑页面内呈现局部状态，不出现“连接中／整页重试”中转设计。

邀请页的 `same-origin` Referrer-Policy 不向跨站请求发送邀请 URL，同时保留浏览器同源表单 POST 的
`Origin`，供严格同源校验使用；`no-referrer` 会使 Chromium 对该 POST 发送 `Origin: null`。邮箱验证
`/iam/verify-email` 继续使用更严格的 `no-referrer`，两种路径不可共用响应策略。

实现顺序是固定 BFF policy 2.1.0 digest/provenance/路径门与负例 → 静态 route + 独立登录/注册和 CSRF → context/accept/reject
及响应安全 → owner 与真实浏览器组合。只有最后一门通过，才可将本节从目标态改为已闭环。

## W1C 固定部署租户收敛（设计门，2026-09-24）

当前 `GET /login` 已是无可见中转页的服务端 OIDC 启动；Team 切换器和
`/api/team/switch` 已删除。issuer 的 `/iam/interactions/select-tenant` 已改为
仅 GET 的服务端固定租户续接：无选择表单、候选列表、浏览器 POST 或 CSRF
token，缺失 issuer cookie 直接拒绝。Web RP callback/refresh 已在线核对部署租户。
现有 RP/会话适配使用部署配置 `KOKORO_TENANT_ID`，仅在服务端读取；已验证
OIDC subject/tenant 再与 BFF owner `GET /v1/me` 投影比对，匹配后才创建或刷新
Product Session。Web 不自验 JWT tenant、不读取 IAM/BFF 数据库、不建立第二身份
事实源。BFF `/v1/me` 和 IAM 第一方 client 续接均已由各自 owner 发布；Web RP
准入消费已实现，真组合验收仍待完成。失败保持零可用 Product
Session，不恢复“连接中／整页重试”页面。

放置选择：复用 `src/app/iam/interactions/select-tenant`、现有 RP/会话适配和
`src/ui/team`（采用）；新建登录 SPA/通用 IAM proxy/第二身份 store（淘汰）。
Web 无新 SQL、Redis 事实或跨仓写入；BFF/IAM 各保持唯一契约 owner。

当前 browser-private relay 固定 BFF `dd605c99e9bb5c6669ec31e04e285e5f92b79ed0`
的 policy `2.0.0`，artifact SHA-256
`74893ba4e566e4824a278cd3ee1548030a33435f9b37b7026a8a7e943c080037`，
IAM owner `ad5224a9e0a3a31d1c593d214d37940d6923b2e7`。此片仅按 BFF owner
来源原样复制快照并更新 commit/digest 断言；IAM allowlist/vendor digest、route/header/cookie/限额、
Web 运行语义和数据边界不变。`/organization/list`
已从 Web GET allowlist 删除；`/organization/set-active` 仅由上述 server-only
signed continuation 调用。下文 W1C-2B-2 与 R2e 的选择表单、policy 1.x 描述为
原始发布基线，已被本节取代，不是当前实现依据。

## 公开入口与单租户登录边界（当前切片）

签名 IAM 表单的 GET 必须签发一次性、原始签名 query 绑定的 CSRF cookie。当前由 `src/proxy.ts` 对精确 GET 签发证明并内部 rewrite 至 `src/app/auth/sign-in/form/page.tsx`；该页复用本仓真实 shadcn Card/Input/Button/Label/Alert 与 Next layout。内部页直达 404，rewrite 二次进入 Proxy 时以服务端 HMAC 证明准入。原路径 POST 仍是唯一凭据链，严格 Origin/Host/原始 query/一次性 CSRF；401/429/503 经短时加密反馈 cookie 303 回同一签名 URL，GET 重新签发 CSRF 并在同一表单显示错误、保留邮箱而清空密码。登录响应不缓存，Referrer-Policy `origin` 不把签名 query 发送给资源请求。

`/` 渲染固定 Kokoro 公开首页，`/login` 仅是服务端 Product RP OIDC 启动路由，`/app` 由在线 Product Session 决定访问；System runtime manifest 仅在有效时覆盖动态展示，不是核心工作台闸。公开首页和登录入口不请求 System manifest；单租户产品身份来自本仓 `src/config/brand.ts`。进入 `/login` 后由服务端经固定 Auth.js CSRF 和 `kokoro-iam` provider 建立 RP transaction，浏览器直接跳到 IAM `/auth/sign-in` 邮箱/密码表单；不再渲染“连接中／整页重试”的中转页，不把凭据搬到 Product RP。OIDC 启动失败不自动循环，返回无假表单的 503；IAM 表单凭据失败保留邮箱、清空密码、签发新一次性 CSRF 并在同一 React 表单内显示受控错误。`/auth/sign-in` 仍是 IAM issuer 签名交互入口，与 Product `/login` 语义不同；当前桌面为品牌侧栏加表单、移动端为单列表单。`/preview/marketing` 与未使用的 `HomeGate` 已删除。验收覆盖无后端时公开页正常、登录入口诚实失败且零 manifest 请求、服务端 CSRF/OIDC，以及固定 SHA 的真实三仓 Code+PKCE/Product Session。

状态：当前架构与 W1C-2 目标设计，2026-09-23。W1C-2A 只读 GET relay、W1C-2B-1 sign-in
已发布；W1C-2B-2 tenant/consent 已发布。W1C-2C RP-only 已发布；W1C-2F-S1 Product Session 基础、Web Redis 双 CAS 与标准 session/signout route 已发布，S1 真实三仓 HTTPS 组合已通过；S2-A 普通业务代理组合已通过固定三仓真 HTTPS。

W1C-2B-1 已发布 `/auth/sign-in` 的受控表单与两步 IAM sign-in/continue POST，不改变
`/iam/*` 直接 browser POST 全拒绝、旧认证路径或 Product Session。GET 保留原始签名 query 字节；Web
旧切片的三条 issuer 交互 GET（sign-in、select-tenant、consent）曾共用无脚本品牌 HTML/CSS 外壳；当前 sign-in 已改为上述 React 页面，其余交互仍使用旧外壳。
历史外壳桌面双区、窄屏单列，字段垂直排列并保留键盘焦点可见；外壳只接收固定文案和调用方已转义的表单片段，
不处理凭据、CSRF、签名 query 或 POST。表单字段名、action 原始 query 与后续安全校验保持原契约。
自有 Redis key 保存随机 token 摘要对应的目标 POST method/原始 query/issuer-cookie 绑定摘要，TTL 300 秒；POST
精确 Origin、Host、URL、Cookie/hidden token 配对后以 `GETDEL` 原子消耗，Redis 故障拒绝。
`redis@5.12.1` 与本组合 BFF 版本对齐并固定在 manifest/lockfile；仅 server-only
`src/lib/server/iam-interaction-csrf.ts` 与 2C 的 `oidc-rp-transaction.ts` 静态引入，架构测试限制 browser/import 越界。
`KOKORO_WEB_REDIS_URL` 仅服务端读取，Web origin 哈希隔离 key 前缀。不重签/归一化 IAM query，
历史 sign-in HTML 失败曾直接返回受控 401/429/503；当前 HTML 模式按上节的 303 回表单，非 HTML 模式仍返回受控原状态；两者均不透传原文 body/cookie，也不调用 continue。成功的
continue 原生 302 经 Location 校验保留；IAM 实际 200 `{redirect:true,url}` 必须通过精确 shape、
固定 Web origin 与允许交互路径校验，再转成无 body 的浏览器 303 导航，合法多 issuer cookie 保留。
测试只按本次随机 token 的精确 key 清理，不扫描/删除同前缀的其他 key。已发布的 2B-2 新增
`/auth/*` 外层引导与 `/iam/interactions/*` 真正 tenant/consent 表单；Product Session 仍属后续切片。

W1C-2C 已发布的**RP-only 基线**仅安装 RP transaction、callback、经固定 BFF relay 的 server-only token/userinfo。
Code+S256、state、nonce、固定 issuer/client/redirect URI/resource 验证成功后，因 Product Session
当时尚未安装，回调只返回受控 `503 product_session_unavailable` 并清除 RP 事务；S1 工作树成功回调改为建
Web 在线 Product Session、清 RP cookie 后 303 到 `/app`，失败/重放仍按原受控拒绝；不建立旧 sealed session，
不把 token、code、userinfo 正文或上游错误返回浏览器。Redis 仅保存一次性 RP state 摘要与短期事务绑定，
不保存 token/PII；S1 实现自身刷新/退出；S2-A 已切换普通 BFF Bearer 代理与 UI 登录/探针/退出主链，旧 route/Team 路径删除留给 S2-B。
IAM consent 成功的 callback 实际带唯一 `code`、`state`、`iss`；relay 和 RP 都只接收这三键且
`iss=${KOKORO_WEB_ORIGIN}/iam`，随后将完整 query 交 `openid-client` 再验证 issuer。
受控入口拒绝浏览器覆盖 `resource`、`scope`、`client_id`、`redirect_uri`、`callbackUrl`（含重复键），
固定 Web origin、`${KOKORO_WEB_ORIGIN}/iam` issuer、单 provider `kokoro-iam` 与唯一
`resource=https://kokoro.dev/resources/iam-internal`。Auth.js v4 自定义 `token.request` 必须
调用验证型 `openid-client` `client.callback(..., checks, {exchangeBody:{resource}})`；仅直接构造
`TokenSet` 不执行 ID token 签名/issuer/audience/nonce 校验。token Basic 与 userinfo Bearer 仅在
server-only BFF backchannel 加入，userinfo `sub` 与已验证 ID token `sub` 一致；浏览器直打
`/iam/oauth2/token|userinfo` 仍拒绝。Auth.js CSRF 与精确 Origin 叠加，Redis state `SET NX`
登记、`GETDEL` 一次消费，失联拒绝；回调/code 重放、错误与超时均不建会话。
IAM 实际 ID token 签名算法固定为 EdDSA；Auth.js client metadata 显式 pin `id_token_signed_response_alg=EdDSA`，
真实 Next fixture 同时提供 Ed25519 与 RSA JWK，RS256 即使签名正确也拒绝。token、userinfo、JWKS
分别经独立受限 Node Agent，绝对 5 秒和响应头/正文累计 1 MiB 上限，超限/慢滴流销毁 socket；
Route Handler 的 `request.signal` 传到 token/JWKS/userinfo Agent，浏览器中断时当前 BFF socket 即销毁、
后续 backchannel 不发起；不改 `openid-client` 全局默认或绕开验证型 callback。

## R2e-IAM-VERIFY-WEB：邮箱验证链接的同源消费设计（本提交已实现，真 IAM 待验）

**起始态与来源。** Web `main` 基线 `0a093f65bdc4990b956b10ae534198e3b4b5c3b5` 的
`src/generated/iam-relay-policy.json` 及 `src/lib/server/iam-relay-policy.ts` 当时固定 BFF
`eb1eb2926d08b8a3779898b2c31e604a8585ec8b`、policy `1.0.0`、blob SHA-256
`ddfdb1f335d87d7b7c904a23c589e33c1f938908188313e8c20e56223bde5d53`；浏览器 GET 集合没有
`/verify-email`，正式邮件链接 `${KOKORO_WEB_ORIGIN}/iam/verify-email?<query>` 在基线不可达。BFF owner
当时在 `main` `dadf9264116ea9df2c0886c4af84bacb67aa6e41` 发布 policy `1.1.0` artifact，SHA-256
`97022ea8727619bae03927027ef6a8ce87a3d2da4580ba5d211dc63b16fdc42c`；原始切片仅新增精确
`GET /verify-email`，该历史切片只重钉来源，IAM owner commit 为 `b363554d07e5b6e182160b42ae1402330e55d9db`。
浏览器入口已发布；真 IAM 邮件点击与完整登录仍待组合验证。

**Owner 与放置。** IAM 独占 Better Auth 1.7.3 有期签名 JWT 的签发/校验、`emailVerified` 幂等状态
和审计；BFF 独占 browser-private relay policy 与上游敏感响应安全头；Web 仅拥有浏览器 GET 准入和
同源响应。本片以 BFF 固定 blob 字节替换现有 `src/generated/iam-relay-policy.json`，在现有
`src/lib/server/iam-relay-policy.ts` 更新版本/provenance/精确 GET 集合，在现有
`src/lib/server/iam-relay-response.ts` 对已准入 `relativePath === "/verify-email"` 的上游响应
固定合成 `Cache-Control: no-store` 与 `Referrer-Policy: no-referrer`；同一路径的 Web 自有拒绝/失败
也固定这两个响应头。既有 `src/app/iam/[...path]/route.ts` 把已准入的 `relativePath` 传给
response 层并将 handler 可见 query 送入 BFF，不新建 route 或扩大其他 GET 语义。
Next 最终响应还会经过现有 `src/proxy.ts` 的全局安全头；该层须在通用写入后仅对精确
`/iam/verify-email` pathname 再固定 `no-store`/`no-referrer`，否则通用
`Referrer-Policy: strict-origin-when-cross-origin` 会覆盖 Route Handler 的更严格值。
选择现有 policy/response 边界而不新建 auth proxy 或全局 security header：后两者会扩大无关路径、
引入第二准入事实或改变其他响应。BFF artifact 的 `responseHeaders` **没有** `referrer-policy`，
Web 不泛化其白名单、不修改 BFF owner contract，而是在此单一路径合成浏览器安全头。

**传输、失败与验证。** 保持 `Browser → Web → BFF → IAM`；Web 仅检查验证 GET 的 query 形状：
规范化后恰好一个非空 `token`、最多一个 `callbackURL`，拒绝重复和额外键；纯函数对 handler 可见的
编码键名拒绝，但 Next 可在 handler 前将 `%74oken` 规范化为相同 `token`，此时合法唯一键可接受，
与字面键并存形成重复则拒绝。不解析 token 内容或从 callbackURL 选择目标 origin；只承诺支持形状的
键值语义保持，BFF 对收到的 Web URL query 不再重排。原生 302 仅接受 BFF/Web 现有的固定 Web origin、
已批准 `/auth/sign-in` 等精确 Location；外域、编码 alias、错误方法在 Web/BFF 准入失败，不自动跟随
redirect。该精确路径的 Web 浏览器响应（含本地拒绝与上游失败）均固定这两个安全头，覆盖缺失或可缓存的
上游 `Cache-Control`；其他 GET 保持原有 header 行为。浏览器 `Authorization`/Product cookie 不入 IAM，
issuer cookie 仍按既有白名单。Next 16.2.6 开发模式默认会把完整 incoming URL 输出到 stdout；现有
`next.config.ts` 只对锚定 `/iam/verify-email` 路径及其 query 使用 `logging.incomingRequests.ignore`，
其余请求的开发日志不变。这只抑制 Next 自带 incoming log，不覆盖 TLS 前置 access log、浏览器历史
或外部邮件系统。此切片不开放注册/组织写入、POST、通配路由或新身份/session owner，
不增加 Web SQL、Redis key、事务或缓存；请求取消和现有大小/时间预算不变。代码测试先 RED 后
GREEN，覆盖固定来源 digest/version、支持的 token/callbackURL query 与重复键零 BFF socket、
200/302 缺头及恶意缓存值、同源 302、外域/编码/错方法
零上游 socket；Root 已执行 Node22 `pnpm contract`、`pnpm test:architecture`、`pnpm lint`、
`tsc --noEmit`、全量 `pnpm test` 及聚焦真 Next HTTP/Chromium；为不触用户 3310 共享 `.next`，
`pnpm typecheck` 的 Next typegen 与正式 `pnpm build` 待隔离验证。Root 另需在正式来源验证真实邮件点击，
fixture 不能替代 IAM JWT 和完整登录组合。

## W1C-2：OIDC RP、Product Session 与同源 IAM 边界

### 当前事实与发布前置

W1C-2 起始基线的 Web `src/lib/server/auth.ts` 直接调用
`KOKORO_IAM_BASE_URL` 的 magic-link/refresh/team-session；`session-envelope.ts` 保存旧 sealed session，
`/api/auth/*` 与 `/api/team/*` 是旧路由，部分 `/api/*` 代理还发送自报 namespace/principal。
`sameOriginOk` 当时允许缺失 Origin。以下是**起始旧态**，不是已接受的目标安全性质；
本轮仅删除旧 magic-link 申请与回调 route，其余 helper、认证和 Team 路径另行收敛。

BFF relay 在 W1C-2 起始基线固定来源 commit `eb1eb2926d08b8a3779898b2c31e604a8585ec8b`，其
`contract/iam-relay-policy.json` 当时 SHA-256 为
`ddfdb1f335d87d7b7c904a23c589e33c1f938908188313e8c20e56223bde5d53`；policy version `1.0.0`
固定 IAM owner commit `e36da9ecf8d62a364182949817431a8e2329d50a`。该 pin 已随 IAM test-only
fixture 更新；W1C-2A 已 vendor 只读 policy snapshot 并通过 consumer blob digest/provenance 漂移门，
S1 Product Session 真实三仓 HTTPS 已验，普通 Product Bearer/Team 真实组合仍待验。上游再发布时必须重新核验 BFF commit、policy blob
digest、IAM allowlist/snapshot digest，不能只改文档版本。Web 不复制 IAM schema 或编辑 BFF policy。

### Owner、组件与调用方向

```text
Browser ──同源 cookie──> Web Route Handler/Auth.js RP
  ├─ /iam/* ──Web service identity──> BFF 固定 IAM relay ──> IAM issuer
  └─ /api/* ──Web service identity + 单一 user Bearer──> BFF /v1/*
```

- IAM 独占 identity、issuer、OAuth client provisioning、access/refresh token、授权和撤销事实；BFF 独占
  `/iam` 准入 policy、普通 `/v1` admission 和 Product API；Web 独占 Auth.js RP、HttpOnly Product Session、
  browser-private 同源入口与 Web Redis 协调 key。Web 不访问 IAM URL、数据库或其他 owner 服务。
- `src/app/api/auth/[...nextauth]/route.ts` 只挂 Auth.js；`src/lib/server/oidc-provider.ts` 只定义
  provider/RP、受限 server-side token exchange；`oidc-token.ts` 只处理 refresh/revoke；
  `product-session.ts` 与 `product-session-store.ts` 分离请求态 cookie 与 Redis CAS/tombstone；
  `src/app/iam/[...path]/route.ts` 只按固定 BFF policy 代理原生 IAM 协议；
  `src/app/auth/sign-in/route.ts` 处理首个交互，`src/app/auth/{select-tenant,consent}/route.ts`
  只做外层引导，`src/app/iam/interactions/{select-tenant,consent}/route.ts` 在 issuer cookie
  `Path=/iam` 下处理其余原生交互页及已签 query 续接。
  普通 BFF adapter 归现有 `src/app/api/**/route.ts`，由共享 server-only 凭据读取边界注入 Bearer。
  不建 Web DB 模块、万能上游代理或第二套 IAM client。
- 上述放置优于把凭据放进 `src/contract/`（会污染 browser wire/schema）或 UI feature（会把 secret
  带入客户端）。现有 `src/lib/server/` 与 Next Route Handler 是稳定边界；RP、token、store、relay 分文件是
  因变更原因、运行权限和测试面不同，而不是模板式分层。
- Next 16.2.6 本地 `node_modules/next/dist/docs/01-app/` 的 Route Handler、authentication、cookies 指南
  已核对：handler 属于 `app/`，`cookies()` 是异步 request-time API，写/删 cookie 必须在 Route Handler 或
  Server Function 且 streaming 前完成；动态认证响应显式 `no-store`，Route Handler 与同 segment page 不并存。

### 登录、租户、刷新、退出状态机

1. IAM operator/provisioning 先创建并 readback `user_delegated` confidential client：
   `client_secret_basic`、`require_pkce=true`、`enable_end_session=true`、精确 Web callback/post-logout URI、
   `openid profile email offline_access iam:session-authorization.verify iam:member.read iam:invitation.read iam:role.read iam:member.write iam:invitation.write`
   scopes 和 internal resource binding。R5-Web-Team-Product 前置切片保持原 scope 顺序，并在三个
   Team 只读 scope 后追加 IAM `ad5224a` 已授权的两个 user-delegated 写 scope；provider 授权请求与 RP 对 Auth.js authorization Location 的严格匹配使用同一固定值。
   此 scope 变更不改变 token callback 的既有验证语义，也不把申请 scope 当作授权事实；
   IAM/BFF 仍验证当前 membership、角色、权限与 token。旧 Team UI/直连及 relay policy 不在本片修改。
   issuer/discovery、`IAM_ISSUER_URL` 与 Web origin 必须精确匹配；不从浏览器 Host 推导 issuer。
2. Auth.js v4（本工作树精确固定 `next-auth@4.24.15`、`openid-client@5.7.1`，Node 22/Next 16 构建与真实 Next HTTP 已验证）执行 Authorization Code
   + S256 PKCE，保存并验证 state/nonce/PKCE；登录页、租户选择页、同意页承接 IAM 原生带签名 query，
   不消费、不重签 IAM 参数。callback code 单次使用并换取 token；失败清理 RP transaction 且不建立会话。
3. authorize、token、refresh 请求均发送**恰好一个**
   `resource=https://kokoro.dev/resources/iam-internal`。Web 入口拒绝或清除浏览器自报 `resource`；
   Auth.js v4 默认 callback 不保证 token request 带 resource，须以受限 `token.request`/OIDC client
   `exchangeBody` 和真实 wire 测试证明；refresh 由 Web server 显式 POST，使用 Basic 与唯一 resource。
   Bearer 的 audience、issuer、scope、subject/session 由 IAM/BFF 验证，不以 Web 解码结果授权。
4. **后续 Product Session 切片**在 callback 成功后建立 server-only Product Session：Auth.js 加密 HttpOnly
   cookie 只携随机 session ID、generation、当前 access 与必要 RP 退出提示，绝不放 refresh；公开 `session`
   callback 不输出 token。Web Redis 隔离记录 `active(g)`、`refreshing(g,reservation,deadline)` 或 `revoked`、
   固定到期及由 Web server-only 密钥加密的**当前** refresh；key、日志和公开响应无 token。请求先在线
   比对 Redis 当前 generation/tombstone，再向普通 BFF `/v1` 传唯一 Bearer。双阶段 CAS 从 `active(g)`
   原子预留，只有赢家向 IAM 发起**一次**固定 Basic/resource 的 refresh；收到新 token 后必须在
   reservation、deadline、未撤销条件下原子提交新加密 refresh 与 `active(g+1)`，才发送新 cookie。
   reserve 后 AAD 解密失败尽力按 reservation tombstone，Redis 不可用仍 fail closed；access UTF-8 ≤2048 B、refresh ≤8192 B、整数 `expires_in` 1–3600 s 且完整 Product Set-Cookie ≤4096 B，在 callback 建 Redis 前和 refresh finalize 前验证。竞争败者仅拒绝本请求，不撤销赢家、不清赢家 cookie，也不再次请求 IAM。pending、旧 generation、
   结果未知、Redis 故障均 fail closed；未决 reservation 到期只撤销，绝不恢复旧 active。finalize 成功
   或 Redis finalize ACK 未知时不发送新 cookie；即使 Redis 已提交 `active(g+1)`，旧 g 仍拒绝、用户
   重新登录，无客户端可达的 active record 按固定 TTL 回收；不依赖 IAM 的 replay 窗口恢复败者。
   cookie 的 `Path=/`、`SameSite=Lax`、`HttpOnly` 与固定 `KOKORO_WEB_ORIGIN=https:` **或** Web production mode 时 `Secure` 在创建/refresh/清除一致；该 Product 决策与 IAM issuer cookie 的 production 模式分离。
   固定租户准入在 callback 写 cookie/Redis 前及 refresh finalize 前，复用受限 Product BFF transport
   调用 `GET /v1/me`；只接受 owner OpenAPI digest
   `75ab482132602bd1d7ce77dbec1423b10d4ce7a8244ad284ecac78cd4e7b50ca` 的严格
   `{data:{user_id,tenant_id},meta:{request_id}}`。`user_id` 必须等于已验 OIDC subject，`tenant_id`
   必须等于 server-only `KOKORO_TENANT_ID`。依赖拒绝、撤权、超时、取消、超限或 shape/身份错配均
   fail closed；refresh 已 reserve 时撤销 pending record，使旧 generation 不可恢复。
5. logout 从可信解封的 cookie 取得 session ID 与 generation；单次 Redis 原子 compare-and-tombstone 仅在当前记录 generation 匹配时修改记录。旧 generation 不发送 Product `Set-Cookie`（乱序删除 cookie 会损坏并发 refresh 赢家），HTTP 200 返回 `stale_session`/`not_required`；旧 cookie 仍因在线 generation 校验不可用，不写 tombstone、不删除当前记录、不 revoke，也不返回 issuer 确认引导；**仅在匹配 generation 且记录为 active 时** take 已确认当前的加密 refresh，经固定 BFF relay 单次
   有界尝试 IAM revoke；issuer end-session 必须另由浏览器确认，refresh revoke 不等于 issuer cookie 清除。若记录为 refreshing/pending，旧 refresh 可能已轮换，故只
   tombstone，不 take/发送旧 refresh 到 IAM，并报告远端撤销未确认。缺失记录也建立覆盖最大会话/在途
   窗口的 tombstone，迟到 finalize 不可复活；重复 logout 不重复远端 revoke。清 Web cookie；
   active 状态的远端失败也准确报告未确认；若 tombstone 写入 ACK 未知，清 cookie 仅表示本浏览器
   清除，不能报告服务端已撤销，也不在清 cookie 后声称可补偿重试。IAM 失联时远端 token/session
   仅靠 IAM owner TTL 兜底；UI 区分本地退出与远端未确认，不宣称全端退出。 S1 signout JSON 另返回固定同源 `issuer_end_session_url` 与 `issuer_session=pending_browser_confirmation`；浏览器 GET IAM 原生确认页后，POST `action=confirm` 到固定 `/iam/oauth2/end-session/confirm`，仅该路径透传 IAM 签名 confirmation cookie，Web 校验精确 Origin、Host、form 与固定参数，IAM 再验 cookie 的 session/TTL 并删除 issuer session。确认 POST 成功前不宣称 issuer 已退出；URL 不含任何 token。
   失效/撤销/tenant 切换后的 BFF 401/403 不得仅靠 Web 缓存视为已授权。

### `/iam` 和业务代理的安全边界

- Web 从最终固定 BFF policy 的 path+method 白名单判定 `/iam/*`；`/.well-known/*`、`/jwks` 等 issuer
  路由只能作为 `/iam` 下的原生协议路由。W1C-2A 的固定 server-only `KOKORO_WEB_ORIGIN` 必须是精确
  HTTP(S) origin（scheme、host、可选 port，无尾斜杠/路径/query/fragment）；入站 Host 精确等于配置
  host，GET 如带 Origin 则精确匹配，POST 必须带精确 Origin；Location 只相对固定 origin 验证。
  Next 反代后重建的 handler URL origin 可能是内部 localhost，不能代表浏览器公开 authority；也不从
  `Forwarded`/`X-Forwarded-*` 推导公开 origin。handler 可见的未知、
  大小写、编码 route alias，以及上游 Location 中的 `%`、dot segment、双斜线、backslash 均拒绝；真实
  Next HTTP 边界会在 handler 前把 dot/encoded-dot 输入规范化成同一个 canonical route，并对双斜线返回
  308、编码 route 名返回 404，因此文档不把框架前不可见的原始输入冒称为 handler 拒绝。任一情况都不扩张
  固定 allowlist、身份或响应内容。CRLF、超限 query/header/body 同样拒绝；不自动跟随 redirect。Web 原样
  保留合法 status、Location、
  Cache-Control、Content-Type、Retry-After、logout 安全 header 和多个 `Set-Cookie`；唯一窄例外是浏览器
  `GET /iam/oauth2/authorize` 的 IAM 200 JSON `{redirect:true,url}`：先按原生响应验证状态、header 和
  issuer cookie，再要求精确字段、固定同源且属于既有交互/严格 callback Location 白名单，转为无 body 的
  302 导航。其他 `/iam` 路由不解释 JSON redirect，非法 authorize JSON 返回不带上游 body/cookie 的 502。
  OAuth 协议不包进 Product `{data}`/`{error}` envelope。BFF policy 限制的 8 KiB query、64 KiB request、
  16 KiB header、1 MiB response、5 s duration 是 Web 不得放宽的上限；浏览器取消传播到 BFF。
  W1C-2A GET 不承载请求体；非零/异常 `Content-Length`、任意 `Transfer-Encoding` 或可观察 Request body
  都在 BFF socket 前拒绝。policy 保留的三个 `/auth/*` 交互 Location 在 2A 尚未安装；
  2B-1/2B-2 现已安装三页，但 RP callback 在 2C 前仍受控 503，不能将 relay 可达冒充登录可用。
- 入站浏览器的 Cookie 仅逐名保留 IAM 发布 snapshot 的 `kokoro-issuer.*` 与 production
  `__Secure-kokoro-issuer.*`；出站 `Set-Cookie` 再按同一 snapshot 与精确 `Path=/iam` 校验，logout
  confirmation cookie 只允许 `Path=/iam/oauth2/end-session/confirm`。Product Session/Auth.js cookie、
  浏览器自带 Basic/Bearer、任意 `Authorization`、内部 service secret 均不能进入 IAM；BFF service
  identity 只在 Web→BFF 跳使用。`/iam/oauth2/token`/revoke 的 Basic 只由受信 Web server 生成；
  userinfo Bearer 也只由 Web server 使用，不能让浏览器任选 token。
- 所有同源 cookie mutation，包括 `/iam` 交互 POST、Auth.js action、logout 与业务 `/api/*`，均要求
  精确同源 Origin 加框架/应用 CSRF 证据；缺失、`null` 或错误 Origin fail closed。Web 的
  `/auth/sign-in` 与静态 `/iam/interactions/{select-tenant,consent}` server-rendered 表单在 GET
  时为该 IAM 交互、目标 POST path 和短 TTL
  生成 Web 自有随机 CSRF token，放入 HttpOnly、SameSite=Lax、Secure（生产）cookie 与隐藏表单字段，
  token 摘要/交互绑定以短 TTL 存 Web Redis namespace，原子一次性消费，Redis down 即拒绝；
  浏览器 POST 到 Web-owned Server Action/Route Handler，Web 在发 BFF socket 前核对 Origin、cookie/字段、
  交互绑定及一次性消费，按 IAM 当前机器契约构造 `/iam/sign-in/email|organization/set-active|
  oauth2/consent|oauth2/continue` 的原生 body（Web CSRF 字段不入 IAM），原样携带 IAM 已签 query 与
  issuer cookie。浏览器直接 POST 这些 `/iam` 路由而没有 Web action 证明一律拒绝。其他允许的
  browser `/iam` POST（authorize、sign-out）
  也必须由 Web 呈现并核验等价 token，或证明 IAM 自带原生 CSRF 的生成/携带/校验且再加精确 Origin；
  两者均无证据时拒绝，不能因为在 relay allowlist 就免除 CSRF。`end-session/confirm` 是已验证的窄例外：Better Auth 1.7.3 GET 签发限时签名 confirmation cookie，IAM POST 验签并绑定 session；Web 仅放行 `action=confirm`、精确 Origin/Host 与该路径 cookie，不放行通用 POST；确认表单读取限 1024 B 且应用层硬截止 5 秒，超时/断连不向 BFF 发起请求。真实 Next 在请求 body 尚未收齐时可能先于 handler 缓冲，HTTP 慢滴流只据实证明未触发 BFF，不冒称 handler 已返回超时。Auth.js action 使用其自身 CSRF
  token 校验并叠加 Web Origin；普通业务 mutation 使用 Web 自有 CSRF 防护。仅可信 server-to-server
  token/revoke 调用走独立 server-only 凭据路径，不借浏览器请求例外。BFF 还独立验证 Web service 身份
  与 relay Origin；Web 不把 `Forwarded` 当身份。

W1C-2B-2 的 IAM 固定外层 `/auth/select-tenant|consent` 只安装严格 GET，无状态 302 到静态
`/iam/interactions/select-tenant|consent` 并保持签名 query；POST 405。IAM issuer cookie 仍为
`Path=/iam`，因此真正 Web-owned GET/POST 表单位于该路径内，静态路由优先于 `/iam/[...path]`
只读 catch-all，但不开放直接 owner mutation。Tenant 候选从 BFF 固定 `/iam/organization/list` 取 active 组织，
候选 ID 串参加 Web CSRF 摘要绑定；POST 对用户所选 ID 先比对已呈现候选，再向 owner 重读当前
列表并确认资格，随后才向 `/iam/organization/set-active` 发送 IAM 原生 body。Consent 的 scope
来自跳转 query 的唯一受限字段，在 GET 页面只标为**未验签预览**，不构成 Web 授权判断；POST
不接受任何浏览器 scope 字段，只在明确 Agree 且一次性 CSRF/原始 query 匹配后提交
`{accept:true,scope,oauth_query}`，由 IAM 对完整 query 的签名、到期和 scope 子集作最终判定。
两路中间 200 `{redirect:true,url}`/302 限定固定 Web origin 的三条交互路径，合法多 issuer
`Set-Cookie` 原生保留，错误 body/cookie 一律清洗。IAM 最终指向固定
`/api/auth/callback/kokoro-iam` 时，2C 前没有 Auth.js RP，Web 只回受控 503，不泄露 code、
Location、Set-Cookie；回调导航待 RP 切片安装和验证后才开放。
- `/api/{session,hub,agents,scheduled-tasks,billing,team,...}` 的受保护 BFF `/v1` 路由统一从 Product
  Session 提取**单一** access Bearer，另加 Web service identity；删去 `x-kokoro-namespace`、
  `x-kokoro-principal-id`、浏览器 Authorization/cookie 透传。service-only runtime manifest 与公开 Share
  按 BFF 明确例外各自测试，不伪造 user Bearer 或把 public route 变成登录依赖。
- 旧 `/api/auth/magic-link/request` 与 `/api/auth/callback` 已删除；`src/lib/server/auth.ts`、
  `session-envelope.ts`、其余旧 `/api/auth/{logout,session-state}`、`/api/team/*` 的
  magic-link/team-session 路径及旧 `/auth/refresh` 仍须逐调用点删除或按新职责替换；
  不保留旧 endpoint alias、旧环境变量读取、双轨 cookie/refresh 或 IAM 直连 fallback。

### 失败恢复、契约与门禁

Web 本片不新增 SQL 表、migration 或数据库事务。Redis CAS 是 Web 会话协调的原子边界，IAM 仍拥有
token/session 权威事实；业务事务、幂等 receipt 与 durable AG-UI cursor 仍在 BFF。受控代理的连接、读取、
总体 deadline 和 body cap 必须覆盖慢请求；只有 BFF owner 明确标为安全的幂等操作才重试，token exchange
与业务 mutation 不做猜测性重试。错误映射不得泄露 authorization code、token、secret、cookie、IAM 原文堆栈；日志只含
request_id、operation、result、duration 等非敏感字段。

实施与验收顺序：W1C-2A 已用 Web contract test 核验 vendor snapshot 的固定 digest、provenance、结构
不变量与篡改负例，并用真实 Next HTTP 测试记录 canonicalization；Root 仍负责从固定 BFF commit blob
复核源字节。后续再做
`tests/server/{oidc-provider,product-session-store}`、`tests/system/{iam-relay-http,auth-browser-login}`、现有
proxy/architecture/UI/Playwright 回归；执行 `pnpm contract`、`pnpm test:architecture`、`pnpm lint`、
`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:e2e`，最后由 Root 在隔离 fixture 进行真实
Web→BFF→IAM 首次登录、tenant/consent、callback、refresh 竞争、logout/revoke、越权、异常/超时与
浏览器 cookie/header 泄漏组合测试。虽 IAM fixture 与 BFF repin 已发布，Web consumer 与真实组合证据未完成前，
本设计不构成 W1C 验收。Product OpenAPI generated consumer/AG-UI 单一 transport 属后续 W1D，
不得因本登录链可用而激活整个 EDGE-WEB-BFF。

## 1. 目标与范围

`kokoro` 是单一产品的 User Web 和同源 adapter。设计目标是让浏览器只理解 Web 可见模型，让
身份、业务事实、持久化、执行和跨 owner 编排保留在后端 owner。本文不把未来目标冒充当前实现；
差异统一列在 [`CURRENT.md`](CURRENT.md)。

## 2. Owner 与依赖方向

```text
Browser UI
  -> browser clients / Web state adapters
  -> Next.js same-origin interfaces (/api/*)
  -> kokoro-bff public Product API (/v1/*)
  -> internal owner APIs / Agent / Scheduler
```

| 层 | 本仓职责 | 禁止事项 |
| --- | --- | --- |
| Browser presentation | route、React surface、view state、可访问交互 | 读取 server secret、tenant/site selector、内部 URL |
| Browser application | Chat transport、reducer、query/mutation adapter、preview fixture | 建立第二条网络协议、把 localStorage 当业务事实源 |
| Contract boundary | Zod parse、AG-UI parse、path helper、DTO mapper | 在 UI 组件复制 JSON shape、把 generated wire type 当 view model |
| Same-origin interfaces | cookie、Origin、header 清洗、BFF envelope、stream proxy | SQL、业务状态机、跨 owner 编排、直连 owner 终态 |
| Bootstrap/config | server-only 环境读取和 client 装配 | 把服务地址或 secret 打入 browser bundle |

Web 不需要服务端 DDD 的空目录模板；关键约束是 Browser、server adapter、contract 和 UI 状态之间
依赖清晰。服务端业务 DDD 层属于 BFF/owner 仓。

## 3. 组件

### 3.1 Next.js 与同源 adapter

- `src/app/` 提供页面和 route handler。
- `src/lib/server/auth.ts` 管理 session envelope 与认证辅助逻辑。
- `src/lib/server/domain-context.ts` 从 `KOKORO_DOMAIN` 构造可信 `Forwarded`。
- `src/lib/server/upstream-http.ts` 清洗 browser-controlled forwarding/tenant header 后发往上游。
- `src/lib/server/bff-response.ts` 负责 BFF envelope、request id 与 no-store 响应的公共部分。

当前多数业务 route 已走 `KOKORO_BFF_BASE_URL`，认证仍直连 IAM。终态要求全部 owner 访问经 BFF
明确 adapter 完成，Web 不保存 owner base URL。

### 3.2 Chat 数据流

目标数据流：

```text
POST command + Idempotency-Key
  -> BFF receipt
  -> snapshot / durable AG-UI SSE
  -> AgUiChatTransport
  -> UIMessage parts / local reducer projection
  -> React rendering
```

- BFF 拥有 Conversation、Message、receipt、durable AG-UI ledger 和 cursor。
- Web 发送 command，依据 receipt 与 event reconciliation 收敛 optimistic state。
- `Last-Event-ID` 携带 BFF durable cursor；断线从下一条事件恢复。
- AG-UI 是唯一网络事件 union。Kokoro domain artifact/delivery 可使用有命名空间的 `CUSTOM`，但标准
  Run/Text/Tool/Reasoning/Activity/Subagent/Interrupt 事件优先。
- `AgUiChatTransport` 和 Vercel AI SDK `UIMessage` 是 Web 内部适配；它们不发布 endpoint，不拥有
  durable cursor，不定义第二个 resumable stream。

当前 `parseAgUiEvent` 会把 AG-UI 投影为旧 reducer `SessionEvent`，而 network client 仍双读两种
wire；这是迁移状态，不是终态设计。

### 3.3 Browser state 与 preview

- live snapshot/event 是服务端事实；localStorage 只能缓存 UI preference、draft 或有限本地投影。
- `src/dev/` 的 preview transport 仅用于 local/test，必须由显式 preview 配置选择。
- live 请求失败保持 unavailable/error，不回退 preview fixture。
- URL 是可分享/可恢复页面状态的首选；敏感 token 不进入 URL、localStorage 或客户端日志。

## 4. 契约边界

| 契约 | Owner | Visibility | 当前来源 |
| --- | --- | --- | --- |
| Web `/api/*` | `kokoro` | `browser-private` | route + `src/contract` + tests |
| BFF `/v1/*` Product API | `kokoro-bff` | `public` 或 BFF 定义的受限面 | BFF 自有 OpenAPI artifact |
| Web↔BFF Agent events | `kokoro-bff` | Web 消费的 AG-UI | BFF contract + `@ag-ui/core` + Web narrowing parser |
| BFF↔owner/Agent/Scheduler | 各事实 owner | `internal-owner` / `event-protocol` | owner 自有 contract |
| `src/generated/proto/*` | 历史 consumer snapshot | 不发布 | 冻结 provenance；当前不可再生 |

Web 不复制 BFF OpenAPI，也不把同源 contract 放进 Developer API。详细策略见
[`API_CONTRACT.md`](API_CONTRACT.md) 和 [`../contract/README.md`](../contract/README.md)。

## 5. 身份与安全

1. 浏览器仅自动携带同源 cookie。
2. 当前 Web 解封旧 HttpOnly session envelope；W1C-2 目标改为 Auth.js Product Session 加 Redis 在线 generation 核验后取得 server-only access Bearer。
3. mutation 执行同源检查；上游 header 从 allowlist 重建。
4. Web 注入 service identity、request id 和部署域名上下文。
5. BFF 重新执行认证、授权、tenant isolation 和 owner 调用；Web 的展示状态不构成授权。

`Forwarded` 是路由上下文，不是认证凭据。详细 threat boundary 见 [`SECURITY.md`](SECURITY.md)。

## 6. 失败、重试与恢复

- JSON：外部 unknown 先过 Zod，再进入 Web 状态。
- SSE：非法 frame fail-loud；网络断流按 durable cursor 重连；不能切换到另一协议或 fixture。
- mutation：只有具备幂等 identity 时才可重试。
- error：保持稳定 code、request id 和适当 HTTP status，不回传堆栈、SQL、token 或 provider 原文。
- cache：身份相关 JSON/SSE 默认 `private, no-store`；只对内容寻址静态资源使用公共缓存。
- shutdown：浏览器 abort 应传播到 Web/BFF；server transport 仍需补 connect/read/overall timeout。

完整运行策略见 [`RELIABILITY.md`](RELIABILITY.md)。

## 7. 部署

- Node 22 standalone Docker image 或 OpenNext/Cloudflare Worker。
- 一个仓库对应一个产品发布单元；域名由运行时环境注入，不在 React/CSS 中分支。
- 本地应用从 `pnpm dev` 启动；容器用于 release candidate/smoke，不替代源码验证。
- 当前 Docker/CI 已按 [`CURRENT.md`](CURRENT.md) 固定 base image digest、非 root/HEALTHCHECK、完整 action SHA、
  候选镜像扫描、SBOM/provenance 与 digest 签名；这些仓内配置不等于本轮镜像已发布或生产 SLO 已实测。

## 8. 变更顺序

1. 先更新本仓 browser-private contract/ADR 与 BFF owner contract 的固定引用。
2. 更新 Zod/AG-UI boundary 和 focused contract test。
3. 更新 server adapter 或 browser transport。
4. 更新状态机/UI consumer；删除旧 wire/fallback，而不是双读长期共存。
5. 运行 contract、architecture、lint、typecheck、test、build、E2E/live smoke。
6. 同 commit 更新 CURRENT、ACCEPTANCE 和必要 runbook。
