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
  registerCustomMcp,
  registerCustomApi,
  uploadConnectorIcon,
  endProductSession,
} = vi.hoisted(() => ({
  registerCustomMcp: vi.fn().mockResolvedValue({}),
  registerCustomApi: vi.fn().mockResolvedValue({}),
  uploadConnectorIcon: vi
    .fn()
    .mockResolvedValue({ asset_id: "asset_crm", url: "/assets/crm.png" }),
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
    listMcpServers: vi.fn().mockResolvedValue([]),
    listMcpSecrets: vi.fn().mockResolvedValue([]),
    registerCustomMcp,
    registerCustomApi,
    uploadConnectorIcon,
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
  "subscription",
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
  registerCustomMcp.mockClear();
  registerCustomApi.mockClear();
  uploadConnectorIcon.mockClear();
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

  it("keeps account upgrade as readable catalog navigation without a transaction", async () => {
    const onTabChange = vi.fn();
    renderSettings(() => {}, onTabChange);
    const upgrade = await screen.findByRole("button", { name: "升级" });
    expect(upgrade).toBeEnabled();
    fireEvent.click(upgrade);
    expect(onTabChange).toHaveBeenCalledWith("subscription");
    expect(screen.getByTestId("settings-panel-subscription")).not.toHaveAttribute("hidden");
  });

  it("labels the existing team management tab honestly and navigates without team creation", async () => {
    const onTabChange = vi.fn();
    renderSettings(() => {}, onTabChange);
    const team = screen.getByTestId("settings-tab-team");
    expect(team).toHaveTextContent("团队");
    expect(team).not.toHaveTextContent("创建");
    fireEvent.keyDown(team, { key: "Enter" });
    expect(onTabChange).toHaveBeenCalledWith("team");
    expect(screen.getByTestId("settings-panel-team")).not.toHaveAttribute("hidden");
    expect(screen.queryByRole("button", { name: "创建团队" })).toBeNull();
  });

  it("passes the real admitted Team boundary and retires the Team branch when admission is lost", async () => {
    const view = render(<ThemeProvider><LocaleProvider><SettingsModal brandName="Acme" preview={false}
      readBoundary={{ admitted: true, subject: "user-me", generation: 1 }} initialTab="team" onClose={() => {}} /></LocaleProvider></ThemeProvider>)
    expect(await screen.findByTestId("member-row-member-me")).toHaveTextContent("Me")
    view.rerender(<ThemeProvider><LocaleProvider><SettingsModal brandName="Acme" preview={false}
      readBoundary={{ admitted: false, subject: "user-me", generation: 2 }} initialTab="team" onClose={() => {}} /></LocaleProvider></ThemeProvider>)
    expect(screen.queryByTestId("member-row-member-me")).toBeNull()
  })

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
    expect(screen.getByTestId("settings-tab-subscription")).toBeInTheDocument();
    expect(screen.queryByText("Studio")).toBeNull();
    expect(screen.getByRole("textbox", { name: "全名" })).toHaveValue("—");
    expect(screen.getByText("个人版", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "搜索" })).toHaveAttribute(
      "placeholder",
      "搜索",
    );
  });

  it("设置导航遵循 Manus 的分组顺序，并以置灰行呈现尚未接通的分区", () => {
    renderSettings();

    expect(screen.getByTestId("settings-tab-team")).toBeInTheDocument();
    for (const id of ["mail", "computer", "email", "phone", "wallet", "integration", "developer"]) {
      expect(screen.getByTestId(`settings-placeholder-${id}`)).toHaveAttribute("aria-disabled", "true");
    }
    expect(screen.queryByTestId("settings-tab-deployment")).toBeNull();
    expect(screen.queryByTestId("settings-tab-integration")).toBeNull();
    expect(screen.queryByTestId("settings-tab-library")).toBeNull();
    expect(screen.queryByTestId("settings-tab-developer")).toBeNull();
  });

  it("SET21 Data is selectable and exposes same-page sections with unavailable management disabled", () => {
    renderSettings();
    const tab = screen.getByTestId("settings-tab-data-management");
    expect(tab).not.toBeDisabled();
    fireEvent.keyDown(tab, { key: "Enter" });
    expect(screen.getByRole("heading", { name: "数据管理", level: 1 })).toBeInTheDocument();
    for (const name of ["已分享任务", "已分享文件", "已归档任务", "授权应用", "云浏览器数据", "已购买域名"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("tablist")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "管理" })).toHaveLength(3);
    for (const button of screen.getAllByRole("button", { name: "管理" })) expect(button).toBeDisabled();
  });

  it("SET22 Help is selectable and provides this product help without a fake support submission", () => {
    renderSettings();
    const tab = screen.getByTestId("settings-tab-help");
    expect(tab).not.toBeDisabled();
    fireEvent.keyDown(tab, { key: "Enter" });
    expect(screen.getByRole("heading", { name: "获取帮助", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "账户与设备" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "任务分享" })).toBeInTheDocument();
    expect(screen.getByText(/通过任务分享按钮/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /发送|提交反馈|联系客服/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Manus/ })).toBeNull();
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
    expect(screen.queryByTestId("settings-default-model")).not.toBeInTheDocument();
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
    for (const label of ["声音提醒", "浏览器通知", "接收产品更新", "关于 Kokoro 的广告"]) {
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
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
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

  it("设置面板清除 Dialog 默认内边距并按视口盒模型布局", () => {
    renderSettings();
    const card = screen.getByTestId("settings-modal");
    expect(card).toHaveClass("p-0", "box-border");
  });

  it("右侧标题与设置内容由同一个 ScrollArea viewport 滚动", () => {
    renderSettings(() => {}, undefined, false, undefined, "appearance");

    const panel = screen.getByTestId("settings-panel-appearance");
    const viewport = panel.querySelector('[data-slot="scroll-area-viewport"]');
    expect(viewport).not.toBeNull();
    expect(viewport).toContainElement(
      screen.getByRole("heading", { name: "通用" }),
    );
    expect(viewport).toContainElement(
      screen.getByTestId("settings-appearance"),
    );
  });

  it("内嵌业务面板把横向 gutter 交给 Settings ScrollArea", async () => {
    renderSettings(() => {}, undefined, true);
    fireEvent.keyDown(screen.getByTestId("settings-tab-skills"), {
      key: "Enter",
    });
    expect(
      await screen.findByTestId("settings-panel-skills"),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-embedded="true"]')).not.toBeNull();
  });

  it("技能设置使用双列目录、范围筛选和可用状态开关", async () => {
    renderSettings(() => {}, undefined, true);
    fireEvent.keyDown(screen.getByTestId("settings-tab-skills"), {
      key: "Enter",
    });

    expect(await screen.findByText("YouTube 影片研究")).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "搜索技能" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "全部" })).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "启用 YouTube 影片研究" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("switch", { name: "停用 Typst PDF 制作工具" }),
    ).toBeChecked();
    expect(screen.getAllByText("更新于 2026年8月28日").length).toBeGreaterThan(
      1,
    );
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

  it("连接器目录支持搜索、分类、添加状态并在关闭后返回浏览入口", async () => {
    renderSettings(() => {}, undefined, true);
    fireEvent.keyDown(screen.getByTestId("settings-tab-mcp"), { key: "Enter" });

    const browse = await screen.findByRole("button", { name: "浏览连接器" });
    fireEvent.click(browse);
    const catalog = await screen.findByRole("dialog", { name: "连接器" });
    const search = within(catalog).getByRole("searchbox", {
      name: "搜索连接器",
    });

    fireEvent.change(search, { target: { value: "GitHub" } });
    expect(
      within(catalog).getByText("GitHub", { exact: true }),
    ).toBeInTheDocument();
    expect(within(catalog).queryByText("Gmail", { exact: true })).toBeNull();

    fireEvent.change(search, { target: { value: "" } });
    fireEvent.keyDown(
      within(catalog).getByRole("tab", { name: "自定义 API" }),
      { key: "Enter" },
    );
    expect(
      within(catalog).getByText("ElevenLabs API", { exact: true }),
    ).toBeInTheDocument();
    expect(
      within(catalog).queryByText("My Browser", { exact: true }),
    ).toBeNull();

    const add = within(catalog).getByRole("button", {
      name: "添加 ElevenLabs API",
    });
    fireEvent.click(add);
    expect(
      within(catalog).getByRole("button", { name: "移除 ElevenLabs API" }),
    ).toBeInTheDocument();

    const create = within(catalog).getByRole("button", { name: "创建" });
    fireEvent.keyDown(create, { key: "Enter" });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "自定义 API" }),
    );
    const customApi = await screen.findByRole("dialog", {
      name: "新增自定义 API",
    });
    const save = within(customApi).getByRole("button", { name: "保存" });
    expect(save).toBeDisabled();

    const iconInput =
      customApi.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(iconInput, {
      target: {
        files: [new File(["text"], "icon.txt", { type: "text/plain" })],
      },
    });
    expect(within(customApi).getByRole("alert")).toHaveTextContent(
      "请选择 PNG 或 JPG 图像。",
    );
    fireEvent.change(iconInput, {
      target: {
        files: [
          new File([new Uint8Array(1024 * 1024 + 1)], "large.png", {
            type: "image/png",
          }),
        ],
      },
    });
    expect(within(customApi).getByRole("alert")).toHaveTextContent(
      "图像大小不能超过 1 MB。",
    );
    fireEvent.change(iconInput, {
      target: { files: [new File(["png"], "crm.png", { type: "image/png" })] },
    });
    expect(within(customApi).queryByRole("alert")).toBeNull();
    expect(within(customApi).getByText("crm.png")).toBeInTheDocument();

    fireEvent.change(
      within(customApi).getByRole("textbox", { name: /^名称$/ }),
      { target: { value: "CRM API" } },
    );
    fireEvent.change(
      within(customApi).getByRole("textbox", { name: "密钥名称" }),
      { target: { value: "CRM_TOKEN" } },
    );
    fireEvent.change(within(customApi).getByRole("textbox", { name: "数值" }), {
      target: { value: "example-token" },
    });
    expect(save).toBeEnabled();

    fireEvent.click(
      within(customApi).getByRole("button", { name: "添加密钥" }),
    );
    expect(
      within(customApi).getAllByRole("textbox", { name: "密钥名称" }),
    ).toHaveLength(2);
    expect(save).toBeDisabled();
    fireEvent.click(
      within(customApi).getByRole("button", { name: "移除密钥" }),
    );
    fireEvent.click(save);
    await waitFor(() =>
      expect(uploadConnectorIcon).toHaveBeenCalledWith(
        expect.objectContaining({ name: "crm.png" }),
      ),
    );
    await waitFor(() =>
      expect(registerCustomApi).toHaveBeenCalledWith({
        name: "CRM API",
        notes: null,
        icon_asset_id: "asset_crm",
        secrets: [{ name: "CRM_TOKEN", value: "example-token" }],
        enabled: true,
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "新增自定义 API" }),
      ).toBeNull(),
    );
    await waitFor(() => expect(create).toHaveFocus());
    expect(screen.getByRole("dialog", { name: "连接器" })).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "连接器" })).toBeNull(),
    );
    await waitFor(() => expect(browse).toHaveFocus());
  });

  it("自定义 API 保存失败时保留表单和弹窗并显示错误", async () => {
    registerCustomApi.mockRejectedValueOnce(new Error("fixture rejection"));
    renderSettings(() => {}, undefined, true);
    fireEvent.keyDown(screen.getByTestId("settings-tab-mcp"), { key: "Enter" });
    fireEvent.click(await screen.findByRole("button", { name: "浏览连接器" }));
    const catalog = await screen.findByRole("dialog", { name: "连接器" });
    fireEvent.keyDown(within(catalog).getByRole("button", { name: "创建" }), {
      key: "Enter",
    });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "自定义 API" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "新增自定义 API",
    });
    const name = within(dialog).getByRole("textbox", { name: /^名称$/ });
    const secretName = within(dialog).getByRole("textbox", {
      name: "密钥名称",
    });
    const secretValue = within(dialog).getByRole("textbox", { name: "数值" });
    fireEvent.change(name, { target: { value: "CRM API" } });
    fireEvent.change(secretName, { target: { value: "CRM_TOKEN" } });
    fireEvent.change(secretValue, { target: { value: "WRITE_ONLY" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "操作失败，请稍后再试。",
    );
    expect(
      screen.getByRole("dialog", { name: "新增自定义 API" }),
    ).toBeInTheDocument();
    expect(name).toHaveValue("CRM API");
    expect(secretName).toHaveValue("CRM_TOKEN");
    expect(secretValue).toHaveValue("WRITE_ONLY");
  });

  it("自定义 MCP 使用参考字段、动态 header 和单一发布菜单", async () => {
    renderSettings(() => {}, undefined, true);
    fireEvent.keyDown(screen.getByTestId("settings-tab-mcp"), { key: "Enter" });

    fireEvent.click(await screen.findByRole("button", { name: "浏览连接器" }));
    const catalog = await screen.findByRole("dialog", { name: "连接器" });
    const create = within(catalog).getByRole("button", { name: "创建" });
    fireEvent.keyDown(create, { key: "Enter" });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "自定义 MCP" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "MCP 设置" });
    const save = within(dialog).getAllByRole("button", { name: "保存" })[0];
    const saveOptions = within(dialog).getByRole("button", {
      name: "保存选项",
    });
    expect(save).toBeDisabled();
    expect(saveOptions).toBeDisabled();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "新增自定义 Header" }),
    );
    expect(
      within(dialog).getByPlaceholderText("Header 名称"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByPlaceholderText("Header 值"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "移除 header" }),
    );
    expect(within(dialog).queryByPlaceholderText("Header 名称")).toBeNull();

    fireEvent.change(
      within(dialog).getByPlaceholderText("e.g., My Custom Server"),
      { target: { value: "Demo MCP" } },
    );
    fireEvent.change(
      within(dialog).getByPlaceholderText("https://mcp.yourserver.com/mcp"),
      { target: { value: "https://example.com/mcp" } },
    );
    expect(save).toBeEnabled();
    expect(saveOptions).toBeEnabled();

    fireEvent.keyDown(saveOptions, { key: "Enter" });
    expect(
      await screen.findByRole("menuitem", { name: "发布到专案" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "保存并启用" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "保存为停用" })).toBeNull();
  });

  it("JSON 导入与 URL 添加使用独立流程，而不是复用 Custom MCP 表单", async () => {
    renderSettings(() => {}, undefined, true);
    fireEvent.keyDown(screen.getByTestId("settings-tab-mcp"), { key: "Enter" });
    fireEvent.click(await screen.findByRole("button", { name: "浏览连接器" }));
    let catalog = await screen.findByRole("dialog", { name: "连接器" });

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
      name: "请粘贴您的设置 JSON",
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
    fireEvent.change(jsonInput, {
      target: {
        value:
          '{"mcpServers":{"demo":{"type":"streamableHttp","url":"https://fixture.example.test/mcp"}}}',
      },
    });
    fireEvent.click(importButton);
    await waitFor(() =>
      expect(registerCustomMcp).toHaveBeenCalledWith({
        name: "demo",
        transport: "streamable_http",
        endpoint_url: "https://fixture.example.test/mcp",
        icon_asset_id: null,
        instructions: null,
        headers: [],
        enabled: true,
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "通过 JSON 导入" }),
      ).toBeNull(),
    );

    fireEvent.click(await screen.findByRole("button", { name: "浏览连接器" }));
    catalog = await screen.findByRole("dialog", { name: "连接器" });
    fireEvent.keyDown(within(catalog).getByRole("button", { name: "创建" }), {
      key: "Enter",
    });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /通过 URL 添加 MCP/ }),
    );
    const urlDialog = await screen.findByRole("dialog", {
      name: /通过 URL 添加 MCP/,
    });
    expect(
      within(urlDialog).queryByRole("textbox", { name: "请粘贴您的设置 JSON" }),
    ).toBeNull();
    const save = within(urlDialog).getByRole("button", { name: "保存" });
    const publish = within(urlDialog).getByRole("button", {
      name: /保存并发布/,
    });
    expect(save).toBeDisabled();
    expect(publish).toBeDisabled();
    fireEvent.change(
      within(urlDialog).getByRole("textbox", { name: /服务器名称/ }),
      { target: { value: "Demo URL MCP" } },
    );
    fireEvent.change(
      within(urlDialog).getByRole("textbox", { name: /服务器 URL/ }),
      { target: { value: "https://fixture.example.test/mcp" } },
    );
    expect(save).toBeEnabled();
    expect(publish).toBeEnabled();
    fireEvent.click(
      within(urlDialog).getByRole("button", { name: /进阶设置/ }),
    );
    expect(
      within(urlDialog).queryByRole("textbox", { name: "OAuth 用户端 ID" }),
    ).toBeNull();
    expect(within(urlDialog).queryByLabelText("OAuth 用户端密钥")).toBeNull();
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

  it("Web 设置把所有可用分区保留在 Manus 风格的滚动导航中", () => {
    const onTabChange = vi.fn();
    render(
      <ThemeProvider>
        <LocaleProvider>
          <SettingsModal
            initialTab="account"
            preview
            onClose={() => {}}
            onTabChange={onTabChange}
          />
        </LocaleProvider>
      </ThemeProvider>,
    );

    expect(screen.getByRole("tablist")).toHaveAttribute(
      "aria-orientation",
      "horizontal",
    );
    expect(screen.getByTestId("settings-tab-mcp")).toBeVisible();
    expect(screen.getByTestId("settings-tab-skills")).toBeVisible();
    expect(screen.queryByTestId("settings-more")).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("settings-tab-skills"), {
      button: 0,
    });
    expect(onTabChange).toHaveBeenCalledWith("skills");
    expect(screen.getByTestId("settings-panel-skills")).toBeInTheDocument();
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


// SET23: actual mounted providers and key-scoped persistence failures.
describe("SET23 real preference persistence feedback", () => {
  function mountPreferenceModal() {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <ThemeProvider>
          <LocaleProvider>
            <button aria-expanded={open} onClick={() => setOpen(true)}>Reopen preferences fixture</button>
            {open ? (
              <SettingsModal
                brandName="Acme"
                preview
                initialTab="appearance"
                onClose={() => setOpen(false)}
              />
            ) : null}
          </LocaleProvider>
        </ThemeProvider>
      );
    }
    return render(<Harness />);
  }

  async function selectEnglishWithKeyboard() {
    const trigger = screen.getByRole("combobox", { name: "界面语言" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const english = await screen.findByRole("option", { name: "English" });
    // Real Radix content keyboard navigation: initial zh -> next en -> commit.
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "Home" });
    fireEvent.keyDown(screen.getByRole("option", { name: "中文" }), {
      key: "ArrowDown",
    });
    await waitFor(() => expect(english).toHaveFocus());
    fireEvent.keyDown(english, { key: "Enter" });
    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
  }

  function failPreferenceWrites() {
    const native = Storage.prototype.setItem;
    const blocked = new Set(["kokoro.theme", "kokoro.locale"]);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(
      function (this: Storage, key: string, value: string) {
        if (this === window.localStorage && blocked.has(key))
          throw new DOMException("preference persistence unavailable", "QuotaExceededError");
        return native.call(this, key, value);
      },
    );
    return { blocked, restore: () => spy.mockRestore() };
  }

  function preferenceAlerts() {
    return screen.getAllByRole("alert");
  }

  it("theme and keyboard-selected English apply immediately but retain old stored values and announce failed persistence", async () => {
    localStorage.setItem("kokoro.theme", "light");
    localStorage.setItem("kokoro.locale", "zh");
    const failure = failPreferenceWrites();
    try {
      mountPreferenceModal();
      fireEvent.click(screen.getByRole("radio", { name: "深色" }));
      await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
      await selectEnglishWithKeyboard();
      expect(localStorage.getItem("kokoro.theme")).toBe("light");
      expect(localStorage.getItem("kokoro.locale")).toBe("zh");
      expect(preferenceAlerts()).toHaveLength(2);
      for (const alert of preferenceAlerts()) {
        expect(alert).toHaveTextContent(/not saved/i);
        expect(alert).toHaveTextContent(/refresh/i);
        expect(within(alert).getByRole("button", { name: /retry saving/i })).toBeEnabled();
      }
    } finally {
      failure.restore();
    }
  });

  it("closing and reopening preserves mounted-provider errors; explicit retry clears only its own flag and true remount restores saved choices", async () => {
    localStorage.setItem("kokoro.theme", "light");
    localStorage.setItem("kokoro.locale", "zh");
    const failure = failPreferenceWrites();
    try {
      const mounted = mountPreferenceModal();
      fireEvent.click(screen.getByRole("radio", { name: "深色" }));
      await selectEnglishWithKeyboard();
      expect(document.documentElement).toHaveClass("dark");
      expect(document.documentElement.lang).toBe("en");
      expect(localStorage.getItem("kokoro.theme")).toBe("light");
      expect(localStorage.getItem("kokoro.locale")).toBe("zh");
      expect(preferenceAlerts()).toHaveLength(2);
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(screen.getByRole("button", { name: "Reopen preferences fixture" })).toHaveAttribute("aria-expanded", "false"));
      fireEvent.click(screen.getByRole("button", { name: "Reopen preferences fixture" }));
      expect(preferenceAlerts()).toHaveLength(2);
      expect(document.documentElement).toHaveClass("dark");
      expect(document.documentElement.lang).toBe("en");
      // Scope retry to its corresponding control's container, never an ordinal.
      failure.blocked.delete("kokoro.locale");
      const languageRow = screen.getByRole("combobox", { name: "Interface language" }).parentElement!;
      fireEvent.click(within(languageRow).getByRole("button", { name: /retry saving/i }));
      expect(localStorage.getItem("kokoro.locale")).toBe("en");
      expect(localStorage.getItem("kokoro.theme")).toBe("light");
      expect(preferenceAlerts()).toHaveLength(1);
      failure.blocked.delete("kokoro.theme");
      fireEvent.click(within(preferenceAlerts()[0]!).getByRole("button", { name: /retry saving/i }));
      expect(localStorage.getItem("kokoro.theme")).toBe("dark");
      expect(screen.queryByRole("alert")).toBeNull();
      mounted.unmount();
      mountPreferenceModal();
      await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
      expect(document.documentElement.lang).toBe("en");
      expect(screen.queryByRole("alert")).toBeNull();
    } finally {
      failure.restore();
    }
  });

  it("true provider unmount before retry restores old persisted light and Chinese rather than failed in-memory preferences", async () => {
    localStorage.setItem("kokoro.theme", "light");
    localStorage.setItem("kokoro.locale", "zh");
    const failure = failPreferenceWrites();
    try {
      const mounted = mountPreferenceModal();
      fireEvent.click(screen.getByRole("radio", { name: "深色" }));
      await selectEnglishWithKeyboard();
      expect(document.documentElement).toHaveClass("dark");
      expect(document.documentElement.lang).toBe("en");
      expect(localStorage.getItem("kokoro.theme")).toBe("light");
      expect(localStorage.getItem("kokoro.locale")).toBe("zh");
      expect(preferenceAlerts()).toHaveLength(2);
      mounted.unmount();
      mountPreferenceModal();
      await waitFor(() => expect(document.documentElement).not.toHaveClass("dark"));
      expect(document.documentElement.lang).toBe("zh");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(localStorage.getItem("kokoro.theme")).toBe("light");
      expect(localStorage.getItem("kokoro.locale")).toBe("zh");
    } finally {
      failure.restore();
    }
  });
});


let set24ProfileSubject = "settings-reader";
function set24ProfileFixture() {
  let restoreProfile = () => {};
  beforeEach(async () => {
    set24ProfileSubject = "settings-reader";
    const client = await import("@/ui/settings/account-profile-client");
    const spy = vi.spyOn(client, "readAccountProfile").mockImplementation(async () => ({
      subject: set24ProfileSubject, name: "Fixture Owner", email: "owner@example.test", email_verified: true,
    }));
    restoreProfile = () => spy.mockRestore();
  });
  afterEach(() => restoreProfile());
}

// SET24 private preparation only. Original accepted 50-case prefix preserved.
// Run only first case for original-source RED after formal tests-only admission.
describe("SET24 bounded account logout", () => {
  set24ProfileFixture();
  it("rejected signout announces an unconfirmed result and restores the explicit logout button", async () => {
    endProductSession.mockRejectedValueOnce(new Error("Product sign-out unavailable"));
    try {
      renderSettings();
      const logout = screen.getByTestId("settings-logout");
      fireEvent.click(logout);
      await waitFor(() => expect(endProductSession).toHaveBeenCalledOnce());
      const alert = await screen.findByText(/无法确认.*退出|退出.*无法确认/, { selector: '[role="alert"]' });
      expect(alert).toHaveTextContent(/无法确认.*退出|退出.*无法确认/);
      expect(logout).toBeEnabled();
      expect(endProductSession).toHaveBeenCalledTimes(1);
    } finally {
      endProductSession.mockReset();
      endProductSession.mockResolvedValue(undefined);
    }
  });

  // GREEN followups use this helper so actual client cancellation is exercised,
  // not a mock that voluntarily suppresses stale navigation.
  async function installActualSignout() {
    const actual = await vi.importActual<typeof import("@/ui/auth/product-auth-client")>(
      "@/ui/auth/product-auth-client",
    );
    endProductSession.mockImplementation(actual.endProductSession);
  }

  it("real signout client cannot dispatch POST after retirement during pending CSRF body", async () => {
    let finishBody!: (value: { csrfToken: string }) => void;
    let csrfSignal: AbortSignal | undefined;
    const fetcher = vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      csrfSignal = init?.signal ?? undefined;
      return Promise.resolve({ ok: true, json: () => new Promise((resolve) => { finishBody = resolve; }) });
    });
    try {
      await installActualSignout();
      vi.stubGlobal("fetch", fetcher);
      const mounted = renderSettings();
      fireEvent.click(screen.getByTestId("settings-logout"));
      await waitFor(() => expect(finishBody).toBeTypeOf("function"));
      mounted.unmount();
      expect(csrfSignal?.aborted).toBe(true);
      const { act } = await import("@testing-library/react");
      await act(async () => { finishBody({ csrfToken: "Csrf123" }); });
      expect(fetcher).toHaveBeenCalledTimes(1); // no late signout POST
    } finally {
      endProductSession.mockReset();
      endProductSession.mockResolvedValue(undefined);
      vi.unstubAllGlobals();
    }
  });

  it("explicit retry dispatches once even for two clicks in the same turn", async () => {
    let settle!: () => void;
    endProductSession.mockRejectedValueOnce(new Error("unconfirmed"));
    try {
      renderSettings();
      fireEvent.click(screen.getByTestId("settings-logout"));
      await screen.findByRole("alert");
      endProductSession.mockImplementationOnce(() => new Promise<void>((resolve) => { settle = resolve; }));
      const { act } = await import("@testing-library/react");
      act(() => {
        const button = screen.getByTestId("settings-logout");
        button.click();
        button.click();
      });
      expect(endProductSession).toHaveBeenCalledTimes(2); // failure + one explicit retry
      await act(async () => { settle(); });
    } finally {
      endProductSession.mockReset();
      endProductSession.mockResolvedValue(undefined);
    }
  });
});


// Executable GREEN draft cases; not run or admitted into repository yet.
describe("SET24 deadline and retirement followups", () => {
  set24ProfileFixture();
  function restoreSignout() {
    endProductSession.mockReset();
    endProductSession.mockResolvedValue(undefined);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }

  function mountScopedLogout() {
    const draw = (subject: string, generation: number, admitted: boolean) => {
      set24ProfileSubject = subject;
      return (
      <ThemeProvider><LocaleProvider>
        <SettingsModal brandName="Acme" initialTab="account" preview={false}
          readBoundary={{ subject, generation, admitted }} onClose={() => {}} />
      </LocaleProvider></ThemeProvider>
    );
    };
    const mounted = render(draw("logout-owner", 1, true));
    return { ...mounted, change: (subject: string, generation: number, admitted: boolean) =>
      mounted.rerender(draw(subject, generation, admitted)) };
  }

  it("one absolute 10s budget aborts a noncooperative promise and restores explicit retry", async () => {
    let signal: AbortSignal | undefined;
    endProductSession.mockImplementation((_navigate: unknown, currentSignal?: AbortSignal) => {
      signal = currentSignal;
      return new Promise<void>(() => {});
    });
    try {
      renderSettings();
      vi.useFakeTimers();
      fireEvent.click(screen.getByTestId("settings-logout"));
      const { act } = await import("@testing-library/react");
      await act(async () => { await vi.advanceTimersByTimeAsync(9_999); });
      expect(screen.getByTestId("settings-logout")).toBeDisabled();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(signal?.aborted).toBe(false);
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(signal?.aborted).toBe(true);
      expect(screen.getByRole("alert")).toHaveTextContent(/无法确认.*退出|退出.*无法确认/);
      expect(screen.getByTestId("settings-logout")).toBeEnabled();
      expect(endProductSession).toHaveBeenCalledOnce();
    } finally { restoreSignout(); }
  });

  it.each([
    ["subject", "another-owner", 1, true],
    ["generation", "logout-owner", 2, true],
    ["admission", "logout-owner", 1, false],
  ] as const)("%s retirement aborts old operation and ignores late failure", async (_kind, subject, generation, admitted) => {
    let signal: AbortSignal | undefined;
    let rejectOld!: (reason: Error) => void;
    endProductSession.mockImplementation((_navigate: unknown, currentSignal?: AbortSignal) => {
      signal = currentSignal;
      return new Promise<void>((_resolve, reject) => { rejectOld = reject; });
    });
    try {
      const mounted = mountScopedLogout();
      fireEvent.click(screen.getByTestId("settings-logout"));
      expect(endProductSession).toHaveBeenCalledOnce();
      mounted.change(subject, generation, admitted);
      expect(signal?.aborted).toBe(true);
      expect(screen.getByTestId("settings-logout")).toBeEnabled();
      const { act } = await import("@testing-library/react");
      await act(async () => { rejectOld(new Error("late rejection")); });
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByTestId("settings-logout")).toBeEnabled();
      mounted.change("logout-owner", 1, true);
      expect(screen.getByTestId("settings-logout")).toBeEnabled();
      expect(screen.queryByRole("alert")).toBeNull();
    } finally { restoreSignout(); }
  });

  it("actual client suppresses late valid503 issuer navigation after identity retirement", async () => {
    const actual = await vi.importActual<typeof import("@/ui/auth/product-auth-client")>("@/ui/auth/product-auth-client");
    const navigate = vi.fn();
    let finishBody!: (raw: { issuer_end_session_url: string }) => void;
    let requestSignal: AbortSignal | undefined;
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrfToken: "Csrf123" }) })
      .mockImplementationOnce((_input: unknown, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined;
        return Promise.resolve({ ok: false, status: 503,
          json: () => new Promise((resolve) => { finishBody = resolve; }) });
      });
    endProductSession.mockImplementation((_guardedNavigate: unknown, signal?: AbortSignal) => actual.endProductSession(navigate, signal));
    try {
      vi.stubGlobal("fetch", fetcher);
      const mounted = mountScopedLogout();
      fireEvent.click(screen.getByTestId("settings-logout"));
      await waitFor(() => expect(finishBody).toBeTypeOf("function"));
      mounted.change("logout-owner", 2, true);
      expect(requestSignal?.aborted).toBe(true);
      const { act } = await import("@testing-library/react");
      await act(async () => { finishBody({ issuer_end_session_url: "/iam/oauth2/end-session?fixture=valid" }); });
      expect(navigate).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByTestId("settings-logout")).toBeEnabled();
    } finally { restoreSignout(); }
  });

  it("actual503 issuer handoff clears the deadline while leaving success busy", async () => {
    const actual = await vi.importActual<typeof import("@/ui/auth/product-auth-client")>("@/ui/auth/product-auth-client");
    const navigate = vi.fn();
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrfToken: "Csrf123" }) })
      .mockResolvedValueOnce({ ok: false, status: 503,
        json: async () => ({ issuer_end_session_url: "/iam/oauth2/end-session?fixture=valid" }) });
    endProductSession.mockImplementation((_guardedNavigate: unknown, signal?: AbortSignal) => actual.endProductSession(navigate, signal));
    try {
      vi.stubGlobal("fetch", fetcher);
      renderSettings();
      vi.useFakeTimers();
      const { act } = await import("@testing-library/react");
      await act(async () => { fireEvent.click(screen.getByTestId("settings-logout")); });
      expect(navigate).toHaveBeenCalledExactlyOnceWith("/iam/oauth2/end-session?fixture=valid");
      await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByTestId("settings-logout")).toBeDisabled();
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally { restoreSignout(); }
  });


  it("component guarded navigation suppresses an old callback after replacement scope", async () => {
    let oldNavigate!: (url: string) => void;
    let signal: AbortSignal | undefined;
    const navigate = vi.fn();
    const realWindow = window;
    // Private test-local location facade, no change to shared router fixture.
    const locationFacade = {
      assign: navigate,
      pathname: realWindow.location.pathname,
      search: realWindow.location.search,
      href: realWindow.location.href,
    };
    const windowFacade = new Proxy(realWindow, {
      get(target, key) {
        if (key === "location") return locationFacade;
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    endProductSession.mockImplementation((callback: (url: string) => void, currentSignal?: AbortSignal) => {
      oldNavigate = callback;
      signal = currentSignal;
      return new Promise<void>(() => {});
    });
    try {
      vi.stubGlobal("window", windowFacade);
      const mounted = mountScopedLogout();
      fireEvent.click(screen.getByTestId("settings-logout"));
      expect(oldNavigate).toBeTypeOf("function");
      mounted.change("another-owner", 1, true);
      expect(signal?.aborted).toBe(true);
      oldNavigate("/iam/oauth2/end-session?fixture=valid");
      expect(navigate).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByTestId("settings-logout")).toBeEnabled();
    } finally { restoreSignout(); }
  });

  it("preview logout performs zero Product authentication requests", async () => {
    const fetcher = vi.fn();
    try {
      vi.stubGlobal("fetch", fetcher);
      renderSettings(() => {}, undefined, true);
      fireEvent.click(screen.getByTestId("settings-logout"));
      expect(endProductSession).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    } finally { restoreSignout(); }
  });
});
// SET25 private executable draft. No source/test-tree admission or execution.
describe("SET25 existing chat model preference reliability", () => {
  const oldRaw = JSON.stringify({ model: "prior:stable" });
  const catalog = { models: [{ provider: "anthropic", name: "opus", is_default: true }] };
  async function preferenceReader() {
    return (await import("@/ui/settings/chat-prefs")).readChatModel;
  }
  async function chooseOpus() {
    fireEvent.click(await screen.findByTestId("settings-default-model"));
    fireEvent.click(await screen.findByRole("option", { name: "opus" }));
  }
  function modelCatalog(listModels: () => Promise<typeof catalog>) {
    return vi.spyOn(pageClients, "browserListClient").mockReturnValue({ listModels } as ReturnType<typeof pageClients.browserListClient>);
  }
  function failChatWrite() {
    const native = Storage.prototype.setItem;
    let fail = true;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
      if (this === localStorage && key === "kokoro.web.chat-prefs" && fail)
        throw new DOMException("preference unavailable", "QuotaExceededError");
      native.call(this, key, value);
    });
    return { succeed: () => { fail = false; }, restore: () => spy.mockRestore() };
  }

  it("failed model write preserves raw/cache and never claims saved", async () => {
    localStorage.setItem("kokoro.web.chat-prefs", oldRaw);
    const read = await preferenceReader();
    expect(read()).toBe("prior:stable");
    const failure = failChatWrite();
    try {
      renderSettings(() => {}, undefined, false, undefined, "chat");
      await chooseOpus();
      expect(localStorage.getItem("kokoro.web.chat-prefs")).toBe(oldRaw);
      expect(read()).toBe("prior:stable");
      expect(screen.queryByTestId("settings-saved")).toBeNull();
      expect(screen.getByRole("alert")).toHaveTextContent(/未保存/);
      expect(screen.getByRole("alert")).toHaveTextContent("模型偏好未保存；新对话不会采用这次未保存的选择。");
    } finally { failure.restore(); }
  });

  it("explicit persistence retry saves the draft; following-profile null remains a real write", async () => {
    localStorage.setItem("kokoro.web.chat-prefs", oldRaw);
    const read = await preferenceReader();
    read();
    const failure = failChatWrite();
    try {
      renderSettings(() => {}, undefined, false, undefined, "chat");
      await chooseOpus();
      expect(read()).toBe("prior:stable");
      failure.succeed();
      fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "重试保存" }));
      expect(read()).toBe("anthropic:opus");
      expect(JSON.parse(localStorage.getItem("kokoro.web.chat-prefs")!)).toEqual({ model: "anthropic:opus" });
      expect(screen.getByTestId("settings-saved")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("settings-default-model"));
      fireEvent.click(await screen.findByRole("option", { name: "跟随空间缺省" }));
      expect(JSON.parse(localStorage.getItem("kokoro.web.chat-prefs")!)).toEqual({ model: null });
      expect(read()).toBeNull();
    } finally { failure.restore(); }
  });

  it("catalog rejection has an error and explicit read retry unlike true empty catalog", async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error("catalog unavailable")).mockResolvedValueOnce({ models: [] });
    const spy = modelCatalog(request);
    try {
      renderSettings(() => {}, undefined, false, undefined, "chat");
      const alert = (await screen.findByText("模型目录加载失败，请重试。")).closest('[role="alert"]') as HTMLElement;
      expect(alert).toHaveTextContent("模型目录加载失败，请重试。");
      expect(request).toHaveBeenCalledOnce();
      fireEvent.click(within(alert).getByRole("button", { name: "重试加载" }));
      await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
      fireEvent.click(screen.getByTestId("settings-default-model"));
      expect(await screen.findByRole("option", { name: "跟随空间缺省" })).toBeInTheDocument();
      expect(screen.getAllByRole("option")).toHaveLength(1);
      expect(localStorage.getItem("kokoro.web.chat-prefs")).toBeNull();
    } finally { spy.mockRestore(); }
  });

  it("catalog 10s caller timeout retires a noncooperative attempt and old completion cannot replace retry", async () => {
    let finishOld!: (value: typeof catalog) => void;
    const request = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; })).mockResolvedValueOnce({ models: [] });
    const spy = modelCatalog(request);
    try {
      vi.useFakeTimers();
      renderSettings(() => {}, undefined, false, undefined, "chat");
      const { act } = await import("@testing-library/react");
      await act(async () => { await vi.advanceTimersByTimeAsync(9_999); });
      expect(screen.queryByRole("alert")).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "重试加载" }));
      await act(async () => {});
      expect(request).toHaveBeenCalledTimes(2);
      await act(async () => { finishOld(catalog); });
      vi.useRealTimers();
      fireEvent.click(screen.getByTestId("settings-default-model"));
      expect(await screen.findByRole("option", { name: "跟随空间缺省" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "opus" })).toBeNull();
    } finally { vi.useRealTimers(); spy.mockRestore(); }
  });

  it("preview layout retirement rejects the older catalog result without claiming transport abort", async () => {
    let finishOld!: (value: typeof catalog) => void;
    const request = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; })).mockResolvedValueOnce({ models: [] });
    const spy = modelCatalog(request);
    const draw = (preview: boolean) => <ThemeProvider><LocaleProvider><SettingsModal
      initialTab="chat" preview={preview} brandName="Acme" onClose={() => {}} /></LocaleProvider></ThemeProvider>;
    try {
      const mounted = render(draw(false));
      expect(request).toHaveBeenCalledOnce();
      mounted.rerender(draw(true));
      const { act } = await import("@testing-library/react");
      await act(async () => { finishOld(catalog); });
      expect(request).toHaveBeenCalledTimes(2);
      fireEvent.click(screen.getByTestId("settings-default-model"));
      expect(await screen.findByRole("option", { name: "跟随空间缺省" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "opus" })).toBeNull();
      expect(screen.queryByTestId("settings-saved")).toBeNull();
    } finally { spy.mockRestore(); }
  });

  it("unmount retires catalog timer and late failure without touching persisted preference", async () => {
    localStorage.setItem("kokoro.web.chat-prefs", oldRaw);
    let rejectOld!: (error: Error) => void;
    const request = vi.fn().mockImplementation(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
    const spy = modelCatalog(request);
    try {
      vi.useFakeTimers();
      const mounted = renderSettings(() => {}, undefined, false, undefined, "chat");
      mounted.unmount();
      const { act } = await import("@testing-library/react");
      await act(async () => { rejectOld(new Error("late catalog error")); await vi.advanceTimersByTimeAsync(10_000); });
      expect(screen.queryByRole("alert")).toBeNull();
      expect(localStorage.getItem("kokoro.web.chat-prefs")).toBe(oldRaw);
      expect(request).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); spy.mockRestore(); }
  });
});

describe("SET26 actual settings billing/pricing admission props", () => {
  it.each([["credits", false], ["subscription", true]] as const)("real %s branch forwards preview=%s and the existing boundary", async (tab, preview) => {
    const billing = await import("@/ui/billing/billing-panel");
    const pricing = await import("@/ui/billing/pricing-panel");
    const billed = vi.spyOn(billing, "BillingContent").mockImplementation(() => <div>Billing read fixture</div>);
    const priced = vi.spyOn(pricing, "PricingContent").mockImplementation(() => <div>Pricing read fixture</div>);
    try {
      renderSettings(() => {}, undefined, preview, undefined, tab);
      const observed = tab === "credits" ? billed : priced;
      expect(observed.mock.calls.at(-1)?.[0]).toMatchObject({ preview, readBoundary: { admitted: true, subject: "settings-reader", generation: 1 } });
    } finally { billed.mockRestore(); priced.mockRestore(); }
  });
});
