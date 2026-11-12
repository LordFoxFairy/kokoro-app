// canvas 事件总线 store 规格：按会话键各存一槽的开合记忆；「closed」只由手动关闭记账。

import { beforeEach, describe, expect, it, vi } from "vitest"

import { applyChatProjectionEvent } from "@/core/reducer"
import { createSessionStreamState } from "@/core/state"
import {
  canvasSlot,
  closeCanvas,
  openCanvas,
  readCanvasState,
  reopenCanvas,
  resetCanvasStore,
  resolveCanvasContent,
  subscribeCanvas,
  toggleCanvasFullscreen,
} from "@/ui/canvas/canvas-store"

import { makeDeliveryPayload, makeEvent } from "../core/fixtures"

beforeEach(resetCanvasStore)

const FILE_REF = { kind: "file", runId: "run_a", versionId: "wsv_" + "a".repeat(64), epoch: {} } as const

describe("开合与会话级记忆", () => {
  it("open：换引用快照 + 订阅方收到通知", () => {
    const onChange = vi.fn()
    const unsubscribe = subscribeCanvas(onChange)
    const before = readCanvasState()
    openCanvas("conv_1", FILE_REF)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(readCanvasState()).not.toBe(before)
    expect(canvasSlot(readCanvasState(), "conv_1")).toMatchObject({
      open: true,
      content: FILE_REF,
    })
    unsubscribe()
  })

  it("手动关闭记 closed：内容留槽可重开，且退出全屏", () => {
    openCanvas("conv_1", FILE_REF)
    toggleCanvasFullscreen("conv_1")
    closeCanvas("conv_1")
    expect(canvasSlot(readCanvasState(), "conv_1")).toMatchObject({
      open: false,
      fullscreen: false,
      content: FILE_REF,
    })
    reopenCanvas("conv_1")
    expect(canvasSlot(readCanvasState(), "conv_1").open).toBe(true)
  })

  it("再次打开内容覆盖此前的手动关闭（点击产物即打开意图）", () => {
    openCanvas("conv_1", FILE_REF)
    closeCanvas("conv_1")
    openCanvas("conv_1", { kind: "delivery", conversationId: "ses_1", artifactId: "artifact_a" })
    expect(canvasSlot(readCanvasState(), "conv_1")).toMatchObject({
      open: true,
      content: { kind: "delivery", conversationId: "ses_1", artifactId: "artifact_a" },
    })
  })

  it("按键隔离：conv_1 的手动关闭不影响 conv_2；空键/未知键回落关闭空槽", () => {
    openCanvas("conv_1", FILE_REF)
    openCanvas("conv_2", { ...FILE_REF, versionId: "wsv_" + "b".repeat(64) })
    closeCanvas("conv_1")
    expect(canvasSlot(readCanvasState(), "conv_1").open).toBe(false)
    expect(canvasSlot(readCanvasState(), "conv_2").open).toBe(true)
    expect(canvasSlot(readCanvasState(), null)).toMatchObject({ open: false, content: null })
    expect(canvasSlot(readCanvasState(), "conv_x")).toMatchObject({ open: false, content: null })
  })

  it("空槽 reopen 是 no-op（无内容无可开）", () => {
    reopenCanvas("conv_1")
    expect(canvasSlot(readCanvasState(), "conv_1").open).toBe(false)
  })
})

describe("resolveCanvasContent（引用 → 线程活数据）", () => {
  it("resolves the exact owner-read process version and never falls back to its path", () => {
    const thread = createSessionStreamState()
    const epoch = {}
    const selected = { kind: "file", runId: "run_new", versionId: "wsv_" + "2".repeat(64), epoch } as const
    const old = { runId: "run_old", versionId: "wsv_" + "1".repeat(64), path: "/outputs/report.md", mime: "text/markdown", bytes: 12, contentSha256: "a".repeat(64) }
    const latest = { ...old, runId: selected.runId, versionId: selected.versionId }
    expect(resolveCanvasContent(selected, thread, [old, latest])).toEqual({ kind: "file", file: latest })
    expect(resolveCanvasContent(selected, thread, [old])).toBeNull()
  })

  it("delivery：按二元 ID 命中；缺位返回 null（不渲染悬空面板）", () => {
    const thread = applyChatProjectionEvent(
      createSessionStreamState(),
      makeEvent("delivery.created", makeDeliveryPayload({ artifact_id: "artifact_a" })),
    )
    const hit = resolveCanvasContent({ kind: "delivery", conversationId: "ses_1", artifactId: "artifact_a" }, thread)
    expect(hit?.kind === "delivery" ? hit.delivery.title : null).toBe("调研报告")
    expect(resolveCanvasContent({ kind: "delivery", conversationId: "ses_1", artifactId: "artifact_x" }, thread)).toBeNull()
  })

})
