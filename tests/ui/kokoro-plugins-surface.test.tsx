import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { KokoroPluginsSurface } from "@/features/app/kokoro-plugins-surface"

beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh")
})
afterEach(cleanup)

function renderPlugins(onOpenSettings = vi.fn(), onCreateMcp = vi.fn(), onCreateCustomApi = vi.fn()) {
  render(<LocaleProvider><KokoroPluginsSurface onPrompt={vi.fn()} onOpenSettings={onOpenSettings} onCreateMcp={onCreateMcp} onCreateCustomApi={onCreateCustomApi} /></LocaleProvider>)
  return { onOpenSettings, onCreateMcp, onCreateCustomApi }
}

it("插件页呈现推荐、连接器和资料来源三个真实区域", () => {
  renderPlugins()
  expect(screen.getByRole("heading", { name: "外挂", level: 1 })).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "连接器", level: 2 })).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "资料来源", level: 2 })).toBeInTheDocument()
  const featured = screen.getAllByRole("article").slice(0, 4)
  expect(featured.map((item) => within(item).getByRole("img").getAttribute("alt"))).toEqual(["My Browser", "Gmail", "Notion", "Meta Ads Manager"])
  expect(screen.getByText("World Bank DataBank")).toBeInTheDocument()
  expect(screen.getByText("X/Twitter")).toBeInTheDocument()
  expect(screen.queryByText("ElevenLabs API")).toBeNull()
  expect(screen.getAllByRole("button", { name: "下一页" })).toHaveLength(2)
  expect(screen.getAllByRole("button", { name: "下一页" }).every((button) => !button.hasAttribute("disabled"))).toBe(true)
  expect(screen.getByRole("button", { name: "向前滚动" })).toBeInTheDocument()
})

it("搜索同时过滤连接器与资料来源，添加按钮回显状态", () => {
  renderPlugins()
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索连接器、资料来源" }), { target: { value: "Gmail" } })
  expect(screen.getAllByText("Gmail").length).toBeGreaterThan(0)
  expect(screen.queryByText("GitHub")).toBeNull()

  const add = screen.getByRole("button", { name: "新增 Gmail" })
  fireEvent.click(add)
  expect(screen.getByRole("button", { name: "移除 Gmail" })).toHaveAttribute("data-added", "true")
})

it("轮播连续点击使用待定目标，不会重复启动同一个位置", () => {
  renderPlugins()
  const viewport = screen.getByTestId("plugins-featured-viewport")
  Object.defineProperties(viewport, {
    clientWidth: { configurable: true, value: 768 },
    scrollWidth: { configurable: true, value: 1168 },
    scrollLeft: { configurable: true, writable: true, value: 0 },
  })
  const scrollTo = vi.fn(({ left }: { left: number }) => {
    Object.defineProperty(viewport, "scrollLeft", { configurable: true, writable: true, value: left })
    fireEvent.scroll(viewport)
  })
  Object.defineProperty(viewport, "scrollTo", { configurable: true, value: scrollTo })

  const button = screen.getByRole("button", { name: "向前滚动" })
  fireEvent.click(button)
  fireEvent.click(button)
  fireEvent.click(button)

  expect(scrollTo.mock.calls.map(([options]) => options.left)).toEqual([296, 400, 0])
  expect(button).toHaveAttribute("aria-label", "向前滚动")
})

it("轮播手动滚动后以真实位置继续，键盘可到首尾", () => {
  renderPlugins()
  const viewport = screen.getByTestId("plugins-featured-viewport")
  Object.defineProperties(viewport, {
    clientWidth: { configurable: true, value: 768 },
    scrollWidth: { configurable: true, value: 1168 },
    scrollLeft: { configurable: true, writable: true, value: 0 },
  })
  const scrollTo = vi.fn(({ left }: { left: number }) => {
    Object.defineProperty(viewport, "scrollLeft", { configurable: true, writable: true, value: left })
  })
  Object.defineProperty(viewport, "scrollTo", { configurable: true, value: scrollTo })

  fireEvent.click(screen.getByRole("button", { name: "向前滚动" }))
  Object.defineProperty(viewport, "scrollLeft", { configurable: true, writable: true, value: 100 })
  fireEvent.pointerDown(viewport)
  fireEvent.scroll(viewport)
  fireEvent.click(screen.getByRole("button", { name: "向前滚动" }))
  expect(scrollTo.mock.calls.at(-1)?.[0].left).toBe(396)

  viewport.focus()
  fireEvent.keyDown(viewport, { key: "End" })
  fireEvent.keyDown(viewport, { key: "Home" })
  expect(scrollTo.mock.calls.slice(-2).map(([options]) => options.left)).toEqual([400, 0])
})

it("搜索无结果时给出明确的空状态，且不会留下空白分区", () => {
  renderPlugins()
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索连接器、资料来源" }), { target: { value: "不存在的连接" } })

  expect(screen.getByTestId("plugins-no-results")).toBeInTheDocument()
  expect(screen.getByText("没有匹配的连接")).toBeInTheDocument()
  expect(screen.queryByRole("heading", { name: "连接器", level: 2 })).toBeNull()
  expect(screen.queryByRole("heading", { name: "资料来源", level: 2 })).toBeNull()
})

it("过滤后分页不会停留在已经不存在的页码", () => {
  renderPlugins()
  const next = screen.getAllByRole("button", { name: "下一页" })[0]
  fireEvent.click(next)
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索连接器、资料来源" }), { target: { value: "Gmail" } })

  expect(screen.getByText("Gmail")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "新增 Gmail" })).toBeInTheDocument()
})

it("管理连接器继续进入 MCP 设置能力", () => {
  const { onOpenSettings } = renderPlugins()
  fireEvent.click(screen.getByRole("button", { name: "管理连接器" }))
  expect(onOpenSettings).toHaveBeenCalledWith("mcp", screen.getByRole("button", { name: "管理连接器" }))
})

it("建立菜单将三种 MCP 入口交给对应的直接创建弹窗", async () => {
  const { onCreateMcp } = renderPlugins()
  const create = screen.getByRole("button", { name: "建立" })

  for (const [name, mode] of [
    ["自订 MCP", "form"],
    ["透过 JSON 汇入 MCP", "json"],
    [/透过 URL 添加 MCP/, "url"],
  ] as const) {
    fireEvent.pointerDown(create)
    fireEvent.click(await screen.findByRole("menuitem", { name }))
    expect(onCreateMcp).toHaveBeenLastCalledWith(mode, create)
  }
})

it("建立菜单提供四种连接器入口，并将自订 API 交给共享创建弹窗", async () => {
  const { onCreateCustomApi } = renderPlugins()
  const create = screen.getByRole("button", { name: "建立" })
  fireEvent.pointerDown(create)

  expect(await screen.findByRole("menuitem", { name: "自订 API" })).toBeInTheDocument()
  expect(screen.getByRole("menuitem", { name: "自订 MCP" })).toBeInTheDocument()
  expect(screen.getByRole("menuitem", { name: "透过 JSON 汇入 MCP" })).toBeInTheDocument()
  const urlItem = screen.getByRole("menuitem", { name: /透过 URL 添加 MCP/ })
  expect(urlItem).toHaveTextContent("测试版")
  expect(urlItem.querySelector("svg")).toHaveClass("lucide-globe")
  expect(urlItem.querySelector('[class*="createMenuCopy"]')).toContainElement(screen.getByText("测试版"))

  fireEvent.click(screen.getByRole("menuitem", { name: "自订 API" }))
  expect(onCreateCustomApi).toHaveBeenCalledWith(create)
})
