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
const storedTask = { triggerKind: "calendar" as const,
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


it("keeps the selected weekday through preview storage and a later prompt-only edit", async () => {
  render(<LocaleProvider><ScheduledTaskSurface mode="preview" brandName="Kokoro" /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: /建立您的排程任务/ }));
  fireEvent.change(screen.getByLabelText("未读邮件摘要"), { target: { value: "Weekly preview" } });
  fireEvent.change(screen.getByLabelText("汇总未读邮件并突出显示重要邮件"), { target: { value: "Preview only" } });
  fireEvent.keyDown(screen.getByRole("combobox", { name: "排程" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "每周" }));
  fireEvent.keyDown(screen.getByRole("button", { name: "星期" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "周二" }));
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const first = JSON.parse(window.localStorage.getItem(storageKey)!)[0];
  expect(first.weekdays).toEqual([2]);
  expect(screen.getByRole("listitem")).toHaveTextContent(/每周\s+周二/u);
  fireEvent.pointerDown(screen.getByRole("button", { name: "排程任务选项 Weekly preview" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑" }));
  expect(screen.getByRole("button", { name: "星期" })).toHaveTextContent("周二");
  fireEvent.change(screen.getByLabelText("汇总未读邮件并突出显示重要邮件"), { target: { value: "Changed preview only" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(JSON.parse(window.localStorage.getItem(storageKey)!)[0]).toMatchObject({ weekdays: first.weekdays, prompt: "Changed preview only" });
});

it("I6 does not adopt kindless legacy cache or manufacture RSS poll facts", async () => {
  window.localStorage.setItem("kokoro.locale", "en")
  window.localStorage.setItem(storageKey, JSON.stringify([{ id: "legacy", title: "Legacy", frequency: "daily", time: "08:00" }]))
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No feed IO in preview"))
  render(<LocaleProvider><ScheduledTaskSurface mode="preview" /></LocaleProvider>)
  expect(screen.queryByText("Legacy")).toBeNull()
  expect(window.localStorage.getItem(storageKey)).toContain("legacy")
  fireEvent.click(screen.getByRole("button", { name: "Create trigger" }))
  fireEvent.click(screen.getByRole("button", { name: "Triggers" }))
  fireEvent.change(screen.getByRole("textbox", { name: "Unread email summary" }), { target: { value: "Preview feed" } })
  fireEvent.change(screen.getByRole("textbox", { name: "RSS feed URL" }), { target: { value: "https://news.example.com/feed" } })
  fireEvent.change(screen.getByRole("textbox", { name: "Summarize unread email and highlight important messages" }), { target: { value: "Summarize" } })
  fireEvent.click(screen.getByRole("button", { name: "Create automation" }))
  await screen.findByText("Preview feed")
  const rows = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]")
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ triggerKind: "rss", nextRun: null, conditions: [] })
  expect(rows[0]).not.toHaveProperty("feedState")
  expect(rows[0]).not.toHaveProperty("schedulingState")
  expect(rows[0]).not.toHaveProperty("nextCheckAt")
  expect(fetcher).not.toHaveBeenCalled()
})

it.each([
  ["script URL", { feedUrl: "javascript:invalid" }],
  ["HTTP URL", { feedUrl: "http://news.example.com/feed" }],
  ["credential URL", { feedUrl: "https://user@news.example.com/feed" }],
  ["private hostname", { feedUrl: "https://feed.local/feed" }],
  ["IP address", { feedUrl: "https://127.0.0.1/feed" }],
  ["URL fragment", { feedUrl: "https://news.example.com/feed#part" }],
  ["unknown feed state", { feedState: "not-a-feed-state" }],
  ["non-string feed state", { feedState: 1 }],
  ["invalid last check", { lastCheckedAt: "not-a-time" }],
  ["non-UTC next check", { nextCheckAt: "2026-10-23T10:00:00+08:00" }],
  ["non-string next check", { nextCheckAt: 1 }],
  ["unknown scheduling state", { schedulingState: "not-a-state" }],
  ["unknown error code", { errorCode: "not-an-owner-code" }],
  ["non-string error code", { errorCode: 1 }],
] as const)("I6 guard drops malformed RSS %s without clearing the cache or reading a feed", async (name, extra) => {
  const { isScheduledTaskRecord } = await import("@/features/scheduled-tasks")
  const row = { id: "rss-invalid", title: "Invalid stored feed", triggerKind: "rss", feedUrl: "https://news.example.com/feed", conditions: [], nextRun: null, ...extra }
  expect(isScheduledTaskRecord(row), name).toBe(false)
  const serialized = JSON.stringify([row])
  window.localStorage.setItem(storageKey, serialized)
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No feed IO in preview"))
  render(<LocaleProvider><ScheduledTaskSurface mode="preview" /></LocaleProvider>)
  expect(screen.queryByText("Invalid stored feed")).toBeNull()
  expect(window.localStorage.getItem(storageKey)).toBe(serialized)
  expect(fetcher).not.toHaveBeenCalled()
})

it("I6 guard accepts RSS preview definitions and closed controlled feed facts", async () => {
  const { isScheduledTaskRecord } = await import("@/features/scheduled-tasks")
  const row = { id: "rss-valid", title: "Valid stored feed", triggerKind: "rss", feedUrl: "https://news.example.com/feed", conditions: [[{ field: "title", operator: "contains", value: "发布" }]], nextRun: null }
  expect(isScheduledTaskRecord(row)).toBe(true)
  for (const feedState of ["initializing", "active", "backoff", "limit_reached"]) {
    for (const schedulingState of ["pending", "active", "paused", "exhausted", "failed"]) {
      expect(isScheduledTaskRecord({ ...row, feedState, schedulingState, lastCheckedAt: "2026-10-23T02:00:00.123456Z", nextCheckAt: null, errorCode: null })).toBe(true)
    }
  }
  expect(isScheduledTaskRecord({ ...row, lastCheckedAt: null, nextCheckAt: "2026-10-23T02:01:00Z", errorCode: "rss_feed_timeout" })).toBe(true)
  window.localStorage.setItem(storageKey, JSON.stringify([row]))
  render(<LocaleProvider><ScheduledTaskSurface mode="preview" /></LocaleProvider>)
  expect(screen.getByText("Valid stored feed")).toBeVisible()
})

it.each([
  ["status", { status: ["active"] }],
  ["condition field", { conditions: [[{ field: ["title"], operator: "contains", value: "release" }]] }],
  ["condition operator", { conditions: [[{ field: "title", operator: ["contains"], value: "release" }]] }],
] as const)("I6 JSON arrays cannot stand in for the RSS %s enum", async (name, extra) => {
  const { isScheduledTaskRecord } = await import("@/features/scheduled-tasks")
  const row = JSON.parse(JSON.stringify({ id: "rss-array", title: "Invalid array enum", triggerKind: "rss", feedUrl: "https://news.example.com/feed", conditions: [], nextRun: null, ...extra }))
  expect(isScheduledTaskRecord(row), name).toBe(false)
  const serialized = JSON.stringify([row])
  window.localStorage.setItem(storageKey, serialized)
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No feed IO in preview"))
  render(<LocaleProvider><ScheduledTaskSurface mode="preview" /></LocaleProvider>)
  expect(screen.queryByText("Invalid array enum")).toBeNull()
  expect(window.localStorage.getItem(storageKey)).toBe(serialized)
  expect(fetcher).not.toHaveBeenCalled()
})
