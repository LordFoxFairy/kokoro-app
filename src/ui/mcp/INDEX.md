# ui/mcp — 连接面板

- 广场分类使用参考的 32px 高、4px 横向 gap；控件区与结果区之间保留 16px 底距，空态与有卡片时使用同一基线。

## 当前边界
正式 Settings/MCP 与目录经 `mcp-projection-read.tsx` 渲染 BFF owner-native 投影和 opaque cursor，并通过现有 CAS 命令完成编辑、启停、删除和授权重试；URL、secret、revision、allowed_tools 不进入正式视图。旧的 server pool、凭据池和 preview 入口已删除，不保留兼容分支。

Settings 的已添加连接器由同一 owner 投影渲染为可聚焦的紧凑卡片；搜索只过滤当前已读取页的真实名称、说明和已解析 provider 名称，不展示 opaque `provider_key`。卡片打开现有 CAS 管理弹窗，编辑、启停、删除及授权重试仍通过正式命令；仅在 owner 返回前后游标时显示分页。
Settings 的 Browse 与空态添加入口打开独立目录弹窗，不替换已添加列表；目录和已添加列表各自保留搜索条件。外部 Plugins 页面继续以内联目录呈现，但与弹窗复用同一 provider 投影、卡片生成和详情/Connect 行为。
Provider 目录与个人连接列表分别读取、分别保留成功投影并独立显示失败/重试；任一 owner read 延迟或失败不阻塞另一侧已成功内容。每份投影绑定当前 read identity，身份变化时旧数据立即退出渲染，inflight 仍按订阅生命周期取消。
OAuth 点击同步预开并隔离 popup，再使用 owner 返回的 HTTPS URL；callback Complete 在 StrictMode 下共享 inflight，只通过 BroadcastChannel 发送 connector_id 触发 owner projection 重读，不广播 code/state/token，也不以通知判定 active。popup 阻止时不发起 owner command，关闭、过期与卸载均清理句柄。

创建入口严格按 Manus 已观察顺序拆分为 `custom-api`、`custom-mcp`、`json` 与 `url`；它们不得落入同一个泛化表单。Custom MCP 先显示详情层，再进入独立 `MCP 配置`；Custom API 使用独立 profile/环境变量详情。JSON 的来源格式含 STDIO、SSE、Streamable HTTP，必须只调用 Platform 原子 import contract：浏览器不得把 JSON 拆成多个 Register 请求或把非 HTTP 条目改写为 HTTP。现有固定 BFF/App artifact 已接原子 HTTP import，整份原文只提交一次。当前 owner 仅接受 `streamableHttp`；STDIO 和 SSE 返回明确 precondition，不改写传输格式、不冒称支持运行。URL 的 BYO OAuth 字段仅属于 URL 高级层，值只提交给 owner，不在投影或浏览器存储回显。

## 当前组件职责

- `mcp-projection-read.tsx`：用户意图与 v1 owner command 协调；不保存第二份投影。
- `use-mcp-projection.ts`：按身份、资源和 cursor 共享单飞投影读取，保留最后确认结果。
- `mcp-provider-directory.tsx` / `mcp-connection-list.tsx`：仅负责真实 owner 投影的筛选与卡片呈现。
- `mcp-provider-catalog-dialog.tsx`、`mcp-provider-detail-dialog.tsx`、`mcp-connector-editor-dialog.tsx`：分别拥有目录、Provider 详情、Provider 生命周期编辑的焦点/弹窗边界。
- `custom-mcp-detail-dialog.tsx`：只拥有自定义 MCP 的详情、管理菜单与 `MCP 配置`；读取 owner-issued server ID 后才渲染，绝不按显示名猜类型。
- `custom-api-detail-dialog.tsx` / `custom-api-form.tsx` / `use-custom-api-projection.ts`：只拥有 Custom API profile 的安全详情和编辑；环境变量值永不进入读取视图。
- `mcp-projection-types.ts`：共享的投影视图类型、分类词汇和 owner artwork/status 映射；不含请求或模拟数据。


MCP 注册／原子导入与已确认的个人命令，统一失活当前 client／subject 的连接器页和首屏持久投影，并通知挂载读者重新读取；Provider 元数据保持独立。旧预热与旧请求按共享 revision 退休，即使取消后迟到也不写回。全局创建和 Settings 内部创建共用该规则，Settings 不再因写入重挂整个连接器内容，搜索等用户意图保留；Custom API 是独立投影，不把此 MCP 规则冒称全局 API 创建闭环。
