import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ScheduledTaskSurface, type ScheduledTaskClient, type ScheduledTaskRecord } from "@/features/scheduled-tasks";
import { LocaleProvider } from "@/i18n/context";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";

// The existing client can expose this additional read capability. These tests
// exercise the real Surface; no future component or hook is mocked/imported.
type RunState = "pending" | "admission_unknown" | "admitted" | "dispatch_failed" | "completed" | "cancelled" | "failed";
type RunItem = Readonly<{ triggerKind: "calendar";
  taskId: string;
  title: string;
  projectRef: string | null;
  runId: string;
  scheduledFor: string;
  state: RunState;
  terminalEventAt: string | null;
}>;
type RunPage = Readonly<{ items: readonly RunItem[]; nextCursor: string | null }>;
type RunQuery = Readonly<{ limit: number; taskId?: string; cursor?: string }>;
type RunReader = (query: RunQuery, signal: AbortSignal) => Promise<RunPage>;
type RunsCapableClient = ScheduledTaskClient & { listScheduledTaskRuns?: RunReader };

const boundary: ProjectReadBoundary = { admitted: true, subject: "runs-owner-A", generation: 1 };
const tasks: readonly ScheduledTaskRecord[] = [
  { triggerKind: "calendar" as const, id: "task-A", title: "项目A任务", projectId: "project-A", frequency: "daily", time: "08:00", nextRun: "2026-10-22T08:00:00Z" },
  { triggerKind: "calendar" as const, id: "task-A2", title: "项目A第二项", projectId: "project-A", frequency: "daily", time: "09:00", nextRun: "2026-10-22T09:00:00Z" },
  { triggerKind: "calendar" as const, id: "task-B", title: "项目B任务", projectId: "project-B", frequency: "daily", time: "10:00", nextRun: "2026-10-22T10:00:00Z" },
];

beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh");
  window.localStorage.removeItem("kokoro.preview.scheduled-tasks");
  window.history.replaceState(null, "", "/app/scheduled?tab=list");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function clientFixture(read: RunReader = vi.fn<RunReader>().mockResolvedValue({ items: [], nextCursor: null })) {
  const client = {
    listScheduledTasks: vi.fn<ScheduledTaskClient["listScheduledTasks"]>().mockResolvedValue(tasks),
    createScheduledTask: vi.fn<ScheduledTaskClient["createScheduledTask"]>(),
    updateScheduledTask: vi.fn<ScheduledTaskClient["updateScheduledTask"]>(),
    retryScheduledTask: vi.fn<ScheduledTaskClient["retryScheduledTask"]>(),
    deleteScheduledTask: vi.fn<ScheduledTaskClient["deleteScheduledTask"]>(),
    listScheduledTaskRuns: vi.fn<RunReader>(read),
  };
  return client;
}

function live(client: RunsCapableClient, currentBoundary = boundary) {
  return <LocaleProvider><ScheduledTaskSurface mode="live" scheduledTaskClient={client} projectReadBoundary={currentBoundary} displayTimezone="Asia/Shanghai" /></LocaleProvider>;
}

async function ready(client: ReturnType<typeof clientFixture>) {
  const rendered = render(live(client));
  await waitFor(() => expect(client.listScheduledTasks).toHaveBeenCalledTimes(1));
  await screen.findByRole("tab", { name: "任务", selected: true });
  return rendered;
}

async function openUpdates() {
  fireEvent.click(screen.getByRole("tab", { name: "更新" }));
  await screen.findByRole("tab", { name: "更新", selected: true });
  return screen.getByRole("region", { name: "运行记录" });
}

function navigate(path: string) {
  act(() => {
    window.history.replaceState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

async function selectTask(title: string) {
  const selector = screen.getByRole("combobox", { name: "选择任务" });
  if (selector instanceof HTMLSelectElement) {
    const option = within(selector).getByRole("option", { name: title });
    fireEvent.change(selector, { target: { value: option.getAttribute("value") } });
  } else {
    fireEvent.pointerDown(selector, { button: 0, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("option", { name: title }));
  }
}

function item(title: string, state: RunState = "completed", runId = `run-${title}`): RunItem {
  return { triggerKind: "calendar" as const,
    taskId: "task-A", title, projectRef: "project-A", runId,
    scheduledFor: "2026-10-21T23:30:00.123456789Z", state,
    terminalEventAt: ["completed", "cancelled", "failed"].includes(state) ? "2026-10-21T23:32:00.456Z" : null,
  };
}

function noMutation(client: ReturnType<typeof clientFixture>) {
  expect(client.createScheduledTask).not.toHaveBeenCalled();
  expect(client.updateScheduledTask).not.toHaveBeenCalled();
  expect(client.retryScheduledTask).not.toHaveBeenCalled();
  expect(client.deleteScheduledTask).not.toHaveBeenCalled();
}

it.each(["empty", "error"] as const)("I4 updates keeps a third shared view available when the task source is %s", async (source) => {
  const client = clientFixture();
  if (source === "empty") client.listScheduledTasks.mockResolvedValue([]);
  else client.listScheduledTasks.mockRejectedValue(new Error("owner details must not be shown"));
  render(live(client));
  await waitFor(() => expect(client.listScheduledTasks).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("tab", { name: "日历" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "任务" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "更新" })).toBeVisible();
  const region = await openUpdates();
  if (source === "error") {
    expect(await within(region).findByRole("alert")).toBeVisible();
    expect(client.listScheduledTaskRuns).not.toHaveBeenCalled();
  } else {
    await waitFor(() => expect(client.listScheduledTaskRuns).toHaveBeenCalledTimes(1));
    expect(within(region).getByText("暂无运行记录")).toBeVisible();
  }
  noMutation(client);
});

it("I4 updates reads the global page once and displays only seven truthful metadata states and scheduled time", async () => {
  const states: readonly [RunState, string][] = [
    ["pending", "等待投递"], ["admission_unknown", "受理待确认"], ["admitted", "已受理"],
    ["dispatch_failed", "投递失败"], ["completed", "完成"], ["cancelled", "取消"], ["failed", "执行失败"],
  ];
  const client = clientFixture(async () => ({ items: states.map(([state]) => item(`记录-${state}`, state)), nextCursor: null }));
  await ready(client);
  expect(client.listScheduledTaskRuns).not.toHaveBeenCalled();
  const region = await openUpdates();
  await waitFor(() => expect(client.listScheduledTaskRuns).toHaveBeenCalledTimes(1));
  expect(client.listScheduledTaskRuns.mock.calls[0]?.[0]).toEqual({ limit: 20 });
  expect(client.listScheduledTaskRuns.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
  for (const [state, label] of states) {
    expect(await within(region).findByText(`记录-${state}`)).toBeVisible();
    expect(within(region).getByText(label, { exact: true })).toBeVisible();
  }
  const scheduledTimes = region.querySelectorAll('time[datetime="2026-10-21T23:30:00.123456789Z"]');
  expect(scheduledTimes).toHaveLength(7);
  for (const time of scheduledTimes) expect(time).toHaveTextContent("07:30");
  expect(within(region).getByText(/2026.*10.*22/u)).toBeVisible();
  for (const label of within(region).getAllByText(/计划执行时间/u)) expect(label).toBeVisible();
  expect(within(region).queryByText(/运行中|已开始|运行耗时|查看结果|查看会话/u)).toBeNull();
  expect(within(region).queryByRole("link")).toBeNull();
  noMutation(client);
});

it("I4 updates requires a current project task before reading and never fetches a global page to filter", async () => {
  navigate("/app/scheduled?tab=list&project_id=project-A");
  const client = clientFixture(async () => ({ items: [item("仅A任务运行")], nextCursor: null }));
  await ready(client);
  const region = await openUpdates();
  expect(within(region).getByText("请选择当前项目的任务以查看运行记录。")).toBeVisible();
  expect(client.listScheduledTaskRuns).not.toHaveBeenCalled();
  await selectTask("项目A任务");
  await within(region).findByText("仅A任务运行");
  expect(client.listScheduledTaskRuns).toHaveBeenCalledExactlyOnceWith({ limit: 20, taskId: "task-A" }, expect.any(AbortSignal));
  const selector = screen.getByRole("combobox", { name: "选择任务" });
  if (selector instanceof HTMLSelectElement) expect(within(selector).queryByRole("option", { name: "项目B任务" })).toBeNull();
  else {
    fireEvent.pointerDown(selector, { button: 0, pointerType: "mouse" });
    expect(screen.queryByRole("option", { name: "项目B任务" })).toBeNull();
    fireEvent.keyDown(selector, { key: "Escape" });
  }
  noMutation(client);
});

it("I4 updates replaces pages, synchronously blocks duplicate reads, and refreshes without the old cursor", async () => {
  const pendingPage = deferred<RunPage>();
  const client = clientFixture();
  client.listScheduledTaskRuns.mockResolvedValueOnce({ items: [item("第一页")], nextCursor: "owner-cursor-2" })
    .mockImplementationOnce(() => pendingPage.promise)
    .mockResolvedValueOnce({ items: [item("刷新第一页")], nextCursor: null });
  await ready(client);
  const region = await openUpdates();
  await within(region).findByText("第一页");
  const next = within(region).getByRole("button", { name: "下一页" });
  act(() => { next.click(); next.click(); });
  await waitFor(() => expect(client.listScheduledTaskRuns).toHaveBeenCalledTimes(2));
  expect(client.listScheduledTaskRuns.mock.calls[1]?.[0]).toEqual({ limit: 20, cursor: "owner-cursor-2" });
  expect(within(region).queryByText("第一页")).toBeNull();
  expect(within(region).getByRole("button", { name: "刷新运行记录" })).toBeDisabled();
  await act(async () => pendingPage.resolve({ items: [item("第二页")], nextCursor: null }));
  await within(region).findByText("第二页");
  expect(within(region).queryByText("第一页")).toBeNull();
  fireEvent.click(within(region).getByRole("button", { name: "刷新运行记录" }));
  await within(region).findByText("刷新第一页");
  expect(client.listScheduledTaskRuns.mock.calls.map(([query]) => query)).toEqual([
    { limit: 20 }, { limit: 20, cursor: "owner-cursor-2" }, { limit: 20 },
  ]);
  expect(within(region).queryByText("第二页")).toBeNull();
  noMutation(client);
});

it("I4 updates clears an old page immediately and after a failed refresh, and retries only explicitly", async () => {
  const failedRead = deferred<RunPage>();
  const client = clientFixture();
  client.listScheduledTaskRuns.mockResolvedValueOnce({ items: [item("旧记录不可继续显示")], nextCursor: "old-page" })
    .mockImplementationOnce(() => failedRead.promise)
    .mockResolvedValueOnce({ items: [item("显式重读结果")], nextCursor: null });
  await ready(client);
  const region = await openUpdates();
  await within(region).findByText("旧记录不可继续显示");
  fireEvent.click(within(region).getByRole("button", { name: "刷新运行记录" }));
  expect(within(region).queryByText("旧记录不可继续显示")).toBeNull();
  await act(async () => failedRead.reject(new Error("private owner detail")));
  expect(within(region).getByRole("alert")).toBeVisible();
  expect(within(region).queryByText("旧记录不可继续显示")).toBeNull();
  expect(within(region).queryByText("private owner detail")).toBeNull();
  expect(client.listScheduledTaskRuns).toHaveBeenCalledTimes(2);
  fireEvent.click(within(region).getByRole("button", { name: "重新读取运行记录" }));
  await within(region).findByText("显式重读结果");
  expect(client.listScheduledTaskRuns.mock.calls[2]?.[0]).toEqual({ limit: 20 });
  noMutation(client);
});

it.each(["subject", "generation", "admission", "client", "project", "task", "exit", "unmount"] as const)(
  "I4 updates aborts and permanently retires a late read after %s changes",
  async (change) => {
    const stale = deferred<RunPage>();
    const client = clientFixture();
    client.listScheduledTaskRuns.mockImplementationOnce(() => stale.promise);
    const freshClient = clientFixture();
    if (change === "task") navigate("/app/scheduled?tab=list&project_id=project-A");
    const rendered = await ready(client);
    await openUpdates();
    if (change === "task") await selectTask("项目A任务");
    await waitFor(() => expect(client.listScheduledTaskRuns).toHaveBeenCalledTimes(1));
    const signal = client.listScheduledTaskRuns.mock.calls[0]?.[1];
    expect(signal?.aborted).toBe(false);
    if (change === "subject") rendered.rerender(live(client, { ...boundary, subject: "runs-owner-B" }));
    if (change === "generation") rendered.rerender(live(client, { ...boundary, generation: 2 }));
    if (change === "admission") rendered.rerender(live(client, { ...boundary, admitted: false, generation: 2 }));
    if (change === "client") rendered.rerender(live(freshClient));
    if (change === "project") navigate("/app/scheduled?tab=updates&project_id=project-B");
    if (change === "task") await selectTask("项目A第二项");
    if (change === "exit") fireEvent.click(screen.getByRole("tab", { name: "任务" }));
    if (change === "unmount") rendered.unmount();
    expect(signal?.aborted).toBe(true);
    if (change === "subject" || change === "generation" || change === "admission") rendered.rerender(live(client));
    if (change === "client") rendered.rerender(live(client));
    if (change === "project") navigate("/app/scheduled?tab=updates");
    if (change === "exit") await openUpdates();
    await act(async () => {});
    const callsBeforeLateResult = client.listScheduledTaskRuns.mock.calls.length;
    await act(async () => stale.resolve({ items: [item("退休旧请求不得复活")], nextCursor: "retired-cursor" }));
    expect(screen.queryByText("退休旧请求不得复活")).toBeNull();
    expect(screen.queryByText("retired-cursor")).toBeNull();
    expect(client.listScheduledTaskRuns).toHaveBeenCalledTimes(callsBeforeLateResult);
    noMutation(client);
    noMutation(freshClient);
  },
);

it("I4 updates clears selected-task history when a replacement source fails and rejects the previous late read", async () => {
  navigate("/app/scheduled?tab=list&project_id=project-A");
  const late = deferred<RunPage>();
  const client = clientFixture();
  client.listScheduledTaskRuns.mockResolvedValueOnce({ items: [item("已读项目记录")], nextCursor: null }).mockImplementationOnce(() => late.promise);
  const unreadable = clientFixture();
  unreadable.listScheduledTasks.mockRejectedValue(new Error("private unreadable source detail"));
  const rendered = await ready(client);
  await openUpdates();
  await selectTask("项目A任务");
  await screen.findByText("已读项目记录");
  fireEvent.click(screen.getByRole("button", { name: "刷新运行记录" }));
  await waitFor(() => expect(client.listScheduledTaskRuns).toHaveBeenCalledTimes(2));
  const signal = client.listScheduledTaskRuns.mock.calls[1]?.[1];
  rendered.rerender(live(unreadable));
  await waitFor(() => expect(unreadable.listScheduledTasks).toHaveBeenCalledTimes(1));
  expect(signal?.aborted).toBe(true);
  const region = screen.getByRole("region", { name: "运行记录" });
  await waitFor(() => expect(within(region).getByRole("alert")).toBeVisible());
  await act(async () => late.resolve({ items: [item("失败源的晚记录")], nextCursor: null }));
  expect(screen.queryByText("已读项目记录")).toBeNull();
  expect(screen.queryByText("失败源的晚记录")).toBeNull();
  expect(screen.queryByText("private unreadable source detail")).toBeNull();
  expect(unreadable.listScheduledTaskRuns).not.toHaveBeenCalled();
  noMutation(client);
  noMutation(unreadable);
});

it.each(["preview", "controlled", "missing-read-capability"] as const)("I4 updates reports unavailable history without synthetic records or IO in %s mode", async (mode) => {
  const fetcher = vi.spyOn(globalThis, "fetch");
  const client = clientFixture();
  if (mode === "preview") render(<LocaleProvider><ScheduledTaskSurface mode="preview" /></LocaleProvider>);
  else if (mode === "controlled") render(<LocaleProvider><ScheduledTaskSurface mode="controlled" tasks={tasks} /></LocaleProvider>);
  else {
    const { listScheduledTaskRuns: omitted, ...withoutRuns } = client;
    expect(omitted).toBeDefined();
    render(live(withoutRuns));
    await waitFor(() => expect(client.listScheduledTasks).toHaveBeenCalledTimes(1));
  }
  const region = await openUpdates();
  expect(within(region).getByText("运行记录读取尚不可用。")).toBeVisible();
  expect(within(region).queryByText("暂无运行记录")).toBeNull();
  expect(client.listScheduledTaskRuns).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  noMutation(client);
});

it.each(["personal", "project"] as const)("I4 %s selection removal stops reads until a user explicitly selects again", async scope => {
  if (scope === "project") navigate("/app/scheduled?tab=list&project_id=project-A");
  const stale = deferred<RunPage>();
  const client = clientFixture();
  client.listScheduledTasks.mockResolvedValueOnce(tasks).mockResolvedValue(tasks.filter(task => task.id !== "task-A"));
  client.createScheduledTask.mockResolvedValue(tasks[1]!);
  await ready(client);
  await openUpdates();
  await selectTask("项目A任务");
  await waitFor(() => expect(client.listScheduledTaskRuns.mock.calls.at(-1)?.[0]).toEqual({ limit: 20, taskId: "task-A" }));
  client.listScheduledTaskRuns.mockImplementationOnce(() => stale.promise);
  fireEvent.click(screen.getByRole("button", { name: "刷新运行记录" }));
  const signal = client.listScheduledTaskRuns.mock.calls.at(-1)?.[1];
  const reads = client.listScheduledTaskRuns.mock.calls.length;
  navigate(`/app/scheduled?tab=updates${scope === "project" ? "&project_id=project-A" : ""}#scheduled-tasks/new`);
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "未读邮件摘要" }), { target: { value: "刷新任务清单" } });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" }), { target: { value: "刷新后的任务源" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
  await waitFor(() => expect(client.listScheduledTasks).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(signal?.aborted).toBe(true);
  await act(async () => stale.resolve({ items: [item("失效筛选晚结果")], nextCursor: null }));
  expect(screen.queryByText("失效筛选晚结果")).toBeNull();
  expect(client.listScheduledTaskRuns).toHaveBeenCalledTimes(reads);
  expect(screen.getByRole("button", { name: "刷新运行记录" })).toBeDisabled();
  if (scope === "personal") await selectTask("全部任务");
  else await selectTask("项目A第二项");
  await waitFor(() => expect(client.listScheduledTaskRuns).toHaveBeenCalledTimes(reads + 1));
  expect(client.listScheduledTaskRuns.mock.calls.at(-1)?.[0]).toEqual(scope === "personal" ? { limit: 20 } : { limit: 20, taskId: "task-A2" });
});

it("I6 shows actual RSS discovery labels and preserves owner order across observations", async () => {
 const base = clientFixture()
 const rows = [{ triggerKind: "rss" as const, taskId: "task-A", title: "较早发现但先排队", projectRef: "project-A", runId: "rss-1", scheduledFor: null, observedAt: "2026-10-23T01:00:00.123Z", state: "pending" as const, terminalEventAt: null }, { triggerKind: "rss" as const, taskId: "task-A", title: "较晚发现但后排队", projectRef: "project-A", runId: "rss-2", scheduledFor: null, observedAt: "2026-10-23T02:00:00.456Z", state: "admission_unknown" as const, terminalEventAt: null }]
 const read = vi.fn().mockResolvedValue({ items: rows, nextCursor: null })
 const client: ScheduledTaskClient = { ...base, listScheduledTaskRuns: read }
 render(<LocaleProvider><ScheduledTaskSurface mode="live" scheduledTaskClient={client} projectReadBoundary={boundary} displayTimezone="Asia/Shanghai" /></LocaleProvider>)
 await waitFor(() => expect(base.listScheduledTasks).toHaveBeenCalledOnce())
 await openUpdates()
 await screen.findByText("较早发现但先排队")
 const region = screen.getByRole("region", { name: "运行记录" })
 expect(within(region).getAllByText("发现时间")).toHaveLength(2)
 expect(within(region).queryByText("计划时间")).toBeNull()
 expect(Array.from(region.querySelectorAll("article strong"), node => node.textContent)).toEqual(rows.map(row => row.title))
 expect(Array.from(region.querySelectorAll("time"), node => node.dateTime)).toEqual(rows.map(row => row.observedAt))
 noMutation(base)
 expect(read).toHaveBeenCalledOnce()
})
