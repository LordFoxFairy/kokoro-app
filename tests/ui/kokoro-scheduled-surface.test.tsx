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
  createScheduledTaskClient,
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
    screen.getByRole("heading", { level: 1, name: "自动化" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
    "Kokoro 能独立执行工作，无需您的干预",
  );
  expect(screen.getByRole("img", { name: "排程日历" })).toBeInTheDocument();
  expect(screen.getAllByRole("button")).toHaveLength(6);
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
          { triggerKind: "calendar" as const,
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
          { triggerKind: "calendar" as const,
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
  expect(screen.queryByRole("button", { name: /进阶设定/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "未读邮件摘要" }), {
    target: { value: "每日流程" },
  });
  expect(screen.getByRole("switch", { name: "自动核准" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "保存" }));

  expect(onSave).toHaveBeenCalledWith({ triggerKind: "calendar" as const,
    title: "每日流程",
    prompt: "将手动流程转为定时自动化管道。",
    frequency: "daily",
    time: "08:00",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    expiresAt: undefined,
    autoApprove: false,
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
      expiresAt: new Date(2026, 8, 30, 23, 59, 59, 999).toISOString(),
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
    expect.objectContaining({ triggerKind: "calendar" as const,
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
  const task = { triggerKind: "calendar" as const,
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
  const activeTask = { triggerKind: "calendar" as const,
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
          { triggerKind: "calendar" as const,
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
          { triggerKind: "calendar" as const,
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
          { triggerKind: "calendar" as const,
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
      { triggerKind: "calendar" as const,
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
          { triggerKind: "calendar" as const,
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
          { triggerKind: "calendar" as const,
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
      { triggerKind: "calendar" as const,
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
  expect(within(card).getByText(/已启用/)).toBeInTheDocument();
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
          { triggerKind: "calendar" as const,
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
          { triggerKind: "calendar" as const,
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

it("actual Response 的空 next_run_at 不在列表或日历伪造日期，已确认字符串保持显示", async () => {
  const now = new Date();
  const confirmedNextRun = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15, 8),
  ).toISOString();
  const confirmedDateKey = confirmedNextRun.slice(0, 10);
  const ownerTask = { trigger_kind: "calendar" as const,
    title: "Owner 已暂停",
    prompt: "等待 owner 重新排程",
    scheduling_state: "paused",
    frequency: "weekly",
    weekdays: [2],
    time: "08:00",
    timezone: "UTC",
    auto_approve: false,
  } as const;
  const fetcher: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        tasks: [
          { ...ownerTask, id: "scheduled_pending_owner", title: "Owner 等待登记", scheduling_state: "pending", next_run_at: null, enabled: true, status: "active" },
          { ...ownerTask, id: "scheduled_exhausted_owner", title: "Owner 已耗尽", frequency: "once", weekdays: undefined, local_date: "2020-01-01", scheduling_state: "exhausted", next_run_at: null, enabled: true, status: "active" },
          {
            ...ownerTask,
            id: "scheduled_paused_owner",
            next_run_at: null,
            enabled: false,
            status: "paused",
          },
          {
            ...ownerTask,
            id: "scheduled_confirmed_owner",
            title: "Owner 已确认",
            scheduling_state: "active",
            next_run_at: confirmedNextRun,
            enabled: true,
            status: "active",
          },
        ],
      }),
      { status: 200 },
    );
  window.history.replaceState(null, "", "/app/scheduled?tab=list");
  render(
    <LocaleProvider>
      <ScheduledTaskSurface
        brandName="Kokoro"
        displayTimezone="UTC"
        scheduledTaskClient={createScheduledTaskClient(fetcher)}
      />
    </LocaleProvider>,
  );

  const pausedCard = (await screen.findByText("Owner 已暂停")).closest(
    "[role='listitem']",
  );
  const confirmedCard = screen.getByText("Owner 已确认").closest(
    "[role='listitem']",
  );
  const pendingCard = screen.getByText("Owner 等待登记").closest<HTMLElement>("[role='listitem']")!
  const exhaustedCard = screen.getByText("Owner 已耗尽").closest<HTMLElement>("[role='listitem']")!
  expect(within(pendingCard).getByRole("img", { name: "等待登记" })).toBeInTheDocument()
  expect(within(exhaustedCard).getByRole("img", { name: "调度已结束" })).toBeInTheDocument()
  expect(pendingCard.querySelector("time")).toBeNull()
  expect(exhaustedCard.querySelector("time")).toBeNull()
  expect(pausedCard).not.toBeNull();
  expect(confirmedCard).not.toBeNull();
  expect(pausedCard).toHaveTextContent(/每周\s+周二/u);
  expect(pausedCard?.querySelector("time")).toBeNull();
  expect(confirmedCard?.querySelector("time")).toHaveAttribute(
    "dateTime",
    confirmedNextRun,
  );

  window.history.replaceState(null, "", "/app/scheduled?tab=calendar");
  fireEvent(window, new Event("kokoro:surface-navigation"));
  await waitFor(() =>
    expect(screen.queryByText("Owner 已暂停")).not.toBeInTheDocument(),
  );
  expect(
    screen.getByTestId(`scheduled-calendar-day-${confirmedDateKey}`),
  ).toHaveTextContent("Owner 已确认");
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
          { triggerKind: "calendar" as const,
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
          { triggerKind: "calendar" as const,
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
          { triggerKind: "calendar" as const,
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
  const created = { triggerKind: "calendar" as const,
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
  const personalCreate = vi.fn().mockResolvedValue({ triggerKind: "calendar" as const,
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
  let resolveProjectA: ((value: { triggerKind: "calendar";
    id: string;
    projectId: string;
    title: string;
    frequency: "daily";
    time: string;
  }) => void) | undefined;
  const projectAReceipt = new Promise<{ triggerKind: "calendar";
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
  await waitFor(() => expect(listScheduledTasks).toHaveBeenCalledTimes(2));

  resolveProjectA?.({ triggerKind: "calendar" as const,
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
  expect(listScheduledTasks).toHaveBeenCalledTimes(2);
});

it("编辑 owner 任务时忽略 URL 项目创建上下文且不改变归属", async () => {
  const ownerTask = { trigger_kind: "calendar" as const,
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
    "/app/scheduled?tab=list&project_id=owner-project",
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
  const historyClosed = new Promise<PopStateEvent>((resolve) =>
    window.addEventListener("popstate", resolve, { once: true }),
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
  await historyClosed;
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it.each(["resolve", "reject"] as const)(
  "整个 surface 卸载后迟到 create %s 不 reload 旧 client 或污染新编辑器",
  async (outcome) => {
    const oldReceipt = deferredScheduledOperation<{ triggerKind: "calendar";
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
      oldReceipt.resolve({ triggerKind: "calendar" as const,
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
    const ownerTask = { trigger_kind: "calendar" as const,
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
  const receipt = deferredScheduledOperation<{ triggerKind: "calendar";
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

  receipt.resolve({ triggerKind: "calendar" as const,
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

// Exercise the existing product adapter rather than importing a future workflow component.
vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/engine/config", () => ({ sessionBaseUrl: () => "http://s.local" }));

async function mountI1AppSurface(address: string) {
  const [{ KokoroAppSurface }, { createSessionEngine }, { createFakeClient, createMemoryStorage }, { ThemeProvider }] = await Promise.all([
    import("@/features/app/kokoro-app-surface"),
    import("@/engine/machine"),
    import("../engine/fakes"),
    import("@/ui/theme/theme-context"),
  ]);
  window.localStorage.setItem("kokoro.locale", "en");
  window.history.replaceState(null, "", address);
  const chatClient = createFakeClient();
  const engine = createSessionEngine({ client: chatClient, storage: createMemoryStorage<import("@/core/conversations").ConversationStore>(null), now: () => 1_000 });
  const businessRequests: string[] = [];
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
    if (path === "/api/admin-access" && (!init?.method || init.method === "GET")) {
      return Response.json({ platform_admin: false }, { headers: { "cache-control": "private, no-store", "x-request-id": "req-i1-shell" } });
    }
    businessRequests.push(path);
    throw new Error("Unexpected business request in preview workflow");
  });
  const rendered = render(<ThemeProvider><LocaleProvider><KokoroAppSurface engine={engine} preview /></LocaleProvider></ThemeProvider>);
  return {
    chatClient, businessRequests,
    dispose: () => { rendered.unmount(); engine.dispose(); fetcher.mockRestore(); },
  };
}

it("I1 routes a direct home workflow query to inline scheduling without a chat composer or message command", async () => {
  const app = await mountI1AppSurface("/app?workflow=automation&project_id=project-home");
  try {
    expect(screen.getByRole("heading", { name: "Automation workflow", level: 1 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scheduled tasks" }));
    const form = screen.getByRole("form", { name: "Create scheduled automation" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(form).getByLabelText("Select time")).toHaveValue("10:00");
    expect(document.querySelector('[data-slot="composer-input"]')).toBeNull();
    const prompt = within(form).getByRole("textbox", { name: "Summarize unread email and highlight important messages" });
    fireEvent.change(prompt, { target: { value: "A scheduled prompt, not a chat message" } });
    fireEvent.keyDown(prompt, { key: "Enter", code: "Enter" });
    expect(within(form).getByRole("button", { name: "Create automation" })).toBeDisabled();
    expect(app.chatClient.createCalls).toEqual([]);
    expect(app.chatClient.controlCalls).toEqual([]);
    expect(app.businessRequests).toEqual([]);
  } finally { app.dispose(); }
});

it("I1 follows same-path query navigation and popstate, retires old inline drafts, and returns to ordinary home", async () => {
  const app = await mountI1AppSurface("/app");
  try {
    expect(screen.queryByRole("heading", { name: "Automation workflow" })).toBeNull();
    window.history.pushState(null, "", "/app?workflow=automation&project_id=project-A");
    fireEvent(window, new Event("kokoro:surface-navigation"));
    expect(screen.getByRole("heading", { name: "Automation workflow", level: 1 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scheduled tasks" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Unread email summary" }), { target: { value: "Old project A draft" } });
    window.history.pushState(null, "", "/app?workflow=automation&project_id=project-B");
    fireEvent(window, new PopStateEvent("popstate"));
    expect(screen.queryByDisplayValue("Old project A draft")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Scheduled tasks" }));
    expect(screen.getByRole("textbox", { name: "Unread email summary" })).toHaveValue("");
    window.history.pushState(null, "", "/app");
    fireEvent(window, new PopStateEvent("popstate"));
    expect(screen.queryByRole("heading", { name: "Automation workflow" })).toBeNull();
    expect(screen.queryByRole("form", { name: "Create scheduled automation" })).toBeNull();
    expect(app.chatClient.createCalls).toEqual([]);
    expect(app.businessRequests).toEqual([]);
  } finally { app.dispose(); }
});

// I4: busy calendar days retain the owner's actual next-run instants and editor path.
type I4CalendarTask = import("@/features/scheduled-tasks").ScheduledTaskRecord;

function i4CalendarTasks(): I4CalendarTask[] {
  const base = { triggerKind: "calendar" as const, frequency: "daily" as const, time: "23:59", timezone: "Pacific/Honolulu" };
  return [
    { ...base, id: "i4-late", title: "较晚任务", nextRun: "2026-10-21T12:00:00Z" },
    { ...base, id: "i4-first", title: "最早任务", nextRun: "2026-10-21T01:00:00Z", status: "active", schedulingState: "pending" },
    { ...base, id: "i4-tie-a", title: "同刻任务甲", nextRun: "2026-10-21T03:00:00Z", status: "active", schedulingState: "failed" },
    { ...base, id: "i4-tie-b", title: "同刻任务乙", nextRun: "2026-10-21T03:00:00Z", schedulingState: "paused" },
    { ...base, id: "i4-last", title: "最后一个完整长名称任务", nextRun: "2026-10-21T15:00:00Z", schedulingState: "exhausted" },
  ];
}

function i4CalendarHarness(tasks = i4CalendarTasks()) {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-21T12:00:00Z") });
  const initial = {
    mode: "controlled" as const,
    tasks,
    displayTimezone: "Asia/Shanghai",
    projectReadBoundary: { admitted: true, subject: "i4-A", generation: 1 },
  };
  const view = (props = initial) => <LocaleProvider><ScheduledTaskSurface {...props} /></LocaleProvider>;
  const rendered = render(view());
  return { ...rendered, initial, view };
}

it("I4 caps a busy day at three sorted actual runs, preserves ties/input, and uses authoritative scheduling status", async () => {
  const tasks = i4CalendarTasks();
  const before = JSON.stringify(tasks);
  await i4CalendarHarness(tasks);
  const day = screen.getByTestId("scheduled-calendar-day-2026-10-21");
  const buttons = within(day).getAllByRole("button");
  expect(buttons).toHaveLength(4);
  expect(buttons.slice(0, 3).map((button) => button.textContent)).toEqual([
    expect.stringContaining("最早任务"), expect.stringContaining("同刻任务甲"), expect.stringContaining("同刻任务乙"),
  ]);
  expect(within(day).getByRole("button", { name: "还有 2 项" })).toBeInTheDocument();
  expect(buttons[0]).toHaveTextContent("09:00");
  expect(buttons[0]).toHaveTextContent("Asia/Shanghai");
  expect(buttons[0]).toHaveTextContent("等待登记");
  expect(buttons[1]).toHaveTextContent("调度失败");
  expect(day).not.toHaveTextContent("23:59");
  expect(JSON.stringify(tasks)).toBe(before);
});

it("I4 leaves three direct entries editable with their unchanged original task data", async () => {
  const tasks = i4CalendarTasks().slice(0, 3);
  await i4CalendarHarness(tasks);
  const day = screen.getByTestId("scheduled-calendar-day-2026-10-21");
  expect(within(day).getAllByRole("button")).toHaveLength(3);
  expect(within(day).queryByRole("button", { name: /还有/ })).toBeNull();
  const first = within(day).getByRole("button", { name: /最早任务/ });
  fireEvent.click(first);
  const editor = screen.getByRole("dialog");
  expect(within(editor).getByRole("textbox", { name: "未读邮件摘要" })).toHaveValue(tasks[1]?.title);
  expect(within(editor).getByLabelText("选择时间")).toHaveValue("23:59");
  expect(tasks[1]).toMatchObject({ id: "i4-first", nextRun: "2026-10-21T01:00:00Z", time: "23:59" });
  expect(first.isConnected).toBe(true);
});

it("I4 opens all ordered runs with a localized date, full titles/time/status, and Escape returns to More", async () => {
  await i4CalendarHarness();
  const more = screen.getByRole("button", { name: "还有 2 项" });
  fireEvent.click(more);
  const popup = screen.getByRole("dialog", { name: /2026年10月21日/ });
  const entries = within(popup).getAllByRole("button");
  expect(entries).toHaveLength(5);
  expect(entries.map((entry) => entry.textContent)).toEqual([
    expect.stringContaining("最早任务"), expect.stringContaining("同刻任务甲"), expect.stringContaining("同刻任务乙"),
    expect.stringContaining("较晚任务"), expect.stringContaining("最后一个完整长名称任务"),
  ]);
  expect(within(popup).getByRole("button", { name: /最后一个完整长名称任务.*23:00.*Asia\/Shanghai.*调度已结束/ })).toBeInTheDocument();
  fireEvent.keyDown(popup, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(more).toHaveFocus());
});

it("I4 opens the real editor with unchanged overflow task data and closes back to persistent More", async () => {
  const tasks = i4CalendarTasks();
  const before = JSON.stringify(tasks);
  await i4CalendarHarness(tasks);
  const more = screen.getByRole("button", { name: "还有 2 项" });
  fireEvent.click(more);
  const popup = screen.getByRole("dialog", { name: /2026年10月21日/ });
  const entry = within(popup).getByRole("button", { name: /最后一个完整长名称任务/ });
  fireEvent.click(entry);
  const editor = screen.getByRole("dialog");
  expect(within(editor).getByRole("textbox", { name: "未读邮件摘要" })).toHaveValue(tasks[4]?.title);
  expect(within(editor).getByLabelText("选择时间")).toHaveValue("23:59");
  expect(more.isConnected).toBe(true);
  expect(entry.isConnected).toBe(false);
  fireEvent.keyDown(editor, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(more).toHaveFocus());
  expect(JSON.stringify(tasks)).toBe(before);
});

it.each(["month", "timezone", "source", "count"] as const)("I4 retires an expanded day when %s changes without resurrecting it on return", async (change) => {
  const app = await i4CalendarHarness();
  fireEvent.click(screen.getByRole("button", { name: "还有 2 项" }));
  expect(screen.getByRole("dialog", { name: /2026年10月21日/ })).toBeInTheDocument();
  if (change === "month") {
    fireEvent.click(screen.getByRole("button", { name: "下个月" }));
  } else {
    app.rerender(app.view({
      ...app.initial,
      ...(change === "timezone" ? { displayTimezone: "UTC" } : {}),
      ...(change === "source" ? { tasks: i4CalendarTasks() } : {}),
      ...(change === "count" ? { tasks: i4CalendarTasks().slice(0, 3) } : {}),
    }));
  }
  const previousMonth = screen.getByRole("button", { name: "上个月" });
  previousMonth.focus();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await flushScheduledOperation();
  expect(previousMonth).toHaveFocus();
  if (change === "month") fireEvent.click(screen.getByRole("button", { name: "上个月" }));
  app.rerender(app.view(app.initial));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("I4 retires expanded content across subject and project scopes without resurrection or IO", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch");
  const tasks = i4CalendarTasks().map((task) => ({ ...task, projectId: "project-i4-A" }));
  window.history.replaceState(null, "", "/app/scheduled?tab=calendar&project_id=project-i4-A");
  const app = await i4CalendarHarness(tasks);
  fireEvent.click(screen.getByRole("button", { name: "还有 2 项" }));
  expect(screen.getByRole("dialog", { name: /2026年10月21日/ })).toBeInTheDocument();
  app.rerender(app.view({ ...app.initial, projectReadBoundary: { admitted: true, subject: "i4-B", generation: 2 } }));
  expect(screen.queryByRole("dialog")).toBeNull();
  app.rerender(app.view(app.initial));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "还有 2 项" }));
  window.history.replaceState(null, "", "/app/scheduled?tab=calendar&project_id=project-i4-B");
  fireEvent(window, new PopStateEvent("popstate"));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByText("最早任务")).toBeNull();
  window.history.replaceState(null, "", "/app/scheduled?tab=calendar&project_id=project-i4-A");
  fireEvent(window, new PopStateEvent("popstate"));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "还有 2 项" })).toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockRestore();
});

it("I4 keeps the existing UTC interpretation of controlled legacy nextRun without a zone", async () => {
  const task: I4CalendarTask = { triggerKind: "calendar" as const, id: "i4-legacy-utc", title: "兼容旧受控时间", frequency: "daily", time: "23:59", nextRun: "2026-10-21T08:00:00", schedulingState: "pending" };
  await i4CalendarHarness([task]);
  const day = screen.getByTestId("scheduled-calendar-day-2026-10-21");
  const entry = within(day).getByRole("button", { name: /兼容旧受控时间/ });
  expect(entry).toHaveTextContent("16:00 (Asia/Shanghai)");
  expect(entry.querySelector("time")).toHaveAttribute("datetime", "2026-10-21T08:00:00.000Z");
  expect(task.nextRun).toBe("2026-10-21T08:00:00");
  expect(entry).not.toHaveTextContent("23:59");
});

it("I4 approval keeps live new-task approval unavailable with its accurate accessible reason and no mutation", async () => {
  const listScheduledTasks = vi.fn().mockResolvedValue([]);
  const createScheduledTask = vi.fn();
  const updateScheduledTask = vi.fn();
  render(<LocaleProvider><ScheduledTaskSurface mode="live" scheduledTaskClient={scheduledTaskClient({ listScheduledTasks, createScheduledTask, updateScheduledTask })} projectReadBoundary={{ admitted: true, subject: "approval-A", generation: 1 }} /></LocaleProvider>);
  await waitFor(() => expect(listScheduledTasks).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "建立您的排程任务" }));
  const approval = within(screen.getByRole("dialog")).getByRole("switch", { name: "自动核准" });
  expect(approval).toBeDisabled();
  expect(approval).not.toBeChecked();
  expect(approval).toHaveAccessibleDescription("自动核准暂不可用；执行时仍使用现有审批规则。");
  const reasonId = approval.getAttribute("aria-describedby");
  expect(reasonId).toBeTruthy();
  expect(document.getElementById(reasonId ?? "")).toBeVisible();
  fireEvent.click(approval);
  expect(approval).not.toBeChecked();
  expect(createScheduledTask).not.toHaveBeenCalled();
  expect(updateScheduledTask).not.toHaveBeenCalled();
});

it("I4 approval preserves an existing true value while disabling its control and saving other live edits", async () => {
  const owner = { triggerKind: "calendar" as const, id: "scheduled-old-approval", title: "旧审批配置", prompt: "保留旧正文", frequency: "daily" as const, time: "08:00", timezone: "UTC", autoApprove: true };
  const listScheduledTasks = vi.fn().mockResolvedValueOnce([owner]).mockResolvedValueOnce([{ ...owner, title: "改名但保留原审批字段" }]);
  const updateScheduledTask = vi.fn().mockResolvedValue({ ...owner, title: "改名但保留原审批字段" });
  const createScheduledTask = vi.fn();
  window.history.replaceState(null, "", "/app/scheduled?tab=list");
  render(<LocaleProvider><ScheduledTaskSurface mode="live" scheduledTaskClient={scheduledTaskClient({ listScheduledTasks, updateScheduledTask, createScheduledTask })} projectReadBoundary={{ admitted: true, subject: "approval-A", generation: 1 }} /></LocaleProvider>);
  const row = await screen.findByRole("listitem");
  fireEvent.pointerDown(within(row).getByRole("button", { name: "排程任务选项 旧审批配置" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑" }));
  const editor = screen.getByRole("dialog");
  const approval = within(editor).getByRole("switch", { name: "自动核准" });
  expect(approval).toBeChecked();
  expect(approval).toBeDisabled();
  expect(approval).toHaveAccessibleDescription("自动核准暂不可用；执行时仍使用现有审批规则。");
  fireEvent.click(approval);
  expect(approval).toBeChecked();
  fireEvent.change(within(editor).getByRole("textbox", { name: "未读邮件摘要" }), { target: { value: "改名但保留原审批字段" } });
  const closed = new Promise<PopStateEvent>((resolve) => window.addEventListener("popstate", resolve, { once: true }));
  fireEvent.click(within(editor).getByRole("button", { name: "保存" }));
  await waitFor(() => expect(updateScheduledTask).toHaveBeenCalledExactlyOnceWith("scheduled-old-approval", { triggerKind: "calendar" as const,
    title: "改名但保留原审批字段", prompt: "保留旧正文", frequency: "daily", time: "08:00", timezone: "UTC", expiresAt: undefined, autoApprove: true,
  }));
  expect(createScheduledTask).not.toHaveBeenCalled();
  await waitFor(() => expect(listScheduledTasks).toHaveBeenCalledTimes(2));
  await closed;
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("I4 approval exposes only disabled existing runtime rules in workflow settings and creates with the unchanged false default", async () => {
  window.history.replaceState(null, "", "/app?workflow=automation&project_id=approval-project");
  const listScheduledTasks = vi.fn().mockResolvedValue([]);
  const createScheduledTask = vi.fn().mockImplementation(async (draft: import("@/features/scheduled-tasks").ScheduledTaskDraft) => ({ ...draft, id: "scheduled-approval-default" }));
  render(<LocaleProvider><ScheduledTaskSurface mode="live" scheduledTaskClient={scheduledTaskClient({ listScheduledTasks, createScheduledTask })} projectReadBoundary={{ admitted: true, subject: "approval-A", generation: 1 }} /></LocaleProvider>);
  await waitFor(() => expect(listScheduledTasks).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "定时任务" }));
  const form = screen.getByRole("form", { name: "创建定时自动化" });
  const settings = within(form).getByRole("button", { name: "自动化设置" });
  fireEvent.click(settings);
  const rules = screen.getByRole("button", { name: "使用现有审批规则" });
  expect(rules).toBeDisabled();
  expect(rules).toHaveAccessibleDescription("自动核准暂不可用；执行时仍使用现有审批规则。");
  expect(screen.queryByRole("combobox", { name: "审批" })).toBeNull();
  fireEvent.click(rules);
  expect(screen.queryByRole("option", { name: "无需批准" })).toBeNull();
  expect(screen.queryByRole("option", { name: "需要批准" })).toBeNull();
  expect(createScheduledTask).not.toHaveBeenCalled();
  fireEvent.click(settings);
  fireEvent.change(within(form).getByRole("textbox", { name: "未读邮件摘要" }), { target: { value: "仍沿现有审批规则" } });
  fireEvent.change(within(form).getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" }), { target: { value: "只保存已有调度字段" } });
  fireEvent.click(within(form).getByRole("button", { name: "创建自动化" }));
  await waitFor(() => expect(createScheduledTask).toHaveBeenCalledExactlyOnceWith({ triggerKind: "calendar" as const, title: "仍沿现有审批规则", prompt: "只保存已有调度字段", frequency: "daily", time: "10:00", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, expiresAt: undefined, autoApprove: false, projectId: "approval-project" }));
  await waitFor(() => expect(listScheduledTasks).toHaveBeenCalledTimes(2));
});

it.each([
  ["pending", "等待登记"],
  ["paused", "已暂停"],
  ["exhausted", "调度已结束"],
  ["failed", "调度失败"],
  [undefined, "已暂停"],
] as const)("I6 RSS inactive task %s retains poll history without promising another check", async (state, label) => {
  window.history.replaceState(null, "", "/app/scheduled?tab=list");
  render(<LocaleProvider><ScheduledTaskSurface brandName="Kokoro" tasks={[{
    triggerKind: "rss",
    id: "rss-inactive-history",
    title: "暂停的订阅任务",
    feedUrl: "https://go.dev/blog/feed.atom",
    conditions: [],
    nextRun: null,
    ...(state ? { schedulingState: state, status: "active" as const, enabled: true } : { enabled: false }),
    feedState: "active",
    lastCheckedAt: "2026-10-23T07:07:00.000Z",
    nextCheckAt: "2026-10-23T07:08:00.000Z",
    errorCode: "rss_feed_timeout",
  }]} /></LocaleProvider>);

  const card = await screen.findByRole("listitem");
  expect(within(card).getByRole("img", { name: label })).toBeInTheDocument();
  expect(within(card).getByText(label, { exact: true })).toBeVisible();
  expect(within(card).getByText("https://go.dev/blog/feed.atom")).toBeVisible();
  expect(within(card).getByText(/上次检查/)).toBeVisible();
  expect(within(card).getByText(/rss_feed_timeout/)).toBeVisible();
  expect(within(card).queryByText("正在检查订阅源")).toBeNull();
  expect(within(card).queryByText(/下次检查/)).toBeNull();
});

it("I6 RSS active task displays the current feed state and next check", async () => {
  window.history.replaceState(null, "", "/app/scheduled?tab=list");
  render(<LocaleProvider><ScheduledTaskSurface brandName="Kokoro" tasks={[{
    triggerKind: "rss",
    id: "rss-active-history",
    title: "启用的订阅任务",
    feedUrl: "https://go.dev/blog/feed.atom",
    conditions: [],
    nextRun: null,
    schedulingState: "active",
    feedState: "active",
    lastCheckedAt: "2026-10-23T07:07:00.000Z",
    nextCheckAt: "2026-10-23T07:08:00.000Z",
  }]} /></LocaleProvider>);

  const card = await screen.findByRole("listitem");
  expect(within(card).getByText("正在检查订阅源")).toBeVisible();
  expect(within(card).getByText(/下次检查/)).toBeVisible();
});
