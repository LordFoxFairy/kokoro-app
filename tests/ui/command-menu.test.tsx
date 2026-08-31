import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { createRef, useRef, useState } from "react"

const routerPush = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: routerPush }) }))

import { LocaleProvider } from "@/i18n/context"
import { KokoroCommandMenu } from "@/features/app/kokoro-command-menu"

afterEach(() => {
  cleanup()
  routerPush.mockReset()
})

it("CommandDialog 关闭后把焦点还给打开按钮", async () => {
  const triggerRef = createRef<HTMLButtonElement>()
  const onNewChat = vi.fn()
  const onOpenSettings = vi.fn()

  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <LocaleProvider>
        <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>打开</button>
        <KokoroCommandMenu
          open={open}
          onOpenChange={setOpen}
          onNewChat={onNewChat}
          onOpenSettings={onOpenSettings}
          returnFocusRef={triggerRef}
        />
      </LocaleProvider>
    )
  }

  render(<Harness />)

  fireEvent.click(triggerRef.current!)
  fireEvent.keyDown(document.activeElement!, { key: "Escape" })
  await waitFor(() => expect(triggerRef.current).toHaveFocus())
})

it("触发按钮在响应式切换后消失时回退到 Composer", async () => {
  const triggerRef = createRef<HTMLButtonElement>()
  const composerRef = createRef<HTMLTextAreaElement>()

  function Harness() {
    const [open, setOpen] = useState(false)
    const [hidden, setHidden] = useState(false)
    return (
      <LocaleProvider>
        <button
          ref={triggerRef}
          type="button"
          hidden={hidden}
          onClick={() => {
            setHidden(true)
            setOpen(true)
          }}
        >
          打开
        </button>
        <textarea ref={composerRef} data-settings-return-target="composer" aria-label="Composer" />
        <KokoroCommandMenu
          open={open}
          onOpenChange={setOpen}
          onNewChat={vi.fn()}
          onOpenSettings={vi.fn()}
          returnFocusRef={triggerRef}
        />
      </LocaleProvider>
    )
  }

  render(<Harness />)
  fireEvent.click(triggerRef.current!)
  fireEvent.keyDown(document.activeElement!, { key: "Escape" })
  await waitFor(() => expect(composerRef.current).toHaveFocus())
})

it("多站点嵌入时关闭回退焦点限定在当前 shell", async () => {
  const triggerRef = createRef<HTMLButtonElement>()
  const localComposerRef = createRef<HTMLTextAreaElement>()

  function Harness() {
    const scopeRef = useRef<HTMLDivElement>(null)
    const [open, setOpen] = useState(false)
    const [hidden, setHidden] = useState(false)
    return (
      <LocaleProvider>
        <textarea data-settings-return-target="composer" aria-label="另一个站点输入框" />
        <div ref={scopeRef}>
          <button
            ref={triggerRef}
            type="button"
            hidden={hidden}
            onClick={() => {
              setHidden(true)
              setOpen(true)
            }}
          >
            打开
          </button>
          <textarea ref={localComposerRef} data-settings-return-target="composer" aria-label="当前站点输入框" />
          <KokoroCommandMenu
            open={open}
            onOpenChange={setOpen}
            onNewChat={vi.fn()}
            onOpenSettings={vi.fn()}
            returnFocusRef={triggerRef}
            focusScopeRef={scopeRef}
          />
        </div>
      </LocaleProvider>
    )
  }

  render(<Harness />)
  fireEvent.click(screen.getByRole("button", { name: "打开" }))
  fireEvent.keyDown(document.activeElement!, { key: "Escape" })
  await waitFor(() => expect(localComposerRef.current).toHaveFocus())
})

it("从命令菜单跳设置时不抢设置对话框的焦点", async () => {
  const triggerRef = createRef<HTMLButtonElement>()
  const onOpenSettings = vi.fn()

  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <LocaleProvider>
        <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>打开</button>
        <KokoroCommandMenu
          open={open}
          onOpenChange={setOpen}
          onNewChat={vi.fn()}
          onOpenSettings={onOpenSettings}
          returnFocusRef={triggerRef}
        />
      </LocaleProvider>
    )
  }

  render(<Harness />)

  fireEvent.click(triggerRef.current!)
  fireEvent.click(screen.getByRole("option", { name: /Appearance|外观/ }))
  await waitFor(() => expect(onOpenSettings).toHaveBeenCalledWith("appearance"))
  expect(triggerRef.current).not.toHaveFocus()
})

it("从命令菜单新建对话时不把焦点抢回命令触发按钮", async () => {
  const triggerRef = createRef<HTMLButtonElement>()
  const onNewChat = vi.fn()

  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <LocaleProvider>
        <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>打开</button>
        <KokoroCommandMenu
          open={open}
          onOpenChange={setOpen}
          onNewChat={onNewChat}
          onOpenSettings={vi.fn()}
          returnFocusRef={triggerRef}
        />
      </LocaleProvider>
    )
  }

  render(<Harness />)

  fireEvent.click(triggerRef.current!)
  fireEvent.click(screen.getByRole("option", { name: /新建任务|New task/i }))
  await waitFor(() => expect(onNewChat).toHaveBeenCalledTimes(1))
  expect(triggerRef.current).not.toHaveFocus()
})

it("命令菜单与 Rail 共享 runtime menu 和 feature flag 过滤", async () => {
  const onOpenSettings = vi.fn()
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <LocaleProvider>
        <button type="button" onClick={() => setOpen(true)}>打开</button>
        <KokoroCommandMenu
          open={open}
          onOpenChange={setOpen}
          onNewChat={vi.fn()}
          onOpenSettings={onOpenSettings}
          navigation={[
            { key: "skills", label: "自定义技能" },
            { key: "future", label: "未来能力", featureFlag: "future" },
            { key: "hidden", label: "隐藏能力", featureFlag: "hidden" },
          ]}
          featureFlags={[{ key: "future", enabled: true }, { key: "hidden", enabled: false }]}
        />
      </LocaleProvider>
    )
  }

  render(<Harness />)
  fireEvent.click(screen.getByRole("button", { name: "打开" }))
  expect(screen.getByRole("option", { name: "自定义技能" })).toBeInTheDocument()
  expect(screen.getByRole("option", { name: "未来能力" })).toHaveAttribute("aria-disabled", "true")
  expect(screen.queryByRole("option", { name: "隐藏能力" })).toBeNull()
})

it("预览命令菜单与默认 Rail 保持完整的工作区入口", () => {
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <LocaleProvider>
        <button type="button" onClick={() => setOpen(true)}>打开</button>
        <KokoroCommandMenu
          open={open}
          onOpenChange={setOpen}
          onNewChat={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      </LocaleProvider>
    )
  }

  render(<Harness />)
  fireEvent.click(screen.getByRole("button", { name: "打开" }))
  expect(screen.getByRole("option", { name: /余额|Balance/i })).toBeInTheDocument()
  expect(screen.getByRole("option", { name: /团队|Teams/i })).toBeInTheDocument()
})

it("命令菜单把插件入口导航到一级页面", () => {
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <LocaleProvider>
        <button type="button" onClick={() => setOpen(true)}>打开</button>
        <KokoroCommandMenu open={open} onOpenChange={setOpen} onNewChat={vi.fn()} onOpenSettings={vi.fn()} />
      </LocaleProvider>
    )
  }

  render(<Harness />)
  fireEvent.click(screen.getByRole("button", { name: "打开" }))
    fireEvent.click(screen.getByRole("option", { name: /Connections|连接|Plugins/i }))
  expect(routerPush).toHaveBeenCalledWith("/app/plugins")
})

it("命令菜单补齐 Agent 与排程入口，并复用导航注册表的目标", () => {
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <LocaleProvider>
        <button type="button" onClick={() => setOpen(true)}>打开</button>
        <KokoroCommandMenu open={open} onOpenChange={setOpen} onNewChat={vi.fn()} onOpenSettings={vi.fn()} />
      </LocaleProvider>
    )
  }

  render(<Harness />)
  fireEvent.click(screen.getByRole("button", { name: "打开" }))

  const agent = screen.getByRole("option", { name: /^Agent$/i })
  const scheduled = screen.getByRole("option", { name: /已排程|Scheduled/i })
  expect(agent.querySelector("svg.lucide-message-square-more")).toBeInTheDocument()
  expect(scheduled.querySelector("svg.lucide-clock")).toBeInTheDocument()

  fireEvent.click(scheduled)
  expect(routerPush).toHaveBeenCalledWith("/app/scheduled?tab=calendar")
})
