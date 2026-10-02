import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/i18n/context";
import {
  ScheduledTaskSurface,
  type ScheduledTaskClient,
} from "@/features/scheduled-tasks";

beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh");
  window.localStorage.removeItem("kokoro.preview.scheduled-tasks");
  window.history.replaceState(null, "", "/app/scheduled?tab=calendar");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderScheduled(onSave = vi.fn()) {
  render(
    <LocaleProvider>
      <ScheduledTaskSurface brandName="Kokoro" preview onSave={onSave} />
    </LocaleProvider>,
  );
  return onSave;
}

function scheduledTaskClient(
  overrides: Partial<ScheduledTaskClient>,
): ScheduledTaskClient {
  const unavailable = async (): Promise<never> => {
    throw new Error("ScheduledTask test operation is not configured");
  };
  return {
    listScheduledTasks: unavailable,
    createScheduledTask: unavailable,
    updateScheduledTask: unavailable,
    retryScheduledTask: unavailable,
    deleteScheduledTask: unavailable,
    ...overrides,
  };
}

it("呈现排程空态、三项建议和建立按钮", () => {
  renderScheduled();

  expect(screen.getByTestId("scheduled-surface")).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { level: 1, name: "已排程" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
    "Kokoro 能独立执行工作，无需您的干预",
  );
  expect(screen.getByRole("img", { name: "排程日历" })).toBeInTheDocument();
  expect(screen.getAllByRole("button")).toHaveLength(4);
  expect(
    screen.getByRole("button", { name: /建立您的排程任务/ }),
  ).toBeInTheDocument();
});

it("点击建议打开编辑器、写入 hash 并预填提示词", () => {
  renderScheduled();
  const suggestion = screen.getByRole("button", {
    name: /在一天开始前获取收件箱和日程的每日摘要/,
  });

  fireEvent.click(suggestion);

  expect(window.location.hash).toBe("#scheduled-tasks/new");
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByRole("textbox", {
      name: "汇总未读邮件并突出显示重要邮件",
    }),
  ).toHaveValue("在一天开始前获取收件箱和日程的每日摘要。");
  expect(within(dialog).getByRole("button", { name: "保存" })).toBeDisabled();
});

it("关闭编辑器清理 hash，再次打开时重置表单", () => {
  renderScheduled();
  fireEvent.click(
    screen.getByRole("button", {
      name: /为任何主题、竞争对手或关键词设置自动化监控/,
    }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "未读邮件摘要" }), {
    target: { value: "监控主题" },
  });
  fireEvent.click(screen.getByRole("button", { name: "关闭对话框" }));

  expect(window.location.hash).toBe("");
  fireEvent.click(screen.getByRole("button", { name: /建立您的排程任务/ }));
  expect(screen.getByRole("textbox", { name: "未读邮件摘要" })).toHaveValue("");
  expect(
    screen.getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" }),
  ).toHaveValue("");
});

it("通过浏览器历史关闭编辑器时清除旧任务上下文", async () => {
  window.history.replaceState(null, "", "/app/scheduled?tab=list");
  render(
    <LocaleProvider>
      <ScheduledTaskSurface
        brandName="Kokoro"
        tasks={[
          {
            id: "scheduled_history_1",
            title: "旧任务",
            prompt: "旧提示",
            frequency: "daily",
            time: "08:00",
          },
        ]}
        onUpdateTask={vi.fn()}
      />
    </LocaleProvider>,
  );

  const card = await screen.findByRole("listitem");
  fireEvent.pointerDown(
    within(card).getByRole("button", { name: "排程任务选项 旧任务" }),
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑" }));
  expect(screen.getByRole("textbox", { name: "未读邮件摘要" })).toHaveValue(
    "旧任务",
  );

  window.history.replaceState(null, "", "/app/scheduled?tab=list");
  fireEvent(window, new PopStateEvent("popstate"));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  window.history.replaceState(
    null,
    "",
    "/app/scheduled?tab=list#scheduled-tasks/new",
  );
  fireEvent(window, new HashChangeEvent("hashchange"));
  const reopened = await screen.findByRole("dialog");
  expect(
    within(reopened).getByRole("textbox", { name: "未读邮件摘要" }),
  ).toHaveValue("");
});

it("已挂载时收到站内 surface 导航事件会重新读取日历/任务视图", () => {
  window.history.replaceState(null, "", "/app/scheduled?tab=list");
  render(
    <LocaleProvider>
      <ScheduledTaskSurface
        brandName="Kokoro"
        preview
        tasks={[
          {
            id: "scheduled_navigation_1",
            title: "导航测试",
            frequency: "daily",
            time: "08:00",
          },
        ]}
      />
    </LocaleProvider>,
  );

  expect(screen.getByRole("tab", { name: "任务" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  window.history.pushState(null, "", "/app/scheduled?tab=calendar");
  fireEvent(window, new Event("kokoro:surface-navigation"));

  expect(screen.getByRole("tab", { name: "日历" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByTestId("scheduled-calendar-view")).toBeInTheDocument();
});

it("填写标题后保存结构化排程数据", () => {
  const onSave = renderScheduled();
  fireEvent.click(
    screen.getByRole("button", { name: /将手动流程转为定时自动化管道/ }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "未读邮件摘要" }), {
    target: { value: "每日流程" },
  });
  fireEvent.click(screen.getByRole("switch", { name: "自动核准" }));
  fireEvent.click(screen.getByRole("button", { name: "保存" }));

  expect(onSave).toHaveBeenCalledWith({
    title: "每日流程",
    prompt: "将手动流程转为定时自动化管道。",
    frequency: "daily",
    time: "08:00",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    expiresAt: undefined,
    autoApprove: true,
  });
});

it("勾选到期日期后必须先填写日期，短视口也不会把保存区推出 Dialog", () => {
  const onSave = renderScheduled();
  fireEvent.click(screen.getByRole("button", { name: /建立您的排程任务/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "未读邮件摘要" }), {
    target: { value: "每日流程" },
  });
  fireEvent.change(
    screen.getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" }),
    { target: { value: "执行每日流程" } },
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "设定到期日期" }));

  const save = screen.getByRole("button", { name: "保存" });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText("选择到期日期"), {
    target: { value: "2026-09-30" },
  });
  expect(save).toBeEnabled();
  fireEvent.click(save);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      expiresAt: expect.stringMatching(/^2026-10-01T0[0-9]:59:59\.999Z$/u),
      timezone,
    }),
  );
});

it("预览排程保存后进入列表并持久化本地 fixture", async () => {
  render(
    <LocaleProvider>
      <ScheduledTaskSurface brandName="Kokoro" preview />
    </LocaleProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: /建立您的排程任务/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "未读邮件摘要" }), {
    target: { value: "每日流程" },
  });
  fireEvent.change(
    screen.getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" }),
    { target: { value: "执行每日流程" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "保存" }));

  await waitFor(() =>
    expect(screen.getByTestId("scheduled-task-list")).toBeInTheDocument(),
  );
  expect(screen.getByText("每日流程")).toBeInTheDocument();
  expect(
    JSON.parse(
      window.localStorage.getItem("kokoro.preview.scheduled-tasks") ?? "[]",
    ),
  ).toEqual([
    expect.objectContaining({
      title: "每日流程",
      frequency: "daily",
      time: "08:00",
      enabled: true,
    }),
  ]);
});

it("预览排程通过宿主保存回调成功后仍更新本地列表", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <LocaleProvider>
      <ScheduledTaskSurface brandName="Kokoro" preview onSave={onSave} />
    </LocaleProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: /建立您的排程任务/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "未读邮件摘要" }), {
    target: { value: "回调每日流程" },
  });
  fireEvent.change(
    screen.getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" }),
    { target: { value: "执行回调流程" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "保存" }));

  await waitFor(() =>
    expect(screen.getByText("回调每日流程")).toBeInTheDocument(),
  );
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(
    JSON.parse(
      window.localStorage.getItem("kokoro.preview.scheduled-tasks") ?? "[]",
    ),
  ).toEqual([
    expect.objectContaining({
      title: "回调每日流程",
      prompt: "执行回调流程",
      enabled: true,
    }),
  ]);
});

it("live 模式缺少注入的 client 时显示错误，不把缺失 BFF 误当成空列表", async () => {
  render(
    <LocaleProvider>
      <ScheduledTaskSurface brandName="Kokoro" />
    </LocaleProvider>,
  );

  await waitFor(() =>
    expect(screen.getByTestId("scheduled-load-error")).toBeInTheDocument(),
  );
  expect(screen.queryByTestId("scheduled-task-list")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
});

it("live 模式先呈现 loading，GET 列表失败可用原请求重试并保留注入边界", async () => {
  const task = {
    id: "scheduled_live_1",
    title: "Live digest",
    frequency: "daily" as const,
    time: "08:00",
    status: "active" as const,
  };
  const listScheduledTasks = vi
    .fn()
    .mockRejectedValueOnce(new Error("BFF unavailable"))
    .mockResolvedValueOnce([task]);
  const client = scheduledTaskClient({ listScheduledTasks });
  window.history.replaceState(null, "", "/app/scheduled?tab=list");
  render(
    <LocaleProvider>
      <ScheduledTaskSurface brandName="Kokoro" scheduledTaskClient={client} />
    </LocaleProvider>,
  );

  expect(screen.getByTestId("scheduled-loading")).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByTestId("scheduled-load-error")).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: "重试" }));

  await waitFor(() =>
    expect(screen.getByText("Live digest")).toBeInTheDocument(),
  );
  expect(listScheduledTasks).toHaveBeenCalledTimes(2);
});

it("live client mutation 成功后重新 GET 投影，不靠 optimistic 状态伪造成功", async () => {
  const activeTask = {
    id: "scheduled_live_1",
    title: "Live digest",
    frequency: "daily" as const,
    time: "08:00",
    enabled: true,
  };
  const pausedTask = {
    ...activeTask,
    enabled: false,
    status: "paused" as const,
  };
  const listScheduledTasks = vi
    .fn()
    .mockResolvedValueOnce([activeTask])
    .mockResolvedValueOnce([pausedTask]);
  const updateScheduledTask = vi.fn().mockResolvedValue(pausedTask);
  const client = scheduledTaskClient({
    listScheduledTasks,
    updateScheduledTask,
  });
  window.history.replaceState(null, "", "/app/scheduled?tab=list");
  render(
    <LocaleProvider>
      <ScheduledTaskSurface brandName="Kokoro" scheduledTaskClient={client} />
    </LocaleProvider>,
  );

  const card = await screen.findByRole("listitem");
  fireEvent.pointerDown(
    within(card).getByRole("button", { name: "排程任务选项 Live digest" }),
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: "暂停" }));

  await waitFor(() =>
    expect(updateScheduledTask).toHaveBeenCalledWith("scheduled_live_1", {
      enabled: false,
      status: "paused",
    }),
  );
  await waitFor(() => expect(card).toHaveAttribute("data-status", "paused"));
  expect(listScheduledTasks).toHaveBeenCalledTimes(2);
});

it("任务状态指示器向辅助技术暴露本地化状态名称", async () => {
  window.history.replaceState(null, "", "/app/scheduled?tab=list");
  render(
    <LocaleProvider>
      <ScheduledTaskSurface
        brandName="Kokoro"
        tasks={[
          {
            id: "scheduled_status_1",
            title: "状态任务",
            frequency: "daily",
            time: "08:00",
            status: "paused",
          },
        ]}
      />
    </LocaleProvider>,
  );

  const card = await screen.findByRole("listitem");
  expect(within(card).getByRole("img", { name: "已暂停" })).toBeInTheDocument();
});

it("受控任务缺少 mutation handler 时禁用变更入口", async () => {
  window.history.replaceState(null, "", "/app/scheduled?tab=list");
  render(
    <LocaleProvider>
      <ScheduledTaskSurface
        brandName="Kokoro"
        tasks={[
          {
            id: "scheduled_controlled_1",
            title: "Controlled",
            frequency: "daily",
            time: "08:00",
            enabled: true,
          },
        ]}
      />
    </LocaleProvider>,
  );

  const card = await screen.findByRole("listitem");
  fireEvent.pointerDown(
    within(card).getByRole("button", { name: "排程任务选项 Controlled" }),
  );
  expect(await screen.findByRole("menuitem", { name: "暂停" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(screen.getByRole("menuitem", { name: "编辑" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(screen.getByRole("menuitem", { name: "删除" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

it("编辑 draft 保留隐式时区，不在编辑器中增加额外的时区控件", async () => {
  window.history.replaceState(null, "", "/app/scheduled?tab=list");
  const onUpdateTask = vi.fn().mockResolvedValue(undefined);
  render(
    <LocaleProvider>
      <ScheduledTaskSurface
        brandName="Kokoro"
        tasks={[
          {
            id: "scheduled_controlled_1",
            title: "Controlled",
            prompt: "Run it",
            frequency: "daily",
            time: "08:00",
          },
        ]}
        onUpdateTask={onUpdateTask}
      />
    </LocaleProvider>,
  );

  const card = await screen.findByRole("listitem");
  fireEvent.pointerDown(
    within(card).getByRole("button", { name: "排程任务选项 Controlled" }),
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑" }));
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).queryByRole("textbox", { name: "时区" }),
  ).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));

  await waitFor(() =>
    expect(onUpdateTask).toHaveBeenCalledWith(
      "scheduled_controlled_1",
      expect.objectContaining({
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    ),
  );
});

it("列表视图支持暂停、编辑和删除，并把视图写回 URL", async () => {
  window.localStorage.setItem(
    "kokoro.preview.scheduled-tasks",
    JSON.stringify([
      {
        id: "scheduled_preview_1",
        title: "每日摘要",
        prompt: "整理今天的重要事项",
        frequency: "daily",
        time: "08:00",
        enabled: true,
      },
    ]),
  );
  window.history.replaceState(null, "", "/app/scheduled?tab=list");
  render(
    <LocaleProvider>
      <ScheduledTaskSurface brandName="Kokoro" preview />
    </LocaleProvider>,
  );

  await waitFor(() =>
    expect(screen.getByTestId("scheduled-task-list")).toBeInTheDocument(),
  );
  expect(screen.getByRole("tab", { name: "任务" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  fireEvent.pointerDown(
    screen.getByRole("button", { name: "排程任务选项 每日摘要" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("menuitem", { name: "暂停" })).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "暂停" }));
  await waitFor(() => expect(screen.getByText(/已暂停/)).toBeInTheDocument());

  fireEvent.pointerDown(
    screen.getByRole("button", { name: "排程任务选项 每日摘要" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("menuitem", { name: "编辑" })).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "编辑" }));
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByRole("textbox", { name: "未读邮件摘要" }),
  ).toHaveValue("每日摘要");
  fireEvent.change(
    within(dialog).getByRole("textbox", { name: "未读邮件摘要" }),
    { target: { value: "工作日摘要" } },
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
  await waitFor(() =>
    expect(screen.getByText("工作日摘要")).toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "排程任务选项 工作日摘要" }),
    ).toHaveFocus(),
  );

  fireEvent.pointerDown(
    screen.getByRole("button", { name: "排程任务选项 工作日摘要" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("menuitem", { name: "删除" })).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "删除" }));
  const confirm = screen.getByRole("alertdialog");
  fireEvent.click(within(confirm).getByRole("button", { name: "删除" }));
  await waitFor(() =>
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Kokoro 能独立执行工作，无需您的干预",
    ),
  );
  expect(window.location.search).toBe("?tab=list");
});

it("删除失败时保留确认框，显示错误并允许再次提交", async () => {
  const onDeleteTask = vi
    .fn()
    .mockRejectedValue(new Error("delete unavailable"));
  window.history.replaceState(null, "", "/app/scheduled?tab=list");
  render(
    <LocaleProvider>
      <ScheduledTaskSurface
        brandName="Kokoro"
        tasks={[
          {
            id: "scheduled_delete_1",
            title: "待删除任务",
            frequency: "daily",
            time: "08:00",
          },
        ]}
        onDeleteTask={onDeleteTask}
      />
    </LocaleProvider>,
  );

  const card = await screen.findByRole("listitem");
  fireEvent.pointerDown(
    within(card).getByRole("button", { name: "排程任务选项 待删除任务" }),
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: "删除" }));
  const confirm = screen.getByRole("alertdialog");
  fireEvent.click(within(confirm).getByRole("button", { name: "删除" }));

  await waitFor(() =>
    expect(within(card).getByText("操作失败，请重试。")).toBeInTheDocument(),
  );
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  expect(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "删除",
    }),
  ).toBeEnabled();
  expect(onDeleteTask).toHaveBeenCalledTimes(1);
});

it("日历月份切换时按实际日期显示任务", () => {
  vi.useFakeTimers({ now: new Date(2026, 8, 15, 12, 0, 0) });
  render(
    <LocaleProvider>
      <ScheduledTaskSurface
        brandName="Kokoro"
        tasks={[
          {
            id: "scheduled_failed_1",
            title: "失败任务",
            prompt: "检查失败任务",
            frequency: "daily",
            time: "08:00",
            nextRun: "2026-09-15T08:00:00",
            status: "failed",
          },
        ]}
      />
    </LocaleProvider>,
  );

  const monthTitle = screen.getByTestId("scheduled-calendar-title");
  expect(monthTitle).toHaveAttribute("data-month", "2026-09");
  expect(
    screen.getByTestId("scheduled-calendar-day-2026-09-15"),
  ).toHaveTextContent("失败任务");

  fireEvent.click(screen.getByRole("button", { name: "下个月" }));
  expect(monthTitle).toHaveAttribute("data-month", "2026-10");
  expect(
    screen.getByTestId("scheduled-calendar-day-2026-10-15"),
  ).toBeInTheDocument();
  expect(
    screen.getByTestId("scheduled-calendar-day-2026-10-15"),
  ).not.toHaveTextContent("失败任务");

  fireEvent.click(screen.getByRole("button", { name: "上个月" }));
  fireEvent.click(screen.getByRole("button", { name: "今天" }));
  expect(monthTitle).toHaveAttribute("data-month", "2026-09");
});

it("失败任务在列表操作中支持 retry，并在本地 fixture 中恢复运行", async () => {
  window.localStorage.setItem(
    "kokoro.preview.scheduled-tasks",
    JSON.stringify([
      {
        id: "scheduled_failed_1",
        title: "失败任务",
        prompt: "检查失败任务",
        frequency: "daily",
        time: "08:00",
        enabled: false,
        status: "failed",
      },
    ]),
  );
  window.history.replaceState(null, "", "/app/scheduled?tab=list");
  render(
    <LocaleProvider>
      <ScheduledTaskSurface brandName="Kokoro" preview />
    </LocaleProvider>,
  );

  const card = await screen.findByRole("listitem");
  expect(card).toHaveAttribute("data-status", "failed");
  fireEvent.pointerDown(
    within(card).getByRole("button", { name: "排程任务选项 失败任务" }),
  );
  const retry = await screen.findByRole("menuitem", { name: "重试" });
  fireEvent.click(retry);

  await waitFor(() => expect(card).toHaveAttribute("data-status", "active"));
  expect(within(card).getByText(/运行中/)).toBeInTheDocument();
  expect(
    JSON.parse(
      window.localStorage.getItem("kokoro.preview.scheduled-tasks") ?? "[]",
    ),
  ).toEqual([
    expect.objectContaining({
      id: "scheduled_failed_1",
      status: "active",
      enabled: true,
    }),
  ]);
});

it("失败任务 retry 交给宿主 mutation，外部任务源未更新前不伪造成功", async () => {
  const onRetryTask = vi.fn().mockResolvedValue(undefined);
  window.history.replaceState(null, "", "/app/scheduled?tab=list");
  render(
    <LocaleProvider>
      <ScheduledTaskSurface
        brandName="Kokoro"
        tasks={[
          {
            id: "scheduled_failed_1",
            title: "失败任务",
            frequency: "daily",
            time: "08:00",
            status: "failed",
          },
        ]}
        onRetryTask={onRetryTask}
      />
    </LocaleProvider>,
  );

  const card = await screen.findByRole("listitem");
  fireEvent.pointerDown(
    within(card).getByRole("button", { name: "排程任务选项 失败任务" }),
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: "重试" }));

  await waitFor(() =>
    expect(onRetryTask).toHaveBeenCalledWith("scheduled_failed_1"),
  );
  expect(card).toHaveAttribute("data-status", "failed");
});

it("列表使用可读的本地化下一次运行时间，而不是把 ISO 字符串直接暴露给用户", async () => {
  window.history.replaceState(null, "", "/app/scheduled?tab=list");
  render(
    <LocaleProvider>
      <ScheduledTaskSurface
        brandName="Kokoro"
        tasks={[
          {
            id: "scheduled_1",
            title: "每日摘要",
            frequency: "daily",
            time: "08:00",
            nextRun: "2026-09-15T08:00:00.000Z",
          },
        ]}
      />
    </LocaleProvider>,
  );

  const card = await screen.findByRole("listitem");
  const time = card.querySelector("time");
  expect(time).toBeInTheDocument();
  expect(time).toHaveAttribute("dateTime", "2026-09-15T08:00:00.000Z");
  expect(time).not.toHaveTextContent("2026-09-15T08:00:00.000Z");
  expect(time).toHaveTextContent(/9月15日/);
});

it("排程 mutation 期间锁住操作入口，失败后保留可恢复的错误提示", async () => {
  let resolveUpdate: () => void = () => {};
  const onUpdateTask = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveUpdate = resolve;
      }),
  );
  window.history.replaceState(null, "", "/app/scheduled?tab=list");
  render(
    <LocaleProvider>
      <ScheduledTaskSurface
        brandName="Kokoro"
        tasks={[
          {
            id: "scheduled_1",
            title: "每日摘要",
            frequency: "daily",
            time: "08:00",
            enabled: true,
          },
        ]}
        onUpdateTask={onUpdateTask}
      />
    </LocaleProvider>,
  );

  const card = await screen.findByRole("listitem");
  fireEvent.pointerDown(
    within(card).getByRole("button", { name: "排程任务选项 每日摘要" }),
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: "暂停" }));
  await waitFor(() => expect(card).toHaveAttribute("aria-busy", "true"));
  expect(within(card).getByRole("status")).toHaveTextContent("正在更新");
  expect(
    within(card).getByRole("button", { name: "排程任务选项 每日摘要" }),
  ).toBeDisabled();

  resolveUpdate();
  await waitFor(() => expect(card).not.toHaveAttribute("aria-busy", "true"));
  expect(card).toHaveAttribute("data-status", "active");

  const onFailedUpdate = vi
    .fn()
    .mockRejectedValue(new Error("BFF unavailable"));
  cleanup();
  render(
    <LocaleProvider>
      <ScheduledTaskSurface
        brandName="Kokoro"
        tasks={[
          {
            id: "scheduled_1",
            title: "每日摘要",
            frequency: "daily",
            time: "08:00",
            enabled: true,
          },
        ]}
        onUpdateTask={onFailedUpdate}
      />
    </LocaleProvider>,
  );
  const failedCard = await screen.findByRole("listitem");
  fireEvent.pointerDown(
    within(failedCard).getByRole("button", { name: "排程任务选项 每日摘要" }),
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: "暂停" }));
  await waitFor(() =>
    expect(within(failedCard).getByRole("alert")).toHaveTextContent("操作失败"),
  );
  expect(failedCard).not.toHaveAttribute("aria-busy", "true");
  expect(
    within(failedCard).getByRole("button", { name: "排程任务选项 每日摘要" }),
  ).toBeEnabled();
});

it("日历星期标题跟随当前界面语言", async () => {
  window.localStorage.setItem("kokoro.locale", "en");
  render(
    <LocaleProvider>
      <ScheduledTaskSurface
        brandName="Kokoro"
        tasks={[
          {
            id: "scheduled_1",
            title: "Daily digest",
            frequency: "daily",
            time: "08:00",
          },
        ]}
      />
    </LocaleProvider>,
  );

  const weekdays = await screen.findByTestId("scheduled-calendar-weekdays");
  await waitFor(() =>
    expect(within(weekdays).getByText("Sun")).toBeInTheDocument(),
  );
});

it("项目深链只把精确关联交给 create，成功后才重新读取 owner 列表", async () => {
  const created = {
    id: "scheduled_project_1",
    projectId: "project/真实",
    title: "项目摘要",
    prompt: "执行项目摘要",
    frequency: "daily" as const,
    time: "08:00",
    timezone: "UTC",
    autoApprove: false,
  };
  const listScheduledTasks = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([created]);
  const createScheduledTask = vi.fn().mockResolvedValue(created);
  window.history.replaceState(null, "", "/app/scheduled?tab=list&project_id=project%2F%E7%9C%9F%E5%AE%9E#scheduled-tasks/new");
  render(<LocaleProvider><ScheduledTaskSurface brandName="Kokoro" scheduledTaskClient={scheduledTaskClient({ listScheduledTasks, createScheduledTask })} /></LocaleProvider>);

  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "未读邮件摘要" }), { target: { value: "项目摘要" } });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" }), { target: { value: "执行项目摘要" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));

  await waitFor(() => expect(createScheduledTask).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project/真实" })));
  await waitFor(() => expect(listScheduledTasks).toHaveBeenCalledTimes(2));
  expect(screen.getByText("项目摘要")).toBeInTheDocument();
});

it("个人创建不继承项目关联，project 404 保留草稿且不 reload 或 optimistic 插入", async () => {
  const listScheduledTasks = vi.fn().mockResolvedValue([]);
  const createScheduledTask = vi.fn().mockRejectedValue(Object.assign(new Error("Project was not found"), {
    reason: "http",
    status: 404,
    code: "project_not_found",
  }));
  window.history.replaceState(null, "", "/app/scheduled?project_id=missing#scheduled-tasks/new");
  const view = render(<LocaleProvider><ScheduledTaskSurface brandName="Kokoro" scheduledTaskClient={scheduledTaskClient({ listScheduledTasks, createScheduledTask })} /></LocaleProvider>);
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "未读邮件摘要" }), { target: { value: "保留草稿" } });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" }), { target: { value: "不降级个人任务" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));

  await waitFor(() => expect(within(dialog).getByRole("alert")).toBeInTheDocument());
  expect(within(dialog).getByRole("textbox", { name: "未读邮件摘要" })).toHaveValue("保留草稿");
  expect(listScheduledTasks).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("保留草稿", { selector: "strong" })).not.toBeInTheDocument();

  view.unmount();
  const personalCreate = vi.fn().mockResolvedValue({
    id: "scheduled_personal",
    title: "个人摘要",
    frequency: "daily",
    time: "08:00",
  });
  window.history.replaceState(null, "", "/app/scheduled#scheduled-tasks/new");
  render(<LocaleProvider><ScheduledTaskSurface brandName="Kokoro" scheduledTaskClient={scheduledTaskClient({ listScheduledTasks: vi.fn().mockResolvedValue([]), createScheduledTask: personalCreate })} /></LocaleProvider>);
  const personalDialog = await screen.findByRole("dialog");
  fireEvent.change(within(personalDialog).getByRole("textbox", { name: "未读邮件摘要" }), { target: { value: "个人摘要" } });
  fireEvent.change(within(personalDialog).getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" }), { target: { value: "个人提示" } });
  fireEvent.click(within(personalDialog).getByRole("button", { name: "保存" }));
  await waitFor(() => expect(personalCreate).toHaveBeenCalled());
  expect(personalCreate.mock.calls[0]?.[0]).not.toHaveProperty("projectId");
});

it("无效项目上下文不 fallback 为个人创建", async () => {
  const createScheduledTask = vi.fn();
  window.history.replaceState(null, "", "/app/scheduled?project_id=one&project_id=two#scheduled-tasks/new");
  render(<LocaleProvider><ScheduledTaskSurface brandName="Kokoro" scheduledTaskClient={scheduledTaskClient({ listScheduledTasks: vi.fn().mockResolvedValue([]), createScheduledTask })} /></LocaleProvider>);

  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("alert")).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "保存" })).toBeDisabled();
  expect(createScheduledTask).not.toHaveBeenCalled();
});

it("旧项目的迟到 create receipt 不关闭或 reload 新项目编辑器", async () => {
  let resolveProjectA: ((value: {
    id: string;
    projectId: string;
    title: string;
    frequency: "daily";
    time: string;
  }) => void) | undefined;
  const projectAReceipt = new Promise<{
    id: string;
    projectId: string;
    title: string;
    frequency: "daily";
    time: string;
  }>((resolve) => {
    resolveProjectA = resolve;
  });
  const listScheduledTasks = vi.fn().mockResolvedValue([]);
  const createScheduledTask = vi.fn().mockReturnValue(projectAReceipt);
  window.history.replaceState(
    null,
    "",
    "/app/scheduled?project_id=project-a#scheduled-tasks/new",
  );
  render(
    <LocaleProvider>
      <ScheduledTaskSurface
        brandName="Kokoro"
        scheduledTaskClient={scheduledTaskClient({
          listScheduledTasks,
          createScheduledTask,
        })}
      />
    </LocaleProvider>,
  );

  const projectADialog = await screen.findByRole("dialog");
  fireEvent.change(
    within(projectADialog).getByRole("textbox", { name: "未读邮件摘要" }),
    { target: { value: "项目 A" } },
  );
  fireEvent.change(
    within(projectADialog).getByRole("textbox", {
      name: "汇总未读邮件并突出显示重要邮件",
    }),
    { target: { value: "执行项目 A" } },
  );
  fireEvent.click(within(projectADialog).getByRole("button", { name: "保存" }));
  await waitFor(() =>
    expect(createScheduledTask).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-a" }),
    ),
  );

  window.history.pushState(
    null,
    "",
    "/app/scheduled?project_id=project-b#scheduled-tasks/new",
  );
  fireEvent(window, new Event("kokoro:surface-navigation"));
  const projectBDialog = await screen.findByRole("dialog");
  const projectBTitle = within(projectBDialog).getByRole("textbox", {
    name: "未读邮件摘要",
  });
  await waitFor(() => expect(projectBTitle).toHaveValue(""));
  fireEvent.change(projectBTitle, { target: { value: "项目 B 草稿" } });

  resolveProjectA?.({
    id: "scheduled_project_a",
    projectId: "project-a",
    title: "项目 A",
    frequency: "daily",
    time: "08:00",
  });

  await waitFor(() => expect(projectBTitle).toHaveValue("项目 B 草稿"));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(window.location.search).toBe("?project_id=project-b");
  expect(window.location.hash).toBe("#scheduled-tasks/new");
  expect(listScheduledTasks).toHaveBeenCalledTimes(1);
});

it("编辑 owner 任务时忽略 URL 项目创建上下文且不改变归属", async () => {
  const ownerTask = {
    id: "scheduled_existing",
    projectId: "owner-project",
    title: "既有项目任务",
    prompt: "执行旧项目任务",
    frequency: "daily" as const,
    time: "08:00",
    timezone: "UTC",
    autoApprove: false,
  };
  const listScheduledTasks = vi
    .fn()
    .mockResolvedValueOnce([ownerTask])
    .mockResolvedValueOnce([{ ...ownerTask, title: "更新后的任务" }]);
  const createScheduledTask = vi.fn();
  const updateScheduledTask = vi.fn().mockResolvedValue({
    ...ownerTask,
    title: "更新后的任务",
  });
  window.history.replaceState(
    null,
    "",
    "/app/scheduled?tab=list&project_id=other-project",
  );
  render(
    <LocaleProvider>
      <ScheduledTaskSurface
        brandName="Kokoro"
        scheduledTaskClient={scheduledTaskClient({
          listScheduledTasks,
          createScheduledTask,
          updateScheduledTask,
        })}
      />
    </LocaleProvider>,
  );

  const card = await screen.findByRole("listitem");
  fireEvent.pointerDown(
    within(card).getByRole("button", { name: "排程任务选项 既有项目任务" }),
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(
    within(dialog).getByRole("textbox", { name: "未读邮件摘要" }),
    { target: { value: "更新后的任务" } },
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));

  await waitFor(() =>
    expect(updateScheduledTask).toHaveBeenCalledWith(
      "scheduled_existing",
      expect.not.objectContaining({ projectId: expect.anything() }),
    ),
  );
  expect(createScheduledTask).not.toHaveBeenCalled();
  await waitFor(() => expect(listScheduledTasks).toHaveBeenCalledTimes(2));
});

it.each(["resolve", "reject"] as const)(
  "整个 surface 卸载后迟到 create %s 不 reload 旧 client 或污染新编辑器",
  async (outcome) => {
    const oldReceipt = deferredScheduledOperation<{
      id: string;
      projectId: string;
      title: string;
      frequency: "daily";
      time: string;
    }>();
    const oldListScheduledTasks = vi.fn().mockResolvedValue([]);
    const oldCreateScheduledTask = vi.fn().mockReturnValue(oldReceipt.promise);
    window.history.replaceState(
      null,
      "",
      "/app/scheduled?project_id=project-old",
    );
    const oldView = render(
      <LocaleProvider>
        <ScheduledTaskSurface
          brandName="Kokoro"
          scheduledTaskClient={scheduledTaskClient({
            listScheduledTasks: oldListScheduledTasks,
            createScheduledTask: oldCreateScheduledTask,
          })}
        />
      </LocaleProvider>,
    );

    await waitFor(() => expect(oldListScheduledTasks).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /建立您的排程任务/ }));
    const oldDialog = await screen.findByRole("dialog");
    fireEvent.change(
      within(oldDialog).getByRole("textbox", { name: "未读邮件摘要" }),
      { target: { value: "旧项目任务" } },
    );
    fireEvent.change(
      within(oldDialog).getByRole("textbox", {
        name: "汇总未读邮件并突出显示重要邮件",
      }),
      { target: { value: "执行旧项目任务" } },
    );
    fireEvent.click(within(oldDialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(oldCreateScheduledTask).toHaveBeenCalledTimes(1));

    oldView.unmount();
    window.history.replaceState(
      null,
      "",
      "/app/scheduled?project_id=project-new",
    );
    const newListScheduledTasks = vi.fn().mockResolvedValue([]);
    render(
      <LocaleProvider>
        <ScheduledTaskSurface
          brandName="Kokoro"
          scheduledTaskClient={scheduledTaskClient({
            listScheduledTasks: newListScheduledTasks,
            createScheduledTask: vi.fn(),
          })}
        />
      </LocaleProvider>,
    );
    await waitFor(() => expect(newListScheduledTasks).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /建立您的排程任务/ }));
    const newDialog = await screen.findByRole("dialog");
    const newTitle = within(newDialog).getByRole("textbox", {
      name: "未读邮件摘要",
    });
    fireEvent.change(newTitle, { target: { value: "新项目草稿" } });

    if (outcome === "resolve") {
      oldReceipt.resolve({
        id: "scheduled_old",
        projectId: "project-old",
        title: "旧项目任务",
        frequency: "daily",
        time: "08:00",
      });
    } else {
      oldReceipt.reject(new Error("late create failure"));
    }
    await flushScheduledOperation();

    expect(oldListScheduledTasks).toHaveBeenCalledTimes(1);
    expect(newTitle).toHaveValue("新项目草稿");
    expect(within(newDialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(window.location.search).toBe("?project_id=project-new");
    expect(window.location.hash).toBe("#scheduled-tasks/new");
  },
);

it.each(["resolve", "reject"] as const)(
  "整个 surface 卸载后迟到 update %s 不 reload 旧 client 或污染新编辑器",
  async (outcome) => {
    const ownerTask = {
      id: "scheduled_old_update",
      projectId: "project-old",
      title: "旧任务",
      prompt: "执行旧任务",
      frequency: "daily" as const,
      time: "08:00",
      timezone: "UTC",
      autoApprove: false,
    };
    const oldReceipt = deferredScheduledOperation<typeof ownerTask>();
    const oldListScheduledTasks = vi.fn().mockResolvedValue([ownerTask]);
    const oldUpdateScheduledTask = vi.fn().mockReturnValue(oldReceipt.promise);
    window.history.replaceState(
      null,
      "",
      "/app/scheduled?tab=list&project_id=project-old",
    );
    const oldView = render(
      <LocaleProvider>
        <ScheduledTaskSurface
          brandName="Kokoro"
          scheduledTaskClient={scheduledTaskClient({
            listScheduledTasks: oldListScheduledTasks,
            updateScheduledTask: oldUpdateScheduledTask,
          })}
        />
      </LocaleProvider>,
    );

    const oldCard = await screen.findByRole("listitem");
    fireEvent.pointerDown(
      within(oldCard).getByRole("button", { name: "排程任务选项 旧任务" }),
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "编辑" }));
    const oldDialog = screen.getByRole("dialog");
    fireEvent.change(
      within(oldDialog).getByRole("textbox", { name: "未读邮件摘要" }),
      { target: { value: "旧任务更新" } },
    );
    fireEvent.click(within(oldDialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(oldUpdateScheduledTask).toHaveBeenCalledTimes(1));

    oldView.unmount();
    window.history.replaceState(
      null,
      "",
      "/app/scheduled?project_id=project-new",
    );
    const newListScheduledTasks = vi.fn().mockResolvedValue([]);
    render(
      <LocaleProvider>
        <ScheduledTaskSurface
          brandName="Kokoro"
          scheduledTaskClient={scheduledTaskClient({
            listScheduledTasks: newListScheduledTasks,
          })}
        />
      </LocaleProvider>,
    );
    await waitFor(() => expect(newListScheduledTasks).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /建立您的排程任务/ }));
    const newDialog = await screen.findByRole("dialog");
    const newTitle = within(newDialog).getByRole("textbox", {
      name: "未读邮件摘要",
    });
    fireEvent.change(newTitle, { target: { value: "新项目更新后草稿" } });

    if (outcome === "resolve") {
      oldReceipt.resolve({ ...ownerTask, title: "旧任务更新" });
    } else {
      oldReceipt.reject(new Error("late update failure"));
    }
    await flushScheduledOperation();

    expect(oldListScheduledTasks).toHaveBeenCalledTimes(1);
    expect(newTitle).toHaveValue("新项目更新后草稿");
    expect(within(newDialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  },
);

it("surface 仍挂载时 create 成功继续执行一次正常 owner reload", async () => {
  const receipt = deferredScheduledOperation<{
    id: string;
    title: string;
    frequency: "daily";
    time: string;
  }>();
  const listScheduledTasks = vi.fn().mockResolvedValue([]);
  const createScheduledTask = vi.fn().mockReturnValue(receipt.promise);
  window.history.replaceState(
    null,
    "",
    "/app/scheduled",
  );
  render(
    <LocaleProvider>
      <ScheduledTaskSurface
        brandName="Kokoro"
        scheduledTaskClient={scheduledTaskClient({
          listScheduledTasks,
          createScheduledTask,
        })}
      />
    </LocaleProvider>,
  );

  await waitFor(() => expect(listScheduledTasks).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: /建立您的排程任务/ }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(
    within(dialog).getByRole("textbox", { name: "未读邮件摘要" }),
    { target: { value: "正常 reload" } },
  );
  fireEvent.change(
    within(dialog).getByRole("textbox", {
      name: "汇总未读邮件并突出显示重要邮件",
    }),
    { target: { value: "保持既有成功路径" } },
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
  await waitFor(() => expect(createScheduledTask).toHaveBeenCalledTimes(1));

  receipt.resolve({
    id: "scheduled_connected",
    title: "正常 reload",
    frequency: "daily",
    time: "08:00",
  });

  await waitFor(() => expect(listScheduledTasks).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

function deferredScheduledOperation<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushScheduledOperation() {
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}
