import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/i18n/context";
import { ShortcutsCard } from "@/ui/settings/sections/shortcuts-card";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { readKeyboardShortcuts, writeKeyboardShortcuts } from "@/lib/keyboard-shortcuts";

beforeEach(() => { localStorage.clear(); localStorage.setItem("kokoro.locale", "zh"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
function Probe() { const { state } = useSidebar(); return <output data-testid="sidebar-state">{state}</output>; }
function mount() {
  return render(<LocaleProvider><SidebarProvider defaultOpen persistOpenState={false}><SidebarTrigger aria-label="Toggle" /><Probe /><ShortcutsCard /></SidebarProvider></LocaleProvider>);
}
it("records, restores after remount, clears and resets a binding", () => {
  const view = mount();
  fireEvent.click(screen.getByRole("button", { name: "编辑搜寻任务快捷键" }));
  fireEvent.keyDown(window, { key: "j", ctrlKey: true, shiftKey: true });
  expect(readKeyboardShortcuts().search.key).toBe("j");
  expect(screen.getByRole("status", { name: "已保存" })).toHaveTextContent("已保存");
  view.unmount(); mount();
  expect(screen.getByRole("button", { name: "编辑搜寻任务快捷键" })).toHaveTextContent("J");
  fireEvent.click(screen.getByRole("button", { name: "清除搜寻任务快捷键" }));
  expect(readKeyboardShortcuts().search.key).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "重设为预设值" }));
  expect(readKeyboardShortcuts().search.key).toBe("k");
});
it("storage failures for edit, clear and reset never show saved or change persisted state", () => {
  const previous = readKeyboardShortcuts();
  writeKeyboardShortcuts({ ...previous, search: { ...previous.search, key: "j" } });
  mount();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  fireEvent.click(screen.getByRole("button", { name: "编辑搜寻任务快捷键" }));
  fireEvent.keyDown(window, { key: "u", ctrlKey: true, shiftKey: true });
  expect(screen.getByRole("alert")).toHaveTextContent("无法保存");
  fireEvent.click(screen.getByRole("button", { name: "清除搜寻任务快捷键" }));
  fireEvent.click(screen.getByRole("button", { name: "重设为预设值" }));
  expect(screen.queryByRole("status", { name: "已保存" })).toBeNull();
  expect(readKeyboardShortcuts().search.key).toBe("j");
});
it("recording consumes existing actions, rejects duplicates and plain text, Esc cancels only recording", () => {
  mount();
  const bubble = vi.fn(); window.addEventListener("keydown", bubble);
  fireEvent.click(screen.getByRole("button", { name: "编辑搜寻任务快捷键" }));
  fireEvent.keyDown(window, { key: ".", ctrlKey: true });
  expect(screen.getByRole("alert")).toHaveTextContent("已绑定");
  expect(bubble).not.toHaveBeenCalled();
  expect(screen.getByTestId("sidebar-state")).toHaveTextContent("expanded");
  fireEvent.keyDown(window, { key: "j" });
  expect(screen.getByRole("alert")).toHaveTextContent("请使用");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(readKeyboardShortcuts().search.key).toBe("k");
  expect(screen.getByTestId("settings-shortcuts")).toBeInTheDocument();
  window.removeEventListener("keydown", bubble);
});
it("the real sidebar consumes edited bindings but ignores typing, repeats and composition", () => {
  mount();
  const toggle = screen.getByTestId("sidebar-state");
  fireEvent.click(screen.getByRole("button", { name: "编辑切换侧边栏快捷键" }));
  fireEvent.keyDown(window, { key: "j", ctrlKey: true, shiftKey: true });
  fireEvent.keyDown(window, { key: ".", ctrlKey: true });
  expect(toggle).toHaveTextContent("expanded");
  fireEvent.keyDown(window, { key: "j", ctrlKey: true, shiftKey: true });
  expect(toggle).toHaveTextContent("collapsed");
  const input = document.createElement("textarea"); document.body.append(input);
  fireEvent.keyDown(input, { key: "j", ctrlKey: true, shiftKey: true });
  fireEvent.keyDown(window, { key: "j", ctrlKey: true, shiftKey: true, repeat: true });
  fireEvent.keyDown(window, { key: "j", ctrlKey: true, shiftKey: true, isComposing: true });
  expect(toggle).toHaveTextContent("collapsed"); input.remove();
  expect(screen.getByRole("button", { name: "语音输入暂不可用" })).toBeDisabled();
});
it("recording reports a legacy symbol alias conflict and preserves the original action", () => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  const original = readKeyboardShortcuts();
  const raw = JSON.stringify({ ...original, search: { key: ">", primary: true, shift: true, alt: false } });
  localStorage.setItem("kokoro.web.keyboard-shortcuts", raw);
  mount();
  fireEvent.click(screen.getByRole("button", { name: "编辑切换侧边栏快捷键" }));
  fireEvent.keyDown(window, { key: ">", code: "Period", metaKey: true, shiftKey: true });
  expect(screen.getByRole("alert")).toHaveTextContent("已绑定");
  expect(screen.queryByRole("status", { name: "已保存" })).toBeNull();
  expect(localStorage.getItem("kokoro.web.keyboard-shortcuts")).toBe(raw);
  expect(screen.getByRole("button", { name: "编辑切换侧边栏快捷键" })).toHaveTextContent("输入按键序列");
});

// SET36-BEGIN: copy-task-link-settings-row
it("SET36 copy task link row explains availability and supports edit clear reset", () => {
  mount();
  expect(screen.getByText("当任务打开时")).toBeInTheDocument();
  const edit = screen.getByRole("button", { name: "编辑复制任务链接快捷键" });
  expect(edit).toHaveTextContent("L");
  fireEvent.click(edit);
  fireEvent.keyDown(window, { key: "j", ctrlKey: true, shiftKey: true });
  expect(readKeyboardShortcuts()).toHaveProperty("copyTaskLink.key", "j");
  expect(screen.getByRole("status", { name: "已保存" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "清除复制任务链接快捷键" }));
  expect(readKeyboardShortcuts()).toHaveProperty("copyTaskLink.key", "");
  fireEvent.click(screen.getByRole("button", { name: "重设为预设值" }));
  expect(readKeyboardShortcuts()).toHaveProperty("copyTaskLink", { key: "l", primary: true, shift: true, alt: false });
});
it("SET36 copy recording failure never claims saved or changes its previous binding", () => {
  mount();
  const before = readKeyboardShortcuts();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  fireEvent.click(screen.getByRole("button", { name: "编辑复制任务链接快捷键" }));
  fireEvent.keyDown(window, { key: "j", ctrlKey: true, shiftKey: true });
  expect(screen.getByRole("alert")).toHaveTextContent("无法保存");
  expect(screen.queryByRole("status", { name: "已保存" })).toBeNull();
  expect(readKeyboardShortcuts()).toEqual(before);
});
// SET36-END: copy-task-link-settings-row

// SET45-BEGIN: reference-sidebar-preset-with-saved-binding-preservation
it("SET45 retains a saved B binding until explicit reset then dispatches period to the real sidebar", () => {
  const saved = { ...readKeyboardShortcuts(), sidebar: { key: "b", primary: true, shift: false, alt: false } };
  writeKeyboardShortcuts(saved);
  const raw = localStorage.getItem("kokoro.web.keyboard-shortcuts");
  const view = mount();
  expect(screen.getByRole("button", { name: "编辑切换侧边栏快捷键" })).toHaveTextContent("B");
  fireEvent.keyDown(window, { key: "b", ctrlKey: true });
  expect(screen.getByTestId("sidebar-state")).toHaveTextContent("collapsed");
  expect(localStorage.getItem("kokoro.web.keyboard-shortcuts")).toBe(raw);
  view.unmount();
  mount();
  expect(screen.getByRole("button", { name: "编辑切换侧边栏快捷键" })).toHaveTextContent("B");
  expect(localStorage.getItem("kokoro.web.keyboard-shortcuts")).toBe(raw);
  fireEvent.click(screen.getByRole("button", { name: "重设为预设值" }));
  expect(readKeyboardShortcuts().sidebar).toEqual({ key: ".", primary: true, shift: false, alt: false });
  expect(screen.getByRole("button", { name: "编辑切换侧边栏快捷键" })).toHaveTextContent(".");
  fireEvent.keyDown(window, { key: "b", ctrlKey: true });
  expect(screen.getByTestId("sidebar-state")).toHaveTextContent("expanded");
  fireEvent.keyDown(window, { key: ".", code: "Period", ctrlKey: true });
  expect(screen.getByTestId("sidebar-state")).toHaveTextContent("collapsed");
});
// SET45-END: reference-sidebar-preset-with-saved-binding-preservation
