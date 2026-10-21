# 安全边界

## 把服务边界留在服务端

从受信任的 backend 或同源 server adapter 调用 Kokoro。不要把 service credential、namespace、principal 或其他认证上下文暴露给浏览器、移动端 bundle、URL 或客户端日志。浏览器提交的 host、forwarded、tenant 和 identity 值都视为不受信输入。

## 最小化数据暴露

- 只发送 operation schema 声明的字段；
- 默认不记录 credential、完整用户内容、tool 参数或 artifact payload；
- share ID、pagination cursor、resource ID 和 URL 都是 opaque，不替代 authorization；
- 使用前校验 JSON envelope、HTTP status 和 AG-UI event type；
- 在调用方服务中设置 connect/read/overall timeout、取消传播、response-size 和 upload-size budget。

## 受信上下文隔离

tenant 和 actor 来自正式 IAM 会话准入，不能由旧 namespace／principal 请求头自报。pagination cursor 与 AG-UI replay cursor 都要绑定各自的资源和受信上下文；跨范围的值应按 contract 错误处理，不用试探方式确认外部资源是否存在。

## 安全报告

记录 public operationId、HTTP status 和返回的 request ID。issue 或支持请求中不要附带部署 credential、未脱敏用户 payload、内部 owner endpoint 或数据库结构。

本页是安全调用建议；认证 header、字段约束和错误 shape 的唯一字段事实源仍是 BFF public artifact。
