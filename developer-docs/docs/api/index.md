# API 文档

按你的目标选择入口，不必先阅读全部接口。

| 你想做什么 | 从这里开始 |
| --- | --- |
| 从外部应用读取可用技能 | [快速开始](/api/quickstart) → [技能读取](/api/guides/skills) |
| 使用 Kokoro 工作台完成任务 | [产品指南](/product/) → [任务与对话](/product/tasks/) |
| 维护工作台的第一方服务端适配器 | [认证与适用范围](/api/authentication) → [创建 run](/api/guides/create-run) → [事件流恢复](/api/guides/replay-after-disconnect) |
| 查方法、参数、响应和错误 | [API v1 参考](/api/reference/v1/) |

## 接入范围

**外部接入：**公开 Web 的 `GET /v1/skill.list` 支持 IAM User API Key 或已登记 OAuth Open App 令牌。外部调用方不发送内部服务凭据。

**工作台服务端参考：**项目、会话、任务、资源及管理接口由受信第一方适配器调用。浏览器经同源入口，由服务端注入凭据；普通产品请求使用原生 Cookie／Session。不要把参考中的全部 operation 当成可用一个 API Key 调用的外部接口。具体差异与尚待 owner 纠正的认证声明见[认证约定](/api/authentication)。

## 提交任务与接收结果

任务指南解释现有第一方链路：提交 message → 保存异步 receipt → 跟随 AG-UI → 断线后用原 cursor 恢复。`202 Accepted` 表示接纳，不表示任务完成；连接断开也不是业务终态。

常见 JSON 使用 `data/meta` 或 `error/meta`；技能列表使用独立的 `ok/request_id` 包装。方法、错误和响应头按具体 operation 查询，不套用一种统一 envelope。

## 版本与来源

字段参考从固定的 BFF owner artifact 自动生成；版本、commit 与摘要见[来源说明](/api/provenance)，不在手写页复制第二份版本号或字段表。只发布标为 `public` 的 wire shape，排除 `browser-private` 与内部 owner API。发布分类不代表匿名权限、外部接入资格、部署状态或性能承诺。
