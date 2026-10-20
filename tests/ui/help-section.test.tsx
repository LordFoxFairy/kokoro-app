import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/i18n/context";
import { HelpSection } from "@/ui/settings/sections/help-section";

beforeEach(() => localStorage.setItem("kokoro.locale", "en"));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("provides local help search without requesting support or business data", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<LocaleProvider><HelpSection onSelectSetting={vi.fn()} /></LocaleProvider>);
  const search = screen.getByRole("searchbox", { name: "Search help" });
  fireEvent.change(search, { target: { value: "   ARCHIVE   " } });
  expect(screen.getByRole("button", { name: "Archive and restore tasks" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Save your name" })).not.toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
});

it("combines body search with a category, trims case and restores the other matches", () => {
  render(<LocaleProvider><HelpSection onSelectSetting={vi.fn()} /></LocaleProvider>);
  const search = screen.getByRole("searchbox", { name: "Search help" });
  expect(search).toHaveAttribute("maxlength", "200");
  fireEvent.change(search, { target: { value: "  CONFLICTS  " } });
  expect(screen.getByRole("status")).toHaveTextContent("2 guides found");
  expect(screen.getByRole("button", { name: "Save your name" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Set keyboard shortcuts" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Preferences" }));
  expect(screen.getByRole("status")).toHaveTextContent("1 guides found");
  expect(screen.queryByRole("button", { name: "Save your name" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "All categories" }));
  expect(screen.getByRole("status")).toHaveTextContent("2 guides found");
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByRole("status")).toHaveTextContent("8 guides found");
  expect(search).toHaveValue("");
  expect(search).toHaveFocus();
});

it("derives two guides per category and clearing a query preserves the selected category", () => {
  render(<LocaleProvider><HelpSection onSelectSetting={vi.fn()} /></LocaleProvider>);
  const categories = screen.getByRole("group", { name: "Help categories" });
  const buttons = within(categories).getAllByRole("button");
  expect(buttons).toHaveLength(4);
  for (const button of buttons) {
    expect(button).toHaveAccessibleDescription("2 guides");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("2 guides found");
  }
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "unmatched-query" } });
  expect(screen.getByRole("status")).toHaveTextContent("0 guides found");
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(buttons[3]).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("status")).toHaveTextContent("2 guides found");
});

it("shows a recoverable empty result and resets query and category with focus", () => {
  render(<LocaleProvider><HelpSection onSelectSetting={vi.fn()} /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Preferences" }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "not-a-feature" } });
  expect(screen.getByRole("heading", { name: "No matching guides" })).toBeVisible();
  expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
  expect(screen.getByRole("searchbox")).toHaveValue("");
  expect(screen.getByRole("searchbox")).toHaveFocus();
  expect(screen.getByRole("button", { name: "All categories" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("status")).toHaveTextContent("8 guides found");
});

it("closes expanded guides when search or category changes instead of reviving hidden content", () => {
  render(<LocaleProvider><HelpSection onSelectSetting={vi.fn()} /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Save your name" }));
  expect(screen.getByText(/A read confirms the saved profile/)).toBeVisible();
  expect(screen.getByText("In account settings, edit your name, view login devices, and sign out other sessions.")).toBeVisible();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "archive" } });
  expect(screen.queryByText(/A read confirms the saved profile/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByRole("button", { name: "Save your name" })).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(screen.getByRole("button", { name: "Save your name" }));
  fireEvent.click(screen.getByRole("button", { name: "Preferences" }));
  fireEvent.click(screen.getByRole("button", { name: "All categories" }));
  expect(screen.getByRole("button", { name: "Save your name" })).toHaveAttribute("aria-expanded", "false");
});

it("uses single collapsible guides and native Accordion arrow focus", () => {
  render(<LocaleProvider><HelpSection onSelectSetting={vi.fn()} /></LocaleProvider>);
  const name = screen.getByRole("button", { name: "Save your name" });
  const devices = screen.getByRole("button", { name: "View and revoke device sessions" });
  name.focus();
  fireEvent.keyDown(name, { key: "ArrowDown" });
  expect(devices).toHaveFocus();
  fireEvent.click(devices);
  expect(devices).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(name);
  expect(devices).toHaveAttribute("aria-expanded", "false");
  expect(name).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(name);
  expect(name).toHaveAttribute("aria-expanded", "false");
});

it.each([
  ["Save your name", "Account", "account"],
  ["View and revoke device sessions", "Account", "account"],
  ["Change language and theme", "General", "appearance"],
  ["Set keyboard shortcuts", "Keyboard shortcuts", "shortcuts"],
  ["Read your actual credits", "Credits & usage", "credits"],
  ["Browse the plan catalog", "Subscription & balance", "subscription"],
  ["Create and stop task sharing", "Data management", "data-management"],
  ["Archive and restore tasks", "Data management", "data-management"],
])("navigates %s to its existing setting without sending a request", (title, action, tab) => {
  const onSelect = vi.fn();
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<LocaleProvider><HelpSection onSelectSetting={onSelect} /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: title }));
  fireEvent.click(within(screen.getByRole("region", { name: title })).getByRole("button", { name: action }));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(tab);
  expect(fetcher).not.toHaveBeenCalled();
});

it("clears local filters and expansion after leaving and reentering", () => {
  const draw = () => <LocaleProvider><HelpSection onSelectSetting={vi.fn()} /></LocaleProvider>;
  const view = render(draw());
  fireEvent.click(screen.getByRole("button", { name: "Account and devices" }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "name" } });
  fireEvent.click(screen.getByRole("button", { name: "Save your name" }));
  view.unmount();
  render(draw());
  expect(screen.getByRole("searchbox")).toHaveValue("");
  expect(screen.getByRole("button", { name: "All categories" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("status")).toHaveTextContent("8 guides found");
  expect(screen.getByRole("button", { name: "Save your name" })).toHaveAttribute("aria-expanded", "false");
});

it("searches the active language including the retained account explanation", () => {
  localStorage.setItem("kokoro.locale", "zh");
  render(<LocaleProvider><HelpSection onSelectSetting={vi.fn()} /></LocaleProvider>);
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索帮助" }), { target: { value: "退出其他会话" } });
  expect(screen.getByRole("status")).toHaveTextContent("找到 1 篇指南");
  fireEvent.click(screen.getByRole("button", { name: "保存姓名" }));
  expect(screen.getByText("在账户设置中修改姓名、查看登录设备并退出其他会话。")).toBeVisible();
  expect(screen.queryByText("Save your name")).not.toBeInTheDocument();
});

it("offers real setting navigation and no fictitious support delivery", () => {
  localStorage.setItem("kokoro.locale", "zh");
  const select = vi.fn();
  render(<LocaleProvider><HelpSection onSelectSetting={select} /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "保存姓名" }));
  fireEvent.click(within(screen.getByRole("region", { name: "保存姓名" })).getByRole("button", { name: "账户" }));
  expect(select).toHaveBeenLastCalledWith("account");
  fireEvent.click(screen.getByRole("button", { name: "创建与停止任务分享" }));
  fireEvent.click(within(screen.getByRole("region", { name: "创建与停止任务分享" })).getByRole("button", { name: "数据管理" }));
  expect(select).toHaveBeenLastCalledWith("data-management");
  expect(screen.queryByRole("button", { name: /发送|客服/ })).toBeNull();
  expect(screen.queryByRole("link", { name: /Manus/ })).toBeNull();
});
