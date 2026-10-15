// 设置中心模态（WEB-FACE 面三）：v1 设置导航、tab 切换单显、对话偏好就地存 localStorage，
// 关闭出口(× / Esc / 背幕点击)均触发 onClose。会话态由 shell 保证,模态本身不再自持匿名闸。
// page-clients 均注入 mock（不打网络）。
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRef, useState } from "react";
import type { ComponentProps } from "react";

import { LocaleProvider } from "@/i18n/context";
import { ThemeProvider } from "@/ui/theme/theme-context";
import { createSessionClient } from "@/engine/client";
import * as pageClients from "@/ui/shell/page-clients";

vi.mock("@/ui/auth/use-session-state", () => ({
  // Ordinary upload consumes an already verified session boundary. Session refresh
  // transport is covered by its own suite, not this business fetch dispatcher.
  useSessionProbe: () => ({
    state: "pass",
    projectReadBoundary: {
      admitted: true,
      subject: "fixture-user",
      generation: 1,
    },
  }),
}));

const {
  registerPrivateMcpServer,
  preparePrivateMcpServer,
  endProductSession,
} = vi.hoisted(() => ({
  registerPrivateMcpServer: vi.fn().mockResolvedValue({
    server: { server_id: "settings-json-server", display_name: "demo", server_url: "https://fixture.example.test/mcp", status: "pending", state_version: "1", headers: [], prepare_status: "pending_prepare", declarations: [], declarations_available: false },
    connector: { connector_id: "settings-json-connector", connector_type: "mcp", provider_key: "settings-json", status: "pending", approved_scopes: [], enabled: false, state_version: "1", server_id: "settings-json-server", display_name: "demo" },
    replayed: false,
  }),
  preparePrivateMcpServer: vi.fn().mockResolvedValue({
    server: { server_id: "settings-json-server", display_name: "demo", server_url: "https://fixture.example.test/mcp", status: "registered", state_version: "2", headers: [], prepare_status: "ready", declarations: [], declarations_available: true, declaration_digest: "a".repeat(64) },
    connector: { connector_id: "settings-json-connector", connector_type: "mcp", provider_key: "settings-json", status: "active", approved_scopes: [], enabled: false, state_version: "2", server_id: "settings-json-server", display_name: "demo" },
    declarations: [], replayed: false,
  }),
  endProductSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/ui/auth/product-auth-client", () => ({ endProductSession }));

// AccountCard(退出登录跳转)用 useRouter；模态本身不依赖路由。
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/ui/shell/page-clients", () => ({
  browserTeamClient: () => ({
    currentUserId: vi.fn().mockResolvedValue("user-me"),
    listMembers: vi.fn().mockResolvedValue({
      items: [
        {
          member_id: "member-me",
          user_id: "user-me",
          display_name: "Me",
          image_url: null,
          roles: ["owner"],
          joined_at: "2026-09-24T00:00:00Z",
        },
      ],
      nextCursor: null,
      requestId: "test",
    }),
    listInvitations: vi
      .fn()
      .mockResolvedValue({ items: [], nextCursor: null, requestId: "test" }),
    listRoles: vi.fn().mockResolvedValue({
      items: [
        {
          role_id: null,
          name: "owner",
          kind: "builtin",
          permissions: { member: ["read"], invitation: ["read"] },
        },
      ],
      nextCursor: null,
      requestId: "test",
    }),
  }),
  browserBillingClient: () => ({
    ledger: vi
      .fn()
      .mockResolvedValue({ items: [], page: { next_cursor: null } }),
    summary: vi.fn().mockResolvedValue({
      credit_account_id: "11111111-1111-4111-8111-111111111111",
      status: "active",
      available_micros: "12500000",
      held_micros: "500000",
    }),
  }),
  browserListClient: () => ({
    listModels: vi.fn().mockResolvedValue({
      models: [{ provider: "anthropic", name: "opus", is_default: true }],
    }),
  }),
  // account/appearance/chat tab 不调用下列客户端；仅需存在 export 供模块 import。
  browserHubClient: () => ({
    listPersonalSkills: vi.fn().mockResolvedValue({
      skills: [
        {
          skill_id: "mine",
          source_ref: "skill:mine",
          series_id: "series",
          name: "我的技能",
          summary: "Personal",
          revision: "2",
          status: "active",
          tags: [],
          category_keys: [],
          example_prompts: [],
          skill_updated_at: "2026-10-10T00:00:00Z",
          product: { publication_audience: "owner", state_version: "5" },
        },
      ],
      next_cursor: null,
    }),
    getPublishedPersonalSkill: vi.fn().mockResolvedValue({
      skill_id: "mine",
      source_ref: "skill:mine",
      revision: "2",
      status: "active",
      name: "我的技能",
      summary: "Personal",
      tags: [],
      series_id: "series",
      category_keys: [],
      example_prompts: [],
      skill_updated_at: "2026-10-10T00:00:00Z",
      product: { publication_audience: "owner", state_version: "5" },
    }),
    listMcpConnections: vi.fn().mockResolvedValue({
      connections: [
        {
          connection_id: "connection-1",
          connector_id: "connector-1",
          server_id: "server-1",
          provider_key: "Owner MCP",
          transport: "streamable_http",
          status: "active",
        },
      ],
    }),
    listMcpConnectors: vi.fn().mockResolvedValue({
      items: [
        {
          connector_id: "connector-1",
          connector_type: "mcp",
          provider_key: "owner-mcp",
          status: "active",
          approved_scopes: [],
          enabled: true,
          state_version: "2",
          display_name: "Owner MCP",
          description: "Actual personal connector",
        },
      ],
      next_cursor: null,
    }),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({
      items: [
        {
          provider_key: "owner-mcp",
          display_name: "Owner MCP",
          directory_type: "app",
          category_keys: ["development"],
          example_prompts: ["Use it"],
          enabled: true,
          state_version: "1",
        },
      ],
      next_cursor: null,
    }),
    createMcpConnector: vi.fn(),
    updateMcpConnector: vi.fn(),
    setMcpConnectorEnabled: vi.fn(),
    removeMcpConnector: vi.fn(),
    beginMcpConnectorAuthorization: vi.fn(),
    reconnectMcpConnectorAuthorization: vi.fn(),
    completeMcpConnectorAuthorization: vi.fn(),
    createMcpConnectorConnection: vi.fn(),
    listSkillPool: vi.fn().mockResolvedValue([
      {
        name: "YouTube 影片研究",
        description: "利用第一手影片证据强化深度研究。",
        content_hash: "preview:youtube",
        scope: "official",
        enabled: false,
        updated_at: Date.UTC(2026, 7, 28),
      },
      {
        name: "Typst PDF 制作工具",
        description: "使用 Typst 生成专业、高品质的 PDF 文件。",
        content_hash: "preview:typst",
        scope: "official",
        enabled: true,
        updated_at: Date.UTC(2026, 7, 28),
      },
    ]),
    listSkillCatalog: vi.fn().mockResolvedValue({
      skills: [
        {
          name: "YouTube 影片研究",
          description: "利用第一手影片证据强化深度研究。",
          content_hash: "preview:youtube",
          scope: "official",
          installed: false,
          enabled: false,
          updated_at: Date.UTC(2026, 7, 28),
        },
        {
          name: "Typst PDF 制作工具",
          description: "使用 Typst 生成专业、高品质的 PDF 文件。",
          content_hash: "preview:typst",
          scope: "official",
          installed: true,
          enabled: true,
          updated_at: Date.UTC(2026, 7, 28),
        },
      ],
      next_cursor: null,
    }),
    skillQuota: vi.fn().mockResolvedValue(null),
    setSkillEnabled: vi.fn().mockResolvedValue(undefined),
    registerPrivateMcpServer,
  preparePrivateMcpServer,
      }),
  browserPricingClient: () => ({}),
  browserEngine: () => null,
}));

// import 顺延到 mock 之后。
import {
  normalizeSettingsTab,
  SettingsModal,
  type SettingsTab,
} from "@/ui/settings/settings-modal";

const PANEL_KEYS = [
  "account",
  "appearance",
  "personalization",
  "chat",
  "shortcuts",
  "credits",
  "skills",
  "mcp",
  "team",
];
const NAV_TAB_KEYS = [
  "account",
  "credits",
  "appearance",
  "shortcuts",
  "personalization",
  "mcp",
  "skills",
  "team",
];

function renderSettings(
  onClose: () => void = () => {},
  onTabChange?: (tab: SettingsTab) => void,
  preview = false,
  _onStartDeployment?: (kind: "website" | "app") => void,
  initialTab: SettingsTab = "account",
  onCreateSkillWithAi?: () => void,
) {
  window.localStorage.setItem("kokoro.locale", "zh");
  const props: ComponentProps<typeof SettingsModal> = {
    brandName: "Acme",
    preview,
    readBoundary: { admitted: true, subject: "settings-reader", generation: 1 },
    initialTab,
    onClose,
  };
  if (onTabChange !== undefined) props.onTabChange = onTabChange;
  if (onCreateSkillWithAi !== undefined)
    props.onCreateSkillWithAi = onCreateSkillWithAi;
  return render(
    <ThemeProvider>
      <LocaleProvider>
        <SettingsModal {...props} />
      </LocaleProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  registerPrivateMcpServer.mockClear();
  preparePrivateMcpServer.mockClear();
  endProductSession.mockClear();
  window.localStorage.setItem("kokoro.locale", "zh");
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

describe("SettingsModal 设置中心模态", () => {
  it("正式 Skills 设置使用已添加技能的 Manus 信息架构", async () => {
    renderSettings(() => {}, undefined, true);
    fireEvent.keyDown(screen.getByTestId("settings-tab-skills"), {
      key: "Enter",
    });
    expect(
      await screen.findByRole("heading", { name: "已添加的技能", level: 1 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("searchbox", { name: /搜索技能|Search skills/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /探索技能|Browse skills/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /添加|Create/ }),
    ).toBeInTheDocument();
    for (const filter of [
      /全部|All/,
      /个人|Personal/,
      /官方|Official/,
      /第三方|Third party/,
    ]) {
      expect(screen.getByRole("radio", { name: filter })).toBeInTheDocument();
    }
    expect(screen.queryByText("本人已发布")).toBeNull();
    expect(screen.queryByText("本人安装")).toBeNull();
    expect(screen.queryByText("草稿")).toBeNull();
  });

  it("非预览账户退出调用 Product signout，而不是旧 logout", async () => {
    renderSettings();
    fireEvent.click(screen.getByTestId("settings-logout"));
    await waitFor(() => expect(endProductSession).toHaveBeenCalledOnce());
  });

  it("兼容 Manus 的 general 设置深链", () => {
    expect(normalizeSettingsTab("general")).toBe("appearance");
    expect(normalizeSettingsTab("appearance")).toBe("appearance");
  });

  it("默认渲染账户 tab 和完整设置导航，不把团队名冒充个人姓名", () => {
    renderSettings();
    expect(screen.getByTestId("settings-account")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "账户", level: 1 }),
    ).toBeInTheDocument();
    for (const key of NAV_TAB_KEYS) {
      expect(screen.getByTestId(`settings-tab-${key}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId("settings-tab-chat")).toBeNull();
    expect(screen.queryByTestId("settings-tab-subscription")).toBeNull();
    expect(screen.queryByText("Studio")).toBeNull();
    expect(screen.getByTestId("settings-account-subject")).toHaveTextContent(
      "settings-reader",
    );
    expect(screen.getByText("个人版", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "搜索" })).toHaveAttribute(
      "placeholder",
      "搜索",
    );
  });

  it("设置导航遵循 Manus 的分组顺序，并以置灰行呈现尚未接通的分区", () => {
    renderSettings();

    expect(screen.getByTestId("settings-tab-team")).toBeInTheDocument();
    for (const id of [
      "mail",
      "computer",
      "email",
      "phone",
      "wallet",
      "data-management",
      "integration",
      "developer",
      "help",
    ]) {
      expect(screen.getByTestId(`settings-placeholder-${id}`)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
    expect(screen.queryByTestId("settings-tab-deployment")).toBeNull();
    expect(screen.queryByTestId("settings-tab-integration")).toBeNull();
    expect(screen.queryByTestId("settings-tab-library")).toBeNull();
    expect(screen.queryByTestId("settings-tab-developer")).toBeNull();
  });

  it("技能导入完成后只关闭子弹窗，不卸载设置中心", async () => {
    renderSettings(() => {}, undefined, true, undefined, "skills");
    await screen.findByText("YouTube 影片研究");

    fireEvent.pointerDown(screen.getByRole("button", { name: "添加" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "从 GitHub 导入" }),
    );
    const dialog = await screen.findByTestId("github-import-dialog");
    expect(
      within(dialog).getByTestId("github-repository-input"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "关闭 GitHub 导入" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByTestId("github-import-dialog"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("settings-modal")).toBeInTheDocument();
    expect(screen.getByTestId("settings-tab-skills")).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("预览态账户身份沿用 site brand，不把 fixture team 名泄漏到站点壳层", async () => {
    renderSettings(() => {}, undefined, true);
    expect(await screen.findAllByText("Acme")).not.toHaveLength(0);
    expect(screen.queryByText("Studio")).toBeNull();
  });

  it("受控打开时把焦点交给当前设置 Tab，而不是留在已隐藏的触发按钮", async () => {
    renderSettings();
    await waitFor(() =>
      expect(screen.getByTestId("settings-tab-account")).toHaveFocus(),
    );
  });

  it("打开常规设置时自动聚焦不会滚动并裁切导航首项", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    renderSettings(() => {}, undefined, false, undefined, "appearance");

    await waitFor(() =>
      expect(screen.getByTestId("settings-tab-appearance")).toHaveFocus(),
    );
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
  });

  it("每个 Tab 都有真实对应的 shadcn tabpanel", () => {
    renderSettings();

    for (const key of PANEL_KEYS) {
      expect(screen.getByTestId(`settings-panel-${key}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("settings-panel-account")).toHaveAttribute(
      "role",
      "tabpanel",
    );
    expect(screen.getByTestId("settings-panel-account")).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByTestId("settings-panel-team")).toHaveAttribute("hidden");
  });

  it("切到外观 tab:显示外观分区、账户分区移出 DOM（一次只显一个 tab）", () => {
    renderSettings();
    fireEvent.keyDown(screen.getByTestId("settings-tab-appearance"), {
      key: "Enter",
    });
    expect(screen.getByTestId("settings-appearance")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "聊天偏好", level: 3 }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("settings-task-delivery")).toBeDisabled();
    expect(
      screen.queryByTestId("settings-default-model"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("settings-account")).not.toBeInTheDocument();
  });

  it("通用设置展示外观、对话偏好与通信偏好", () => {
    renderSettings(() => {}, undefined, true);
    fireEvent.keyDown(screen.getByTestId("settings-tab-appearance"), {
      key: "Enter",
    });

    expect(screen.getByRole("radio", { name: "浅色" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "深色" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "自动" })).toBeChecked();
    expect(screen.getByTestId("settings-task-delivery")).toBeDisabled();
    for (const label of [
      "声音提醒",
      "浏览器通知",
      "接收产品更新",
      "关于 Kokoro 的广告",
    ]) {
      expect(screen.getByRole("switch", { name: label })).toBeInTheDocument();
    }
  });

  it("个性化 tab 只呈现有 BFF 契约的资料字段", () => {
    renderSettings(() => {}, undefined, true, undefined, "personalization");
    expect(screen.getByTestId("settings-personalization")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "个性化", level: 1 }),
    ).toBeInTheDocument();
    const nickname = screen.getByRole("textbox", { name: "昵称" });
    fireEvent.change(nickname, { target: { value: "小可" } });
    fireEvent.blur(nickname);
    expect(
      JSON.parse(
        window.localStorage.getItem("kokoro.personalization.preview") ?? "{}",
      ),
    ).toMatchObject({ nickname: "小可" });
    expect(screen.queryByRole("tab", { name: "知识" })).toBeNull();
    expect(screen.queryByRole("button", { name: /匯入记忆/ })).toBeNull();
  });

  it("快捷键 tab 独立于对话偏好并呈现 Manus 风格快捷键行", () => {
    renderSettings();
    fireEvent.keyDown(screen.getByTestId("settings-tab-shortcuts"), {
      key: "Enter",
    });
    expect(screen.getByTestId("settings-shortcuts")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "快捷键" })).toBeInTheDocument();
    const heading = screen.getByRole("heading", {
      name: "键盘快捷键",
      level: 1,
    });
    const description = screen.getByText(
      "自定义快捷键——点击任意操作旁的按键，然后按下新的组合键。",
    );
    expect(heading.parentElement).toContainElement(description);
    expect(screen.getByText("新建任务")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "编辑新建任务快捷键" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "清除新建任务快捷键" }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByTestId("settings-shortcuts")
        .querySelector("svg[data-shortcut-leading-icon]"),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "编辑新建任务快捷键" }));
    expect(
      screen.getByRole("button", { name: "编辑新建任务快捷键" }),
    ).toHaveTextContent("输入按键序列");
    expect(
      screen.queryByRole("button", { name: "清除新建任务快捷键" }),
    ).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByTestId("settings-modal")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "编辑新建任务快捷键" }),
    ).toHaveTextContent("⌘⇧O");
    fireEvent.click(screen.getByRole("button", { name: "编辑新建任务快捷键" }));
    fireEvent.keyDown(document, { key: "P", metaKey: true, shiftKey: true });
    expect(
      screen.getByRole("button", { name: "编辑新建任务快捷键" }),
    ).toHaveTextContent("⌘⇧P");
    expect(
      screen.getByRole("button", { name: "编辑新建任务快捷键" }),
    ).not.toHaveTextContent("O");
    fireEvent.click(screen.getByRole("button", { name: "清除新建任务快捷键" }));
    expect(
      screen.getByRole("button", { name: "编辑新建任务快捷键" }),
    ).toHaveTextContent("未设置");
    expect(screen.getByText("重设为预设值")).toBeInTheDocument();
    fireEvent.click(screen.getByText("重设为预设值"));
    expect(screen.getByRole("status", { name: "已保存" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "编辑新建任务快捷键" }),
    ).toHaveTextContent("⌘⇧O");
  });

  it("对话 tab:选缺省模型就地存 localStorage + 就地保存反馈", async () => {
    renderSettings(() => {}, undefined, false, undefined, "chat");
    fireEvent.click(await screen.findByTestId("settings-default-model"));
    fireEvent.click(await screen.findByText("opus"));
    const prefs = JSON.parse(
      window.localStorage.getItem("kokoro.web.chat-prefs") ?? "{}",
    );
    expect(prefs.model).toBe("anthropic:opus");
    expect(screen.getByTestId("settings-saved")).toBeInTheDocument();
  });

  it("账户中的登录方式使用设置内容区子页面并支持返回", () => {
    renderSettings(() => {}, undefined, true);
    const planBody = screen
      .getByTestId("settings-account")
      .querySelector('[data-slot="account-plan-body"]');
    expect(planBody).not.toBeNull();
    expect(planBody?.children).toHaveLength(1);
    expect(
      planBody?.querySelector('[data-slot="account-credit-group"]'),
    ).toBeInTheDocument();
    expect(
      planBody?.querySelector('[data-slot="account-daily-credit-group"]'),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "管理" }));
    expect(screen.getByTestId("settings-login-methods")).toBeInTheDocument();
    const nestedHeading = screen.getByRole("heading", {
      name: "管理登入方式",
      level: 1,
    });
    expect(nestedHeading.parentElement).toHaveAttribute(
      "data-panel",
      "account",
    );
    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "新增通行密钥" }),
    ).toBeInTheDocument();
    expect(screen.getByText("尚未新增通行密钥")).toBeInTheDocument();
    expect(
      screen.getByText("新增通行密钥以无密码方式登入。"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "中断连接" }));
    expect(screen.getAllByRole("button", { name: "连接" })).toHaveLength(3);
    fireEvent.click(screen.getAllByRole("button", { name: "连接" })[0]!);
    expect(
      screen.getByRole("button", { name: "中断连接" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "管理登入方式" }));
    expect(screen.getByTestId("settings-account")).toBeInTheDocument();
  });

  it("账户邮箱和删除操作打开对应的验证弹窗", async () => {
    renderSettings(() => {}, undefined, true);
    fireEvent.click(screen.getByRole("button", { name: "更改" }));
    const emailDialog = screen.getByRole("dialog", {
      name: "更改电子邮件地址",
    });
    expect(
      screen.getByRole("heading", { name: "更改电子邮件地址" }),
    ).toBeInTheDocument();
    fireEvent.click(within(emailDialog).getByRole("button", { name: "发送" }));
    fireEvent.click(
      within(emailDialog).getAllByRole("button", { name: "取消" })[0]!,
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "更改电子邮件地址" }),
      ).toBeNull(),
    );

    fireEvent.click(screen.getByRole("button", { name: "删除账户" }));
    expect(
      screen.getByRole("heading", { name: "确认删除账户" }),
    ).toBeInTheDocument();
    const deleteDialog = screen.getByRole("dialog", { name: "确认删除账户" });
    const deleteButton = within(deleteDialog).getByRole("button", {
      name: "删除账户",
    });
    expect(deleteButton).toBeDisabled();
    fireEvent.click(
      within(deleteDialog).getByRole("button", { name: "发送验证码" }),
    );
    fireEvent.change(
      within(deleteDialog).getByRole("textbox", { name: "输入验证码" }),
      { target: { value: "123456" } },
    );
    expect(deleteButton).toBeEnabled();
    fireEvent.click(deleteButton);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "确认删除账户" })).toBeNull(),
    );
  });

  it("关闭按钮 × 在退出动画完成后触发 onClose", async () => {
    const onClose = vi.fn();
    renderSettings(onClose);
    fireEvent.click(screen.getByTestId("settings-close"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("Esc 键在退出动画完成后触发 onClose", async () => {
    const onClose = vi.fn();
    renderSettings(onClose);
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("使用官方 Dialog 背幕与卡片结构", () => {
    const onClose = vi.fn();
    renderSettings(onClose);
    const card = screen.getByTestId("settings-modal");
    // 卡内点击不冒泡到背幕(stopPropagation),不关闭。
    fireEvent.click(card);
    expect(onClose).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-slot="dialog-overlay"]'),
    ).toBeInTheDocument();
  });

  it("技能创建菜单与浏览目录保持独立交互", async () => {
    renderSettings(() => {}, undefined, true, undefined, "skills", vi.fn());
    fireEvent.keyDown(screen.getByTestId("settings-tab-skills"), {
      key: "Enter",
    });
    await screen.findByText("YouTube 影片研究");

    fireEvent.keyDown(screen.getByRole("button", { name: "添加" }), {
      key: "Enter",
    });
    expect(
      screen.getByText("使用 AI 创建技能", { selector: '[role="menuitem"]' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("上传技能", { selector: '[role="menuitem"]' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("从 GitHub 导入", { selector: '[role="menuitem"]' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("从官方技能添加", { selector: '[role="menuitem"]' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "从官方技能添加" }));
    expect(
      await screen.findByRole("dialog", { name: "技能" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "官方" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "第三方" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "添加 YouTube 影片研究" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "已添加 Typst PDF 制作工具" }),
    ).toBeDisabled();
  });

  it("使用 AI 创建技能交给共享 Composer，而不是误打开上传页", async () => {
    const onCreateSkillWithAi = vi.fn();
    renderSettings(
      () => {},
      undefined,
      true,
      undefined,
      "skills",
      onCreateSkillWithAi,
    );
    await screen.findByText("YouTube 影片研究");

    fireEvent.keyDown(screen.getByRole("button", { name: "添加" }), {
      key: "Enter",
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "使用 AI 创建技能" }));

    expect(onCreateSkillWithAi).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText("上传一个 zip：根目录下每个文件夹是一个技能。"),
    ).toBeNull();
  });

  it("自定义 MCP 从连接器目录进入独立 MCP 配置表单", async () => {
    renderSettings(() => {}, undefined, true);
    fireEvent.keyDown(screen.getByTestId("settings-tab-mcp"), { key: "Enter" });

    fireEvent.click(await screen.findByRole("button", { name: "浏览连接器" }));
    const catalog = await screen.findByRole("dialog", { name: "连接器" });
    fireEvent.keyDown(within(catalog).getByRole("button", { name: "创建" }), {
      key: "Enter",
    });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "自定义 MCP" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "MCP 配置",
    });
    expect(
      within(dialog).getByRole("textbox", { name: /^服务器名称/ }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("textbox", { name: /^服务器 URL/ }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "添加自定义 header" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "进阶设置（选填）" }),
    ).toBeNull();
    expect(
      within(dialog).queryByRole("textbox", { name: "OAuth Client ID" }),
    ).toBeNull();
  });

  it("JSON 导入保持为独立的配置对话框", async () => {
    renderSettings(() => {}, undefined, true);
    fireEvent.keyDown(screen.getByTestId("settings-tab-mcp"), { key: "Enter" });
    fireEvent.click(await screen.findByRole("button", { name: "浏览连接器" }));
    const catalog = await screen.findByRole("dialog", { name: "连接器" });

    fireEvent.keyDown(within(catalog).getByRole("button", { name: "创建" }), {
      key: "Enter",
    });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "通过 JSON 导入 MCP" }),
    );
    const jsonDialog = await screen.findByRole("dialog", {
      name: "通过 JSON 导入",
    });
    expect(
      within(jsonDialog).queryByRole("textbox", { name: "服务器名称" }),
    ).toBeNull();
    const jsonInput = within(jsonDialog).getByRole("textbox", {
      name: "请粘贴您的配置 JSON",
    });
    const importButton = within(jsonDialog).getByRole("button", {
      name: "导入",
    });
    expect(importButton).toBeDisabled();
    fireEvent.change(jsonInput, { target: { value: "{" } });
    fireEvent.click(importButton);
    expect(await within(jsonDialog).findByRole("alert")).toHaveTextContent(
      "JSON 格式无效",
    );
    // JSON is intentionally its own owner command, so this UI test only
    // covers the observed dialog/validation boundary rather than locking a
    // browser-side single-server parser into the public contract.
    fireEvent.click(within(jsonDialog).getAllByRole("button", { name: "取消" })[0]!);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "通过 JSON 导入" }),
      ).toBeNull(),
    );
  });

  it("没有真实 DialogTrigger 时关闭也能把焦点交还给稳定的导航按钮", async () => {
    const returnFocusRef = createRef<HTMLButtonElement>();
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button ref={returnFocusRef} type="button">
            导航
          </button>
          {open ? (
            <SettingsModal
              initialTab="account"
              onClose={() => setOpen(false)}
              returnFocusRef={returnFocusRef}
            />
          ) : null}
        </>
      );
    }
    render(
      <ThemeProvider>
        <LocaleProvider>
          <Harness />
        </LocaleProvider>
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByTestId("settings-close"));
    await waitFor(() => expect(returnFocusRef.current).toHaveFocus());
  });

  it("设置关闭回收焦点时不改变页面滚动位置", async () => {
    const returnFocusRef = createRef<HTMLButtonElement>();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button ref={returnFocusRef} type="button">
            导航
          </button>
          {open ? (
            <SettingsModal
              initialTab="account"
              onClose={() => setOpen(false)}
              returnFocusRef={returnFocusRef}
            />
          ) : null}
        </>
      );
    }
    render(
      <ThemeProvider>
        <LocaleProvider>
          <Harness />
        </LocaleProvider>
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByTestId("settings-close"));
    await waitFor(() => expect(returnFocusRef.current).toHaveFocus());
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    focus.mockRestore();
  });

  it("深链打开且没有 return ref 时关闭也回到 Composer", async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <textarea
            data-settings-return-target="composer"
            aria-label="对话输入"
          />
          {open ? (
            <SettingsModal
              initialTab="subscription"
              onClose={() => setOpen(false)}
            />
          ) : null}
        </>
      );
    }
    render(
      <ThemeProvider>
        <LocaleProvider>
          <Harness />
        </LocaleProvider>
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByTestId("settings-close"));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "对话输入" })).toHaveFocus(),
    );
  });

  it("多站点嵌入时设置关闭回退焦点限定在当前 shell", async () => {
    const localComposerRef = createRef<HTMLTextAreaElement>();
    function Harness() {
      const scopeRef = createRef<HTMLDivElement>();
      const [open, setOpen] = useState(true);
      return (
        <>
          <textarea
            data-settings-return-target="composer"
            aria-label="另一个站点输入框"
          />
          <div ref={scopeRef}>
            <textarea
              ref={localComposerRef}
              data-settings-return-target="composer"
              aria-label="当前站点输入框"
            />
            {open ? (
              <SettingsModal
                initialTab="subscription"
                onClose={() => setOpen(false)}
                focusScopeRef={scopeRef}
              />
            ) : null}
          </div>
        </>
      );
    }
    render(
      <ThemeProvider>
        <LocaleProvider>
          <Harness />
        </LocaleProvider>
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByTestId("settings-close"));
    await waitFor(() => expect(localComposerRef.current).toHaveFocus());
  });

  it("移动触发器在关闭前因断点变为零尺寸时回退到 Composer", async () => {
    const returnFocusRef = createRef<HTMLButtonElement>();
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button
            ref={returnFocusRef}
            data-slot="sidebar-trigger"
            type="button"
          >
            导航
          </button>
          <textarea
            data-settings-return-target="composer"
            aria-label="对话输入"
          />
          {open ? (
            <SettingsModal
              initialTab="account"
              onClose={() => setOpen(false)}
              returnFocusRef={returnFocusRef}
            />
          ) : null}
        </>
      );
    }
    render(
      <ThemeProvider>
        <LocaleProvider>
          <Harness />
        </LocaleProvider>
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByTestId("settings-close"));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "对话输入" })).toHaveFocus(),
    );
  });

});

describe("R255 live account has no invented Credit policy", () => {
  it("does not claim Free membership, free credits or a daily grant without owner facts", () => {
    renderSettings(() => {}, undefined, false);
    const account = screen.getByTestId("settings-account");
    expect(account).not.toHaveTextContent("免费");
    expect(account).not.toHaveTextContent("每日刷新积分");
    expect(
      account.querySelector('[data-slot="account-daily-credit-group"]'),
    ).toBeNull();
  });
});

describe("R255 preset retirement: Settings model-only preferences", () => {
  afterEach(async () => {
    cleanup();
    // Drain Radix FocusScope's owned unmount task before this jsdom realm is released.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });

  it("正常 Settings 保留可用模型目录且不请求旧 agents 目录", async () => {
    const requestedPaths: string[] = [];
    const listSpy = vi
      .spyOn(pageClients, "browserListClient")
      .mockReturnValue(createSessionClient({ baseUrl: "/api/session" }));
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          window.location.origin,
        );
        requestedPaths.push(url.pathname);
        if (url.pathname === "/api/session/models")
          return Response.json({
            models: [{ provider: "anthropic", name: "opus", is_default: true }],
          });
        // Keep the old route successful: a real obsolete request, not a missing fixture, must cause RED.
        if (url.pathname === "/api/session/agents")
          return Response.json({
            agents: [
              { name: "general", description: "default", is_default: true },
            ],
          });
        return Response.json({}, { status: 503 });
      });
    try {
      renderSettings(() => {}, undefined, false, undefined, "chat");
      fireEvent.click(await screen.findByTestId("settings-default-model"));
      fireEvent.click(await screen.findByRole("option", { name: "opus" }));
      expect(screen.getByTestId("settings-default-model")).toHaveTextContent(
        "opus",
      );
      expect(requestedPaths).toContain("/api/session/models");
      expect(
        JSON.parse(
          window.localStorage.getItem("kokoro.web.chat-prefs") ?? "null",
        ),
      ).toEqual({ model: "anthropic:opus" });
      expect(requestedPaths).not.toContain("/api/session/agents");
      expect(screen.queryByTestId("settings-default-agent")).toBeNull();
    } finally {
      cleanup();
      listSpy.mockRestore();
      fetchSpy.mockRestore();
    }
  });

  it.each(["general", null])(
    "含旧 agent=%s 的偏好整体失效，不迁移其中的 model",
    async (agent) => {
      window.localStorage.setItem(
        "kokoro.web.chat-prefs",
        JSON.stringify({ model: "anthropic:opus", agent }),
      );
      renderSettings(() => {}, undefined, false, undefined, "chat");
      const model = await screen.findByTestId("settings-default-model");
      fireEvent.click(model);
      await screen.findByRole("option", { name: "opus" });
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
      expect(model).toHaveTextContent("跟随空间缺省");
      expect(model).not.toHaveTextContent("opus");

      fireEvent.click(model);
      fireEvent.click(await screen.findByRole("option", { name: "opus" }));
      expect(
        JSON.parse(
          window.localStorage.getItem("kokoro.web.chat-prefs") ?? "null",
        ),
      ).toEqual({ model: "anthropic:opus" });
    },
  );

  it("新的 model-only 偏好正常保存并在重新挂载后读回精确 shape", async () => {
    window.localStorage.setItem(
      "kokoro.web.chat-prefs",
      JSON.stringify({ model: null }),
    );
    const first = renderSettings(() => {}, undefined, false, undefined, "chat");
    expect(screen.getByTestId("settings-default-model")).toHaveTextContent(
      "跟随空间缺省",
    );
    fireEvent.click(screen.getByTestId("settings-default-model"));
    fireEvent.click(await screen.findByRole("option", { name: "opus" }));
    expect(screen.getByTestId("settings-saved")).toBeInTheDocument();
    expect(
      JSON.parse(
        window.localStorage.getItem("kokoro.web.chat-prefs") ?? "null",
      ),
    ).toEqual({ model: "anthropic:opus" });
    first.unmount();

    renderSettings(() => {}, undefined, false, undefined, "chat");
    await waitFor(() =>
      expect(screen.getByTestId("settings-default-model")).toHaveTextContent(
        "opus",
      ),
    );
    expect(
      JSON.parse(
        window.localStorage.getItem("kokoro.web.chat-prefs") ?? "null",
      ),
    ).toEqual({ model: "anthropic:opus" });
  });
});

it("R255 正式设置嵌入 MCP 投影使用 Manus 的已添加连接器工具栏", async () => {
  try {
    renderSettings(() => {}, undefined, false, undefined, "mcp");
    expect(await screen.findByText("Owner MCP")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "已添加的连接器", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "浏览连接器" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "连接器", level: 2 }),
    ).toBeNull();
  } finally {
    cleanup();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
});
