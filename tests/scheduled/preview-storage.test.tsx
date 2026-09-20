import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ScheduledTaskSurface } from "@/features/scheduled-tasks";
import { LocaleProvider } from "@/i18n/context";

const storageKey = "kokoro.preview.scheduled-tasks";
const storedTask = {
  id: "scheduled_preview_1",
  title: "Stored task",
  prompt: "Run it",
  frequency: "daily",
  time: "08:00",
  timezone: "UTC",
  nextRun: "2026-09-15T08:00:00.000Z",
  enabled: true,
  status: "active",
} as const;

beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh");
  window.localStorage.removeItem(storageKey);
  window.history.replaceState(null, "", "/app/scheduled?tab=list");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("drops a stored record when any optional field fails the runtime guard", async () => {
  window.localStorage.setItem(
    storageKey,
    JSON.stringify([{ ...storedTask, autoApprove: "yes" }]),
  );

  render(
    <LocaleProvider>
      <ScheduledTaskSurface mode="preview" brandName="Kokoro" />
    </LocaleProvider>,
  );

  await waitFor(() =>
    expect(screen.queryByText("Stored task")).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
    "Kokoro 能独立执行工作",
  );
});

it("contains localStorage get failures and presents a usable empty preview", () => {
  const getItem = Storage.prototype.getItem;
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(
    function getItemWithFailure(this: Storage, key) {
      if (key === storageKey)
        throw new DOMException("blocked", "SecurityError");
      return getItem.call(this, key);
    },
  );

  expect(() =>
    render(
      <LocaleProvider>
        <ScheduledTaskSurface mode="preview" brandName="Kokoro" />
      </LocaleProvider>,
    ),
  ).not.toThrow();
  expect(
    screen.getByRole("button", { name: /建立您的排程任务/ }),
  ).toBeEnabled();
});

it("contains localStorage set failures and keeps the editor recoverable", async () => {
  const setItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(
    function setItemWithFailure(this: Storage, key, value) {
      if (key === storageKey)
        throw new DOMException("quota", "QuotaExceededError");
      setItem.call(this, key, value);
    },
  );
  render(
    <LocaleProvider>
      <ScheduledTaskSurface mode="preview" brandName="Kokoro" />
    </LocaleProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: /建立您的排程任务/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "未读邮件摘要" }), {
    target: { value: "New task" },
  });
  fireEvent.change(
    screen.getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" }),
    { target: { value: "Run it" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "保存" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "操作失败，请重试。",
  );
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

it("contains localStorage remove failures and reports them inside delete confirmation", async () => {
  window.localStorage.setItem(storageKey, JSON.stringify([storedTask]));
  const removeItem = Storage.prototype.removeItem;
  const removeSpy = vi
    .spyOn(Storage.prototype, "removeItem")
    .mockImplementation(function removeItemWithFailure(this: Storage, key) {
      if (key === storageKey)
        throw new DOMException("blocked", "SecurityError");
      removeItem.call(this, key);
    });
  render(
    <LocaleProvider>
      <ScheduledTaskSurface mode="preview" brandName="Kokoro" />
    </LocaleProvider>,
  );

  const card = await screen.findByRole("listitem");
  fireEvent.pointerDown(
    within(card).getByRole("button", { name: "排程任务选项 Stored task" }),
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: "删除" }));
  const dialog = screen.getByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "删除" }));

  await waitFor(() =>
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "操作失败，请重试。",
    ),
  );
  expect(removeSpy).toHaveBeenCalledWith(storageKey);
  expect(screen.getByText("Stored task")).toBeInTheDocument();
});
