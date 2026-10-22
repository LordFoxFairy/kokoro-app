# 变更记录

## 2026-10-22 · 配对 Public22.5

- 固定 BFF `4d8a02828ea29fb933b29bc60670ada9761cadef` 完整原件，增加管理员计价配置最新快照与两类不可变发布；原183项保持，6个网站私有操作仍不发布。
- 补充价格／单次预算、预占和真实用量一次整数结算的边界，以及未知发布只能原命令恢复的说明。接口和文档发布不代表正常后台表单或模型扣分已完成。

## 2026-10-22 · 配对 Public22.4

- 固定 BFF `c48a9bca07a2bb48fb5db46272ff71aab90e14ce` 的完整原件，新增管理员非现金整积分充值契约，旧182项保持；6个网站私有操作仍不发布。
- 补充[积分与非现金充值](/guides/credits)，明确权限、整积分字符串、原命令幂等和未知结果恢复；契约发布不冒称正常环境完整旅程已验。

## 2026-10-22 · 配对 Public22.3

- 固定 BFF `e461d5178c6bf92558d7cd7dd288cb29cb008525` 的完整原件；182项中生成176个公开操作／367个可达schema，原6个网站私有操作继续排除。
- 参考生成纳入个人系列删除、公开Skill身份边界、积分账户初始化及管理员显式上游候选读取；权限仍逐operation执行，不因public分类扩权，不自动发布或执行模型。
- 沿唯一catalog、immutable Git blob与摘要校验，不保存第二份OpenAPI，不手改生成参考；正常产品验收与远程合并状态独立。

## 2026-10-21 · App 文档包与 Public22 候选

- 迁入 App 的独立文档包，复用既有 VitePress、锁文件、来源校验与公开投影，不新增文档服务。
- 固定与 App 一致的 Public22 原件，176项中生成170个公开操作／359个可达schema；6个网站私有操作不发布。包括已交付的本人历史读取及发布确认条件，字段由固定生成器维护。
- 正常服务已配对不等于远程已合并；公开 API Key、Open App、trusted 身份及完整副作用旅程仍有明确缺口，不将生成成功写成业务闭环。

## 2026-10-21 · 对齐已发布 Public 19.0.1

- 固定 BFF 已合并的 `19.0.1` artifact，发布 159 个公开接口，排除 6 个网站私有接口及其独占引用；原始 commit 和 SHA-256 保留完整来源证据。
- 新增技能读取指南，说明个人／项目并集、精确版本和读取／执行授权边界；按 owner metadata 展示权限、幂等和字段，不按 HTTP 方法猜规则。
- 认证指南与可执行示例改用当前 service envelope 和 IAM 用户 Bearer，删除旧 namespace／principal 自报身份方式。
- 对齐完整交互暂停快照、`pause_ref`、`expected_pause_revision` 和 `decisions[].item_id`；区分各接口的响应与 Request ID，并说明已声明的 `429`／`Retry-After`。

## 2026-09-04 · Developer 门户完善

- 将阅读入口、导航、平台行为和工作流说明统一为中文，并明确 contract fact、客户端策略和当前缺口的边界。
- reference 生成器现在展示 owner、visibility、stability、idempotency、permission、security、参数约束、嵌套字段、组合 schema、response header 和示例。
- 增加 canonical 与 generated publication policy，校验 metadata 枚举、`Idempotency-Key` 一致性、危险内容和受管输出路径。
- TypeScript 生命周期示例改为增量消费长连接 AG-UI，在等待审批后 resume，并用 `Last-Event-ID` 重连；fixture 以分块且保持连接的方式验证该顺序。

## 2026-09-04 · Portal Phase 1

- 建立从固定 `kokoro-bff` public v1 artifact 生成 reference 的流程，当时目录枚举 63 个 public operation。
- 提供无真实凭据的 cURL、TypeScript、Python 示例，并由本地 fixture 执行。
- 加入概念、生命周期、平台行为、provenance、搜索和响应式导航。

## API `1.0.0` beta（历史发布）

- public 路径空间为 `/v1`，当前 operation 标记为 beta。
- AG-UI public frame 使用 BFF 拥有的 opaque `agui_*` cursor。
- canonical contract 当前没有 webhook registration、delivery 或 signature-verification operation；门户不会把内部 callback 写成 public API。
