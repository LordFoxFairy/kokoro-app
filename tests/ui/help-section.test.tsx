import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HelpSection } from "@/ui/settings/sections/help-section";
import { LocaleProvider } from "@/i18n/context";
beforeEach(() => window.localStorage.setItem("kokoro.locale", "zh"));
afterEach(cleanup);
it("offers real setting navigation and no fictitious support delivery", () => {
  const select = vi.fn();
  render(
    <LocaleProvider>
      <HelpSection onSelectSetting={select} />
    </LocaleProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "账户" }));
  expect(select).toHaveBeenLastCalledWith("account");
  fireEvent.click(screen.getByRole("button", { name: "数据管理" }));
  expect(select).toHaveBeenLastCalledWith("data-management");
  expect(screen.queryByRole("button", { name: /发送|客服/ })).toBeNull();
});
