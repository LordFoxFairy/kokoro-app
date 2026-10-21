# 快速开始

从受信任的服务端提交一条 Agent message，保存 receipt，再跟随 AG-UI stream。下面的命令和环境值只用于本地示例；部署时由服务端适配器注入真实上下文。

## 1. 配置本地环境

```bash
export KOKORO_API_BASE_URL="http://127.0.0.1:4300"
export KOKORO_API_TOKEN="example-only-token"
export KOKORO_USER_BEARER="example-user-session"
export KOKORO_SESSION_ID="session_example"
```

::: warning 仅限服务端
服务凭据仅保留在服务端，用户 Bearer 由正式 IAM 登录取得；tenant／actor 由当前准入解析，不自报。不要放入浏览器 JavaScript、移动端 bundle、URL 或普通日志。示例运行器会用 loopback fixture 替代真实 BFF。
:::

## 2. 提交 message

已提交的 cURL 程序会由 `pnpm examples:check` 在无凭据 fixture 上执行：

<<< ../examples/curl/create-run.sh{bash}

成功响应为 `202 Accepted` 时，`data.run_id` 只表示异步工作已经被接纳，不表示答案已经完成。把 `data.user_message_id`、`data.assistant_message_id` 和 `meta.request_id` 一并保存。

## 3. 跟随与恢复

向 `GET /v1/sessions/{id}/events` 发送 `Accept: text/event-stream`。只有在一个 SSE frame 完整解析后才保存它的 `id`；断线重连时将同一个值作为 `Last-Event-ID`，不要解码、递增或替换成内部 Agent sequence。

[TypeScript 生命周期示例](/guides/replay-after-disconnect)会增量读取等待审批 frame，提交 `run.resume`，再使用最后确认的 cursor 重连直到终态。

## 4. 关联失败

本页 message/control 示例读取 `meta.request_id`；SSE 握手读取 `X-Kokoro-Request-Id`。`skill.list` 使用独立 `request_id` 与 `X-Request-Id`，详见[技能读取](/guides/skills)。调查问题时记录 operationId、HTTP status、耗时和 request ID，但默认不要记录凭据、完整用户内容、tool 参数或 provider payload。
