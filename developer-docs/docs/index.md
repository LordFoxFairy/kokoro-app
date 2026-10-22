---
layout: home

hero:
  name: Kokoro Developer
  text: 构建可恢复的 Agent 工作流
  tagline: 以 contract-first 方式调用异步 run、可重放 AG-UI 流和产品资源。
  actions:
    - theme: brand
      text: 开始快速上手
      link: /quickstart
    - theme: alt
      text: 浏览 API v1
      link: /reference/v1/
---

<section class="protocol-strip" aria-label="Kokoro run 协议">
  <article class="protocol-step">
    <span>01 / ADMIT</span>
    <h2>一次提交</h2>
    <p>为同一逻辑变更使用稳定的幂等键，先取得异步 run receipt。</p>
  </article>
  <article class="protocol-step">
    <span>02 / FOLLOW</span>
    <h2>读取 AG-UI</h2>
    <p>消费已经提交的事件 frame，并保存最新的 opaque cursor。</p>
  </article>
  <article class="protocol-step">
    <span>03 / RESUME</span>
    <h2>精确继续</h2>
    <p>断线后严格从最后一个已确认 frame 之后重连，不自行推算 offset。</p>
  </article>
</section>

## 一份 contract，一套 reference

public reference 在每次门户构建时从固定的 `kokoro-bff` OpenAPI 重新生成。指南解释调用方法；字段、响应头、约束和 operation metadata 的唯一字段事实源仍是 owner contract。门户会把当前未发布或仅属客户端策略的内容明确标出来，不把愿景写成已实现事实。

[理解 API 边界 →](/introduction)
