import { useLayoutEffect, useRef, useState } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { ProjectMcpRecommendationsPicker, type ProjectMcpRecommendationsPickerProps } from "@/features/app/project-mcp-recommendations-picker"

afterEach(cleanup)

function props(): ProjectMcpRecommendationsPickerProps {
  return {
    open: true,
    items: [{ id: "candidate:a", label: "已读取连接器", icon: <span>图标</span> }],
    query: "",
    selectedIds: [],
    readReady: true,
    pending: false,
    hasMore: false,
    onQueryChange: vi.fn(),
    onToggle: vi.fn(),
    onSave: vi.fn(),
    onOpenChange: vi.fn(),
    onMore: vi.fn(),
    returnFocus: () => null,
    copy: {
      title: "推荐连接器",
      description: "推荐的连接器默认为已连接的成员启用。每位成员可自行开启或关闭。",
      searchPlaceholder: "搜索",
      cancel: "取消",
      save: "保存",
      close: "关闭",
      more: "更多",
      empty: "没有匹配的连接器",
    },
  }
}

it("delegates search and checkbox changes without saving or synthesizing selection", () => {
  const input = props()
  const view = render(<ProjectMcpRecommendationsPicker {...input} />)
  expect(screen.getByRole("dialog", { name: input.copy.title })).toHaveAccessibleDescription(input.copy.description)
  fireEvent.change(screen.getByRole("textbox", { name: "搜索" }), { target: { value: "查询" } })
  expect(input.onQueryChange).toHaveBeenCalledWith("查询")
  fireEvent.click(screen.getByRole("checkbox", { name: "已读取连接器" }))
  expect(input.onToggle).toHaveBeenCalledWith("candidate:a")
  expect(input.onSave).not.toHaveBeenCalled()
  expect(screen.getByRole("checkbox")).not.toBeChecked()
  view.rerender(<ProjectMcpRecommendationsPicker {...input} query="查询" selectedIds={["candidate:a"]} />)
  expect(screen.getByRole("checkbox")).toBeChecked()
  expect(screen.getByRole("textbox")).toHaveValue("查询")
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  expect(input.onSave).toHaveBeenCalledOnce()
  expect(input.onOpenChange).not.toHaveBeenCalled()
})

function FocusHarness({ input, target = "valid" }: {
  input: ProjectMcpRecommendationsPickerProps
  target?: "valid" | "removed" | "hidden" | "disabled" | "retired"
}) {
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const currentTarget = useRef(target)
  useLayoutEffect(() => { currentTarget.current = target }, [target])
  return <>
    {target !== "removed" ? <button ref={opener} type="button"
      style={target === "hidden" ? { display: "none" } : undefined}
      disabled={target === "disabled"} onClick={() => setOpen(true)}>项目入口</button> : null}
    <button type="button">后继入口</button>
    <ProjectMcpRecommendationsPicker {...input} open={open}
      returnFocus={() => {
        input.returnFocus()
        return currentTarget.current === "retired" ? null : opener.current
      }}
      onOpenChange={next => { input.onOpenChange(next); setOpen(next) }} />
  </>
}

it.each(["cancel", "escape", "close"])("controlled %s restores the still-current project opener after actual close", async action => {
  const input = { ...props(), returnFocus: vi.fn(() => null) }
  render(<FocusHarness input={input} />)
  const opener = screen.getByRole("button", { name: "项目入口" })
  opener.focus()
  fireEvent.click(opener)
  await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus())
  if (action === "escape") fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
  else fireEvent.click(screen.getByRole("button", { name: action === "cancel" ? "取消" : "关闭" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  await waitFor(() => expect(opener).toHaveFocus())
  expect(input.onSave).not.toHaveBeenCalled()
})

it.each(["removed", "hidden", "disabled", "retired"] as const)("%s project opener never steals the successor focus", async target => {
  const input = { ...props(), returnFocus: vi.fn(() => null) }
  const view = render(<FocusHarness input={input} />)
  const opener = screen.getByRole("button", { name: "项目入口" })
  opener.focus()
  fireEvent.click(opener)
  await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus())
  const focus = vi.spyOn(opener, "focus")
  view.rerender(<FocusHarness input={input} target={target} />)
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
  const successor = screen.getByRole("button", { name: "后继入口" })
  successor.focus()
  await waitFor(() => expect(input.returnFocus).toHaveBeenCalledOnce())
  expect(successor).toHaveFocus()
  expect(focus).not.toHaveBeenCalled()
  expect(input.onSave).not.toHaveBeenCalled()
})

it("pending controlled cancellation still only closes and returns focus", async () => {
  const input = { ...props(), pending: true, returnFocus: vi.fn(() => null) }
  render(<FocusHarness input={input} />)
  const opener = screen.getByRole("button", { name: "项目入口" })
  opener.focus()
  fireEvent.click(opener)
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
  await waitFor(() => expect(opener).toHaveFocus())
  expect(input.onSave).not.toHaveBeenCalled()
})

it("keeps owner-provided rows while reads are unconfirmed and locks writes quietly", () => {
  const input = props()
  const view = render(<ProjectMcpRecommendationsPicker {...input} readReady={false} selectedIds={["candidate:a"]} />)
  expect(screen.getByRole("checkbox")).toBeChecked()
  expect(screen.getByRole("checkbox")).toBeDisabled()
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true")
  expect(screen.queryByText(input.copy.empty)).toBeNull()
  view.rerender(<ProjectMcpRecommendationsPicker {...input} pending />)
  expect(screen.getByRole("checkbox")).toBeDisabled()
  expect(screen.getByRole("textbox")).toBeDisabled()
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  fireEvent.click(screen.getByRole("checkbox"))
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  expect(input.onToggle).not.toHaveBeenCalled()
  expect(input.onSave).not.toHaveBeenCalled()
})

it("shows an empty result only for confirmed complete reads", () => {
  const input = props()
  const view = render(<ProjectMcpRecommendationsPicker {...input} items={[]} readReady={false} />)
  expect(screen.queryByText(input.copy.empty)).toBeNull()
  view.rerender(<ProjectMcpRecommendationsPicker {...input} items={[]} hasMore />)
  expect(screen.queryByText(input.copy.empty)).toBeNull()
  view.rerender(<ProjectMcpRecommendationsPicker {...input} items={[]} />)
  expect(screen.getByText(input.copy.empty)).toBeVisible()
  expect(screen.getByRole("button", { name: "保存" })).toBeEnabled()
})

it("loads further candidates only on explicit action and preserves controlled feedback", () => {
  const input = props()
  const view = render(<ProjectMcpRecommendationsPicker {...input} hasMore writeError="保存未确认，请核对原操作。" />)
  expect(input.onMore).not.toHaveBeenCalled()
  expect(screen.getByRole("alert")).toHaveTextContent("保存未确认，请核对原操作。")
  fireEvent.click(screen.getByRole("button", { name: "更多" }))
  expect(input.onMore).toHaveBeenCalledOnce()
  view.rerender(<ProjectMcpRecommendationsPicker {...input} hasMore readReady={false} />)
  expect(screen.getByRole("button", { name: "更多" })).toBeDisabled()
  expect(screen.getByRole("checkbox", { name: "已读取连接器" })).toBeVisible()
})
