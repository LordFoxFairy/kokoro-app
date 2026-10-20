// 设置中心模态（WEB-FACE 面三）：v1 设置导航、tab 切换单显、对话偏好就地存 localStorage，
// 关闭出口(× / Esc / 背幕点击)均触发 onClose。会话态由 shell 保证,模态本身不再自持匿名闸。
// page-clients 均注入 mock（不打网络）。
import {
  act,
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
import { ConnectorCommandProvider } from "@/ui/mcp/connector-command-context";

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
      models: [{ provider: "anthropic", name: "opus", is_default: true, display_name: "opus", model_id: "11111111-1111-4111-8111-111111111111", revision_id: "22222222-2222-4222-8222-222222222222", provider_id: "33333333-3333-4333-8333-333333333333", feature_key: "chat", request_model: "opus" }], next_cursor: null,
    }),
  }),
  // account/appearance/chat tab 不调用下列客户端；仅需存在 export 供模块 import。
  browserHubClient: () => ({
    createCustomApi: registerCustomApi,
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
        { availability: "available" as const,
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
  "mail",
  "email",
  "phone",
  "wallet",
  "integration",
  "developer",
  "team",
];

let restoreConnectorOwnerClient: (() => void) | undefined;

function renderSettings(
  onClose: () => void = () => {},
  onTabChange?: (tab: SettingsTab) => void,
  preview = false,
  _onStartDeployment?: (kind: "website" | "app") => void,
  initialTab: SettingsTab = "account",
  onCreateSkillWithAi?: () => void,
  connectorOwner = false,
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
  const client = connectorOwner ? pageClients.browserHubClient({ preview }) : null;
  if (client !== null) {
    const ownerClient = vi.spyOn(pageClients, "browserHubClient").mockReturnValue(client);
    restoreConnectorOwnerClient = () => ownerClient.mockRestore();
  }
  const settings = <ThemeProvider><LocaleProvider><SettingsModal {...props} /></LocaleProvider></ThemeProvider>;
  return render(client === null ? settings : <ConnectorCommandProvider client={client} boundary={preview ? { admitted: true, subject: "preview", generation: 0 } : props.readBoundary!}>{settings}</ConnectorCommandProvider>);
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
  restoreConnectorOwnerClient?.();
  restoreConnectorOwnerClient = undefined;
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

  it("设置导航遵循 Manus 的分组顺序，并将电脑保留为置灰分区", () => {
    renderSettings();

    expect(screen.getByTestId("settings-tab-team")).toBeInTheDocument();
    for (const id of ["computer"]) {
      expect(screen.getByTestId(`settings-placeholder-${id}`)).toHaveAttribute("aria-disabled", "true");
    }
    expect(screen.queryByTestId("settings-tab-deployment")).toBeNull();
    expect(screen.getByTestId("settings-tab-integration")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-tab-library")).toBeNull();
    expect(screen.getByTestId("settings-tab-developer")).toBeInTheDocument();
  });

  it("SET21 Data is selectable and exposes same-page sections with unavailable final management actions", () => {
    renderSettings();
    const tab = screen.getByTestId("settings-tab-data-management");
    expect(tab).not.toBeDisabled();
    fireEvent.keyDown(tab, { key: "Enter" });
    expect(screen.getByRole("heading", { name: "数据管理", level: 1 })).toBeInTheDocument();
    for (const name of ["已分享任务", "已分享文件", "已归档任务", "授权应用", "云浏览器数据", "已购买域名"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("tablist")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^管理/ })).toHaveLength(4);
    for (const button of screen.getAllByRole("button", { name: /^管理/ })) expect(button).toBeEnabled();
  });

  it("SET22 Help is selectable and provides this product help without a fake support submission", () => {
    renderSettings();
    const tab = screen.getByTestId("settings-tab-help");
    expect(tab).not.toBeDisabled();
    fireEvent.keyDown(tab, { key: "Enter" });
    expect(screen.getByRole("heading", { name: "获取帮助", level: 1 })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "帮助分类" })).getByRole("button", { name: "账户与设备" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存姓名" }));
    expect(screen.getByText("在账户设置中修改姓名、查看登录设备并退出其他会话。")).toBeVisible();
    fireEvent.click(within(screen.getByRole("region", { name: "保存姓名" })).getByRole("button", { name: "账户" }));
    expect(screen.getByRole("heading", { name: "账户", level: 1 })).toBeInTheDocument();
    fireEvent.keyDown(tab, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "创建与停止任务分享" }));
    expect(screen.getByText(/通过任务分享按钮/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /发送|提交反馈|联系客服/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Manus/ })).toBeNull();
    fireEvent.click(within(screen.getByRole("region", { name: "创建与停止任务分享" })).getByRole("button", { name: "数据管理" }));
    expect(screen.getByRole("heading", { name: "数据管理", level: 1 })).toBeInTheDocument();
  });

  it("关闭 GitHub 导入子弹窗时保留设置中心", async () => {
    renderSettings(() => {}, undefined, true, undefined, "skills");
    await screen.findByText("YouTube 影片研究");

    fireEvent.pointerDown(screen.getByRole("button", { name: "添加" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "从 GitHub 导入技能" }),
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
    expect(screen.getByTestId("settings-task-delivery")).toBeEnabled();
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
    expect(screen.getByTestId("settings-task-delivery")).toBeEnabled();
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
    expect(screen.getByRole("tab", { name: "知识" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "导入记忆" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "导入" })).toBeEnabled();
    expect(screen.getByText("知识与记忆导入暂未接通。")).toBeInTheDocument();
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
      window.localStorage.getItem("kokoro.web.chat-prefs.v2") ?? "{}",
    );
    expect(prefs.model).toBe("opus");
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
    fireEvent.click(screen.getByRole("button", { name: "管理登录方式" }));
    expect(screen.getByTestId("settings-login-methods")).toBeInTheDocument();
    const nestedHeading = screen.getByRole("heading", {
      name: "管理登录方式",
      level: 1,
    });
    expect(nestedHeading).toHaveFocus();
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
    fireEvent.click(screen.getByRole("button", { name: "返回账户" }));
    expect(screen.getByTestId("settings-account")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "管理登录方式" })).toHaveFocus();
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
    fireEvent.click(screen.getByRole("menuitem", { name: "使用 Acme 创建技能" }));

    expect(onCreateSkillWithAi).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText("上传一个 zip：根目录下每个文件夹是一个技能。"),
    ).toBeNull();
  });

  it("自定义 API 未知结果保留原表单和弹窗且不自动重发", async () => {
    registerCustomApi.mockRejectedValueOnce(new Error("fixture rejection"));
    renderSettings(() => {}, undefined, true, undefined, "account", undefined, true);
    fireEvent.keyDown(screen.getByTestId("settings-tab-mcp"), { key: "Enter" });
    fireEvent.click(await screen.findByRole("button", { name: "浏览连接器" }));
    const catalog = await screen.findByRole("dialog", { name: "连接器" });
    fireEvent.keyDown(within(catalog).getByRole("button", { name: "创建" }), {
      key: "Enter",
    });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "自定义 API" }),
    );

    const heading = await screen.findByRole("heading", { name: "添加自定义 API" });
    const dialog = heading.closest('[data-slot="dialog-content"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    const name = within(dialog).getByRole("textbox", { name: /^名称$/ });
    const secretName = within(dialog).getByRole("textbox", {
      name: "密钥名称",
    });
    const secretValue = within(dialog).getByRole("textbox", { name: /^值$/ });
    fireEvent.change(name, { target: { value: "CRM API" } });
    fireEvent.change(secretName, { target: { value: "CRM_TOKEN" } });
    fireEvent.change(secretValue, { target: { value: "WRITE_ONLY" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "CRM API — 添加结果尚未确认。重试会恢复原请求，不会重新创建。",
    );
    expect(
      dialog,
    ).toBeInTheDocument();
    expect(registerCustomApi).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("settings-modal")).toBeInTheDocument();
    expect(name).toHaveValue("CRM API");
    expect(secretName).toHaveValue("CRM_TOKEN");
    expect(secretValue).toHaveValue("WRITE_ONLY");
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
    expect(screen.getByTestId("settings-more")).toHaveAttribute("aria-expanded", "false");
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
            models: [{ provider: "anthropic", name: "opus", is_default: true, display_name: "opus", model_id: "11111111-1111-4111-8111-111111111111", revision_id: "22222222-2222-4222-8222-222222222222", provider_id: "33333333-3333-4333-8333-333333333333", feature_key: "chat", request_model: "opus" }], next_cursor: null,
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
          window.localStorage.getItem("kokoro.web.chat-prefs.v2") ?? "null",
        ),
      ).toEqual({ model: "opus" });
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
        "kokoro.web.chat-prefs.v2",
        JSON.stringify({ model: "opus", agent }),
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
          window.localStorage.getItem("kokoro.web.chat-prefs.v2") ?? "null",
        ),
      ).toEqual({ model: "opus" });
    },
  );

  it("新的 model-only 偏好正常保存并在重新挂载后读回精确 shape", async () => {
    window.localStorage.setItem(
      "kokoro.web.chat-prefs.v2",
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
        window.localStorage.getItem("kokoro.web.chat-prefs.v2") ?? "null",
      ),
    ).toEqual({ model: "opus" });
    first.unmount();

    renderSettings(() => {}, undefined, false, undefined, "chat");
    await waitFor(() =>
      expect(screen.getByTestId("settings-default-model")).toHaveTextContent(
        "opus",
      ),
    );
    expect(
      JSON.parse(
        window.localStorage.getItem("kokoro.web.chat-prefs.v2") ?? "null",
      ),
    ).toEqual({ model: "opus" });
  });
});

it("R255 正式设置嵌入 MCP 投影使用 Manus 的已添加连接器工具栏", async () => {
  try {
    renderSettings(() => {}, undefined, false, undefined, "mcp", undefined, true);
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
      hash: realWindow.location.hash,
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
  const catalog = { models: [{ provider: "anthropic", name: "opus", is_default: true, display_name: "opus", model_id: "11111111-1111-4111-8111-111111111111", revision_id: "22222222-2222-4222-8222-222222222222", provider_id: "33333333-3333-4333-8333-333333333333", feature_key: "chat", request_model: "opus" }], next_cursor: null };
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
      if (this === localStorage && key === "kokoro.web.chat-prefs.v2" && fail)
        throw new DOMException("preference unavailable", "QuotaExceededError");
      native.call(this, key, value);
    });
    return { succeed: () => { fail = false; }, restore: () => spy.mockRestore() };
  }

  it("failed model write preserves raw/cache and never claims saved", async () => {
    localStorage.setItem("kokoro.web.chat-prefs.v2", oldRaw);
    const read = await preferenceReader();
    expect(read()).toBe("prior:stable");
    const failure = failChatWrite();
    try {
      renderSettings(() => {}, undefined, false, undefined, "chat");
      await chooseOpus();
      expect(localStorage.getItem("kokoro.web.chat-prefs.v2")).toBe(oldRaw);
      expect(read()).toBe("prior:stable");
      expect(screen.queryByTestId("settings-saved")).toBeNull();
      expect(screen.getByRole("alert")).toHaveTextContent(/未保存/);
      expect(screen.getByRole("alert")).toHaveTextContent("模型偏好未保存；新对话不会采用这次未保存的选择。");
    } finally { failure.restore(); }
  });

  it("explicit persistence retry saves the draft; following-profile null remains a real write", async () => {
    localStorage.setItem("kokoro.web.chat-prefs.v2", oldRaw);
    const read = await preferenceReader();
    read();
    const failure = failChatWrite();
    try {
      renderSettings(() => {}, undefined, false, undefined, "chat");
      await chooseOpus();
      expect(read()).toBe("prior:stable");
      failure.succeed();
      fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "重试保存" }));
      expect(read()).toBe("opus");
      expect(JSON.parse(localStorage.getItem("kokoro.web.chat-prefs.v2")!)).toEqual({ model: "opus" });
      expect(screen.getByTestId("settings-saved")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("settings-default-model"));
      fireEvent.click(await screen.findByRole("option", { name: "跟随空间缺省" }));
      expect(JSON.parse(localStorage.getItem("kokoro.web.chat-prefs.v2")!)).toEqual({ model: null });
      expect(read()).toBeNull();
    } finally { failure.restore(); }
  });

  it("catalog rejection has an error and explicit read retry unlike true empty catalog", async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error("catalog unavailable")).mockResolvedValueOnce({ models: [], next_cursor: null });
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
      expect(localStorage.getItem("kokoro.web.chat-prefs.v2")).toBeNull();
    } finally { spy.mockRestore(); }
  });

  it("catalog 10s caller timeout retires a noncooperative attempt and old completion cannot replace retry", async () => {
    let finishOld!: (value: typeof catalog) => void;
    const request = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; })).mockResolvedValueOnce({ models: [], next_cursor: null });
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
    const request = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; })).mockResolvedValueOnce({ models: [], next_cursor: null });
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
    localStorage.setItem("kokoro.web.chat-prefs.v2", oldRaw);
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
      expect(localStorage.getItem("kokoro.web.chat-prefs.v2")).toBe(oldRaw);
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

// SET40-BEGIN: concrete-setting-search
import { useLocale as useSet40Locale } from "@/i18n/context";

describe("SET40 concrete settings search", () => {
  function searchFor(value: string) {
    const input = screen.getByRole("textbox", { name: "搜索" });
    expect(screen.getAllByRole("textbox", { name: "搜索" })).toHaveLength(1);
    fireEvent.change(input, { target: { value } });
    return input;
  }
  const navigation = () => screen.getByRole("navigation", { name: "设置" });

  it("SET40 a field returns its parent and matching child, selecting preserves query and result focus", () => {
    const onTabChange = vi.fn();
    renderSettings(() => {}, onTabChange, true);
    const input = searchFor("昵称");
    expect(within(navigation()).getByRole("button", { name: "个性化" })).toBeVisible();
    const child = within(navigation()).getByRole("button", { name: "昵称" });
    expect(within(navigation()).queryByRole("button", { name: "职业" })).toBeNull();
    child.focus();
    fireEvent.click(child);
    expect(onTabChange).toHaveBeenCalledWith("personalization");
    expect(screen.getByRole("heading", { name: "个性化", level: 1 })).toBeVisible();
    expect(input).toHaveValue("昵称");
    expect(child).toHaveFocus();
  });

  it("SET40 notification search finds the actual general setting without changing its value", () => {
    renderSettings(() => {}, undefined, true);
    const stored = localStorage.getItem("kokoro.web.communication-prefs");
    searchFor("通知");
    expect(within(navigation()).getByRole("button", { name: "通用" })).toBeVisible();
    const result = within(navigation()).getByRole("button", { name: "浏览器通知" });
    fireEvent.click(result);
    expect(screen.getByRole("heading", { name: "通用", level: 1 })).toBeVisible();
    expect(localStorage.getItem("kokoro.web.communication-prefs")).toBe(stored);
  });

  it.each([
    ["积分历史", "用量与计费"],
    ["成员", "团队"],
    ["团队邀请", "团队"],
  ])("SET40 static section %s is discoverable under %s without loading its dynamic contents", (child, parent) => {
    renderSettings();
    searchFor(child);
    expect(within(navigation()).getByRole("button", { name: parent })).toBeVisible();
    expect(within(navigation()).getByRole("button", { name: child })).toBeVisible();
    expect(screen.getByRole("heading", { name: "账户", level: 1 })).toBeVisible();
  });

  it("SET40 a menu-name-only match does not add unrelated children or the selected account", () => {
    renderSettings();
    searchFor("个性化");
    expect(within(navigation()).getByRole("button", { name: "个性化" })).toBeVisible();
    expect(within(navigation()).queryByRole("button", { name: "昵称" })).toBeNull();
    expect(within(navigation()).queryByRole("button", { name: "账户" })).toBeNull();
  });

  it("SET40 multiple matches retain both real children under the same parent", () => {
    renderSettings();
    searchFor("任务");
    expect(within(navigation()).getAllByRole("button", { name: "数据管理" })).toHaveLength(1);
    expect(within(navigation()).getByRole("button", { name: "已分享任务" })).toBeVisible();
    expect(within(navigation()).getByRole("button", { name: "已归档任务" })).toBeVisible();
  });

  it("SET40 no result keeps the current panel; clear restores navigation and focuses the only input", () => {
    renderSettings();
    const input = searchFor("no-setting-matches-4071");
    expect(within(navigation()).getByRole("status")).toHaveTextContent("未找到结果");
    expect(screen.getByRole("heading", { name: "账户", level: 1 })).toBeVisible();
    fireEvent.click(within(navigation()).getByRole("button", { name: "清除搜索" }));
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    for (const tab of NAV_TAB_KEYS) expect(screen.getByTestId(`settings-tab-${tab}`)).toBeInTheDocument();
    expect(within(navigation()).queryByRole("status")).toBeNull();
  });

  it.each(["[", "<script>", "\"'"])("SET40 unsafe-looking %s is a literal query with no injected element", (query) => {
    renderSettings();
    const before = document.querySelectorAll("script").length;
    const input = searchFor(query);
    expect(input).toHaveValue(query);
    expect(within(navigation()).getByRole("status")).toHaveTextContent("未找到结果");
    expect(document.querySelectorAll("script")).toHaveLength(before);
    expect(screen.getByRole("heading", { name: "账户", level: 1 })).toBeVisible();
  });

  it("SET40 a disabled menu match remains unavailable and cannot change the selected panel", () => {
    const onTabChange = vi.fn();
    renderSettings(() => {}, onTabChange);
    searchFor("电脑");
    const matches = within(navigation()).getAllByText("电脑", { exact: true });
    for (const match of matches) {
      expect(match.closest('[aria-disabled="true"]')).not.toBeNull();
      fireEvent.click(match);
      fireEvent.keyDown(match, { key: "Enter" });
    }
    expect(onTabChange).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "账户", level: 1 })).toBeVisible();
  });

  it("SET40 indexes current-locale labels and updates a retained query when the locale changes", async () => {
    function LocaleControl() {
      const { setLocale } = useSet40Locale();
      return <button onClick={() => setLocale("en")}>SET40 switch English</button>;
    }
    render(<ThemeProvider><LocaleProvider><LocaleControl /><SettingsModal preview initialTab="appearance" onClose={() => {}} /></LocaleProvider></ThemeProvider>);
    const input = searchFor("nIcKnAmE");
    expect(within(navigation()).getByRole("status")).toHaveTextContent("未找到结果");
    fireEvent.click(screen.getByText("SET40 switch English", { exact: true }));
    const englishNavigation = await screen.findByRole("navigation", { name: "Settings" });
    expect(within(englishNavigation).getByRole("button", { name: "Personalization" })).toBeVisible();
    expect(within(englishNavigation).getByRole("button", { name: "Nickname" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Search" })).toBe(input);
    expect(input).toHaveValue("nIcKnAmE");
  });

  it.each(["技能", "连接器"])("SET40 %s retains title search without catalog child indexing", (title) => {
    renderSettings();
    searchFor(title);
    const results = within(navigation()).getAllByRole("button").filter((button) => button.textContent === title);
    expect(results).toHaveLength(1);
    expect(results[0]).toHaveTextContent(title);
    expect(within(navigation()).queryByRole("button", { name: "我的技能" })).toBeNull();
    expect(within(navigation()).queryByRole("button", { name: "Google Drive" })).toBeNull();
  });

  it.each(["Acme", "Alex", "Opus", "验证身份"])("SET40 does not index dynamic values, placeholders or hidden flows: %s", (query) => {
    renderSettings();
    searchFor(query);
    expect(within(navigation()).getByRole("status")).toHaveTextContent("未找到结果");
    expect(screen.queryByTestId("settings-tab-chat")).toBeNull();
  });
});
// SET40-END: concrete-setting-search

// SET53-BEGIN: service-settings-pages
describe("SET53 service settings stay honest about unavailable owner services", () => {
  it.each([
    ["mail", "Mail Kokoro"],
    ["email", "邮箱"],
    ["phone", "电话"],
    ["wallet", "钱包"],
    ["integration", "集成"],
    ["developer", "开发者"],
  ] as const)("opens %s from a normalized deep link without service IO or actionable fake assets", async (tab, title) => {
    const fetcher = vi.fn().mockRejectedValue(new Error("unexpected service request"));
    vi.stubGlobal("fetch", fetcher);
    expect(normalizeSettingsTab(tab)).toBe(tab);
    renderSettings(() => {}, undefined, false, undefined, tab);
    expect(screen.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    const page = screen.getByTestId(`settings-service-${tab}`);
    expect(page).toHaveTextContent("尚未接通");
    const actions = within(page).getAllByRole("button");
    expect(actions.length).toBeGreaterThan(0);
    for (const originalAction of actions) {
      const action = tab === "integration" ? screen.getByRole("button", { name: originalAction.getAttribute("aria-label")! }) : originalAction;
      if (action.hasAttribute("disabled")) {
        expect(action).toBeDisabled();
        const reason = document.getElementById(action.getAttribute("aria-describedby") ?? "");
        expect(reason).not.toBeNull();
        expect(reason).toBeVisible();
        expect(reason?.textContent).toMatch(/尚未接通|暂未提供/u);
        fireEvent.click(action);
      } else {
        const inlineSender = action.getAttribute("aria-label") === "添加授权发件人";
        const integrationPage = tab === "integration";
        if (inlineSender) expect(action).toHaveAttribute("aria-expanded", "false");
        else if (!integrationPage) expect(action).toHaveAttribute("aria-haspopup", "dialog");
        fireEvent.click(action);
        const dialog = integrationPage ? page : inlineSender ? screen.getByRole("form", { name: "添加授权发件人" }) : screen.getAllByRole("dialog").at(-1)!;
        expect(dialog).toHaveTextContent("尚未接通");
        for (const finalAction of within(dialog).queryAllByRole("button").filter((button) => button.hasAttribute("disabled"))) {
          expect(finalAction).toHaveAccessibleDescription(/尚未接通/);
        }
        fireEvent.click(within(dialog).getByRole("button", { name: integrationPage ? "返回集成" : "取消" }));
        if (integrationPage) expect(screen.getByRole("button", { name: action.getAttribute("aria-label")! })).toHaveFocus();
      }
    }
    expect(page.querySelector("a, input, textarea")).toBeNull();
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps Mail and developer sub-tabs local and restores their initial view after leaving", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("unexpected service request"));
    vi.stubGlobal("fetch", fetcher);
    renderSettings(() => {}, undefined, false, undefined, "mail");
    fireEvent.keyDown(screen.getByRole("tab", { name: "收件箱" }), { key: "Enter" });
    expect(screen.getByRole("button", { name: "刷新收件箱" })).toBeDisabled();
    expect(screen.getByText("收件箱服务尚未接通，暂时无法读取邮件。")).toBeVisible();
    fireEvent.keyDown(screen.getByTestId("settings-tab-developer"), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("tab", { name: "Webhooks" }), { key: "Enter" });
    expect(screen.getByRole("button", { name: "创建 Webhook" })).toBeEnabled();
    fireEvent.keyDown(screen.getByTestId("settings-tab-mail"), { key: "Enter" });
    expect(screen.getByRole("tab", { name: "设置" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByTestId("settings-tab-developer"), { key: "Enter" });
    expect(screen.getByRole("tab", { name: "API 密钥" })).toHaveAttribute("aria-selected", "true");
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("finds visible service fields and selects the destination while computer stays unavailable", () => {
    const onTabChange = vi.fn();
    renderSettings(() => {}, onTabChange, true, undefined, "mail");
    const search = screen.getByRole("textbox", { name: "搜索" });
    fireEvent.change(search, { target: { value: "支付方式" } });
    const result = within(screen.getByRole("navigation", { name: "设置" })).getByRole("button", { name: "支付方式" });
    fireEvent.click(result);
    expect(onTabChange).toHaveBeenLastCalledWith("wallet");
    expect(screen.getByRole("heading", { name: "钱包", level: 1 })).toBeVisible();
    expect(search).toHaveValue("支付方式");
    expect(screen.getByRole("button", { name: "添加" })).toBeEnabled();
    expect(screen.getByTestId("settings-placeholder-computer")).toHaveAttribute("aria-disabled", "true");
  });
});
// SET53-END: service-settings-pages

// SET54-BEGIN: compact-more-keyboard
describe("SET54 compact More owns native keyboard activation and dismissal", () => {
  it("opens on a native keyboard click, focuses the first enabled item and toggles closed", () => {
    const onClose = vi.fn();
    renderSettings(onClose, undefined, true, undefined, "mail");
    const trigger = screen.getByTestId("settings-more");
    trigger.focus();
    // jsdom does not synthesize the browser's Enter/Space click default action.
    // Real key events are covered in the appended browser journey.
    fireEvent.click(trigger, { detail: 0 });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("settings-more-skills")).toHaveFocus();
    trigger.focus();
    fireEvent.click(trigger, { detail: 0 });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("opens with arrows, cycles enabled items, skips computer and isolates Escape from the parent dialog", async () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    renderSettings(onClose, onSelect, true, undefined, "mail");
    const trigger = screen.getByTestId("settings-more");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const first = screen.getByTestId("settings-more-skills");
    const last = screen.getByTestId("settings-more-help");
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "End" });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "ArrowDown" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Home" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(screen.getByTestId("settings-more-mail")).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(screen.getByTestId("settings-more-email")).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(screen.getByTestId("settings-more-mail")).toHaveFocus();
    fireEvent.click(screen.getByTestId("settings-more-computer"));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("settings-modal")).toBeVisible();
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    expect(screen.getByTestId("settings-more-help")).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(trigger).toHaveFocus();
    fireEvent.keyDown(trigger, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("keeps one pointer gesture to one toggle and restores trigger focus after selecting", () => {
    const onSelect = vi.fn();
    renderSettings(() => {}, onSelect, true, undefined, "mail");
    const trigger = screen.getByTestId("settings-more");
    fireEvent.pointerDown(trigger, { button: 0 });
    fireEvent.click(trigger, { detail: 1 });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.pointerDown(trigger, { button: 0 });
    fireEvent.click(trigger, { detail: 1 });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(trigger, { detail: 0 });
    const email = screen.getByTestId("settings-more-email");
    email.focus();
    fireEvent.click(email, { detail: 0 });
    expect(onSelect).toHaveBeenLastCalledWith("email");
    expect(screen.getByRole("heading", { name: "邮箱", level: 1 })).toBeVisible();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("does not steal outside focus or consume Escape from a nested dialog", async () => {
    const { Dialog, DialogContent, DialogDescription, DialogTitle } =
      await import("@/components/ui/dialog");
    const { SettingsCompactMoreMenu } =
      await import("@/ui/settings/settings-compact-more-menu");
    const onParentChange = vi.fn();
    function NestedDialogFixture() {
      const [nestedOpen, setNestedOpen] = useState(false);
      return (
        <Dialog open onOpenChange={onParentChange}>
          <DialogContent data-testid="settings-modal">
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>Parent settings dialog</DialogDescription>
            <SettingsCompactMoreMenu
              label="More"
              items={[{ id: "email", label: "Email", tab: "email" }]}
              onSelectTab={() => {}}
              triggerClassName=""
              menuClassName=""
              itemClassName=""
            />
            <button type="button" onClick={() => setNestedOpen(true)}>
              Open nested dialog
            </button>
            <input aria-label="Search" />
            <Dialog open={nestedOpen} onOpenChange={setNestedOpen}>
              <DialogContent data-testid="nested-dialog">
                <DialogTitle>Nested dialog</DialogTitle>
                <DialogDescription>Independent dialog scope</DialogDescription>
                <button type="button">Nested action</button>
              </DialogContent>
            </Dialog>
          </DialogContent>
        </Dialog>
      );
    }
    render(<ThemeProvider><NestedDialogFixture /></ThemeProvider>);
    const trigger = screen.getByTestId("settings-more");
    fireEvent.click(trigger, { detail: 0 });
    expect(screen.getByRole("menu")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open nested dialog" }));
    const nestedAction = screen.getByRole("button", { name: "Nested action" });
    nestedAction.focus();
    fireEvent.keyDown(nestedAction, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("nested-dialog")).toBeNull());
    expect(onParentChange).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeVisible();
    const search = screen.getByRole("textbox", { name: "Search" });
    search.focus();
    fireEvent.pointerDown(search, { button: 0 });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(search).toHaveFocus();
  });

  it("retires its Escape listener on unmount", () => {
    const view = renderSettings(() => {}, undefined, true, undefined, "mail");
    fireEvent.click(screen.getByTestId("settings-more"), { detail: 0 });
    expect(screen.getByRole("menu")).toBeVisible();
    view.unmount();
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    window.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);
  });
});
// SET54-END: compact-more-keyboard

// SET59: local forms remain inspectable without inventing owner reads or writes.
describe("SET59 personalization interior drafts", () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  afterEach(() => {
    if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
  });

  it("discards a knowledge draft on close and tab changes, with nested Escape preserving Settings and trigger focus", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const onClose = vi.fn();
    renderSettings(onClose, undefined, true, undefined, "personalization");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "知识" }), { button: 0, ctrlKey: false });
    expect(screen.getByRole("textbox", { name: "搜索知识" })).toBeDisabled();
    expect(screen.queryByText("尚无知识")).not.toBeInTheDocument();
    const add = screen.getByRole("button", { name: "新增" });
    fireEvent.click(add);
    let dialog = screen.getByRole("dialog", { name: "添加知识" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "名称" }), { target: { value: "private draft" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "使用时机" }), { target: { value: "only locally" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "内容" }), { target: { value: "临时内容" } });
    expect(within(dialog).getByText("4/2000")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "保存" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "保存" })).toHaveAccessibleDescription(/暂未接通/);
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(add).toHaveFocus());
    fireEvent.click(add);
    dialog = screen.getByRole("dialog", { name: "添加知识" });
    for (const name of ["名称", "使用时机", "内容"]) expect(within(dialog).getByRole("textbox", { name })).toHaveValue("");
    expect(within(dialog).getByText("0/2000")).toBeInTheDocument();
    fireEvent.keyDown(within(dialog).getByRole("textbox", { name: "名称" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "添加知识" })).not.toBeInTheDocument());
    expect(screen.getByTestId("settings-modal")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(add).toHaveFocus());
    fireEvent.mouseDown(screen.getByRole("tab", { name: "个人资料" }), { button: 0, ctrlKey: false });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "知识" }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole("button", { name: "新增" }));
    expect(within(screen.getByRole("dialog", { name: "添加知识" })).getByRole("textbox", { name: "名称" })).toHaveValue("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports clipboard rejection without copied feedback and both import entries reopen an empty local draft", async () => {
    const copy = vi.fn().mockRejectedValue(new Error("permission denied"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    renderSettings(() => {}, undefined, true, undefined, "personalization");
    fireEvent.click(screen.getByRole("button", { name: "导入" }));
    let dialog = screen.getByRole("dialog", { name: "导入记忆" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "粘贴回应内容" }), { target: { value: "private memory draft" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "复制此提示词" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("复制失败");
    expect(within(dialog).queryByText("已复制", { exact: true })).not.toBeInTheDocument();
    expect(copy).toHaveBeenCalledTimes(1);
    expect(copy.mock.calls[0]?.[0]).not.toContain("private memory draft");
    expect(within(dialog).getByRole("button", { name: "导入" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "导入" })).toHaveAccessibleDescription(/暂未接通/);
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    fireEvent.click(screen.getByRole("button", { name: "导入记忆" }));
    dialog = screen.getByRole("dialog", { name: "导入记忆" });
    expect(within(dialog).getByRole("textbox", { name: "粘贴回应内容" })).toHaveValue("");
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.keyDown(within(dialog).getByRole("textbox", { name: "粘贴回应内容" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "导入记忆" })).not.toBeInTheDocument());
    expect(screen.getByTestId("settings-modal")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["subject", "generation", "preview"] as const)("retires pasted data and a late clipboard completion when %s changes", async (change) => {
    let finish!: () => void;
    const copy = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    const draw = (next: boolean) => <ThemeProvider><LocaleProvider><SettingsModal
      onClose={() => {}} initialTab="personalization" preview={change === "preview" ? !next : true}
      readBoundary={{ admitted: true, subject: next && change === "subject" ? "owner-B" : "owner-A", generation: next && change === "generation" ? 2 : 1 }}
    /></LocaleProvider></ThemeProvider>;
    const view = render(draw(false));
    fireEvent.click(screen.getByRole("button", { name: "导入记忆" }));
    const dialog = screen.getByRole("dialog", { name: "导入记忆" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "粘贴回应内容" }), { target: { value: "old identity memory" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "复制此提示词" }));
    expect(copy).toHaveBeenCalledTimes(1);
    expect(within(dialog).queryByText("已复制", { exact: true })).not.toBeInTheDocument();
    view.rerender(draw(true));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "导入记忆" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "导入记忆" }));
    const reopened = screen.getByRole("dialog", { name: "导入记忆" });
    expect(within(reopened).getByRole("textbox", { name: "粘贴回应内容" })).toHaveValue("");
    await act(async () => { finish(); });
    expect(within(reopened).queryByText("已复制", { exact: true })).not.toBeInTheDocument();
  });
});

// Service preflight forms contain only disposable local drafts.
describe("service creation previews", () => {
  it.each([
    ["phone", "立即创建", "为您的座席分配一个虚拟电话"],
    ["wallet", "添加", "添加支付方式"],
  ] as const)("opens %s guidance without allocating an asset or requesting payment", async (tab, trigger, title) => {
    const fetcher = vi.fn().mockRejectedValue(new Error("unexpected service IO"));
    vi.stubGlobal("fetch", fetcher);
    const onClose = vi.fn();
    renderSettings(onClose, undefined, true, undefined, tab);
    fireEvent.click(screen.getByRole("button", { name: trigger }));
    const dialog = screen.getByRole("dialog", { name: title });
    expect(within(dialog).getByRole("button", { name: "继续" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "继续" })).toHaveAccessibleDescription(/尚未接通/);
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument());
    expect(screen.getByTestId("settings-modal")).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["email", "创建新项", "创建邮箱", "地址前缀", "保存"],
    ["developer", "创建 API 密钥", "创建 API 密钥", "为您的密钥命名", "创建"],
    ["developer", "创建 Webhook", "创建 Webhook", "URL", "保存"],
    ["mail", "添加工作流邮箱", "添加工作流邮箱", "邮箱后缀", "创建"],
    ["mail", "添加授权发件人", "添加授权发件人", "发件人邮箱", "保存"],
  ] as const)("keeps %s / %s editable but unsubmitted and clears it when reopened", async (tab, trigger, title, label, action) => {
    const fetcher = vi.fn().mockRejectedValue(new Error("unexpected service IO"));
    vi.stubGlobal("fetch", fetcher);
    renderSettings(() => {}, undefined, true, undefined, tab);
    if (trigger === "创建 Webhook") fireEvent.keyDown(screen.getByRole("tab", { name: "Webhooks" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: trigger }));
    let dialog = screen.getByRole(trigger === "添加授权发件人" ? "form" : "dialog", { name: title });
    const input = within(dialog).getByRole("textbox", { name: label });
    fireEvent.change(input, { target: { value: "private local draft" } });
    expect(input).toHaveValue("private local draft");
    if (trigger === "创建 API 密钥") {
      const expiry = within(dialog).getByRole("combobox", { name: "到期时间" });
      expect(expiry.tagName).toBe("BUTTON");
      fireEvent.keyDown(expiry, { key: "ArrowDown" });
      await screen.findByRole("option", { name: "24 小时" });
      expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["从不", "1 小时", "24 小时", "7 天", "180 天", "360 天"]);
      fireEvent.click(screen.getByRole("option", { name: "24 小时" }));
      expect(expiry).toHaveTextContent("24 小时");
    }
    if (trigger === "添加工作流邮箱") {
      fireEvent.change(within(dialog).getByRole("textbox", { name: "处理指令" }), { target: { value: "private workflow instructions" } });
    }
    if (tab === "email" || trigger === "添加工作流邮箱") {
      expect(dialog).toHaveTextContent("域名尚未配置");
      expect(dialog.textContent).not.toContain("manus.bot");
    }
    expect(within(dialog).getByRole("button", { name: action })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: action })).toHaveAccessibleDescription(/尚未接通/);
    fireEvent.submit(input.closest("form")!);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    fireEvent.click(screen.getByRole("button", { name: trigger }));
    dialog = screen.getByRole(trigger === "添加授权发件人" ? "form" : "dialog", { name: title });
    expect(within(dialog).getByRole("textbox", { name: label })).toHaveValue("");
    if (trigger === "创建 API 密钥") expect(within(dialog).getByRole("combobox")).toHaveTextContent("从不");
    if (trigger === "添加工作流邮箱") expect(within(dialog).getByRole("textbox", { name: "处理指令" })).toHaveValue("");
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("retires a credential draft when its developer tab is left", () => {
    renderSettings(() => {}, undefined, true, undefined, "developer");
    fireEvent.click(screen.getByRole("button", { name: "创建 API 密钥" }));
    const dialog = screen.getByRole("dialog", { name: "创建 API 密钥" });
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "private draft" } });
    // Programmatic tab changes model owner navigation even while a modal is open.
    fireEvent.keyDown(screen.getByRole("tab", { name: "Webhooks", hidden: true }), { key: "Enter" });
    expect(screen.queryByRole("dialog", { name: "创建 API 密钥" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tab", { name: "API 密钥" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "创建 API 密钥" }));
    expect(within(screen.getByRole("dialog", { name: "创建 API 密钥" })).getByRole("textbox")).toHaveValue("");
  });

  it.each(["subject", "generation", "preview", "admission"] as const)("retires Mail drafts on %s change and never revives them", async (change) => {
    const draw = (changed: boolean) => <ThemeProvider><LocaleProvider><SettingsModal
      brandName="Acme" initialTab="mail" onClose={() => {}}
      preview={changed && change === "preview"}
      readBoundary={{ admitted: !(changed && change === "admission"), subject: changed && change === "subject" ? "bob" : "alice", generation: changed && change === "generation" ? 2 : 1 }}
    /></LocaleProvider></ThemeProvider>;
    window.localStorage.setItem("kokoro.locale", "zh");
    const view = render(draw(false));
    fireEvent.click(screen.getByRole("button", { name: "添加工作流邮箱" }));
    fireEvent.change(within(screen.getByRole("dialog", { name: "添加工作流邮箱" })).getByRole("textbox", { name: "邮箱后缀" }), { target: { value: "private" } });
    view.rerender(draw(true));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "添加工作流邮箱" })).not.toBeInTheDocument());
    view.rerender(draw(false));
    fireEvent.click(screen.getByRole("button", { name: "添加工作流邮箱" }));
    expect(within(screen.getByRole("dialog", { name: "添加工作流邮箱" })).getByRole("textbox", { name: "邮箱后缀" })).toHaveValue("");
  });
});

describe("service detail previews", () => {
  it("keeps Zapier examples inert and resets integration details after leaving", () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("unexpected integration IO"));
    vi.stubGlobal("fetch", fetcher);
    renderSettings(() => {}, undefined, true, undefined, "integration");
    fireEvent.click(screen.getByRole("button", { name: "查看 Zapier 详情" }));
    const examples = screen.getByRole("region", { name: "工作流示例（尚未接通）" });
    expect(within(examples).getAllByRole("listitem")).toHaveLength(8);
    expect(within(examples).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Calendly", "Google Forms", "Microsoft Teams", "Outlook", "Salesforce", "Shopify", "Zendesk", "Zoom"]);
    for (const action of within(examples).getAllByRole("button", { name: "试试看" })) {
      expect(action).toBeDisabled();
      expect(action).toHaveAccessibleDescription("以下为静态用途示例；工作流服务尚未接通，暂时不能尝试。");
      fireEvent.click(action);
    }
    expect(examples.querySelector("a, input, iframe, canvas")).toBeNull();
    fireEvent.keyDown(screen.getByTestId("settings-tab-personalization"), { key: "Enter" });
    fireEvent.keyDown(screen.getByTestId("settings-tab-integration"), { key: "Enter" });
    expect(screen.getByRole("heading", { name: "集成", level: 1 })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Zapier" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看 Zapier 详情" })).toBeVisible();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["Zapier", "Apple Messages", "Slack", "Telegram", "LINE"])("shows %s information without authorizing an integration", async (provider) => {
    const fetcher = vi.fn().mockRejectedValue(new Error("unexpected integration IO"));
    vi.stubGlobal("fetch", fetcher);
    renderSettings(() => {}, undefined, true, undefined, "integration");
    fireEvent.click(screen.getByRole("button", { name: `查看 ${provider} 详情` }));
    const dialog = screen.getByRole("region", { name: provider });
    expect(screen.queryByRole("dialog", { name: provider })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: provider, level: 1 })).toHaveFocus();
    const primary = within(dialog).getAllByRole("button", { name: provider === "Zapier" ? "试试看" : "连接" })[0]!;
    expect(primary).toBeDisabled();
    expect(primary).toHaveAccessibleDescription(/尚未接通/);
    expect(dialog.querySelector("a, input, canvas")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "返回集成" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: provider })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: `查看 ${provider} 详情` })).toHaveFocus();
    expect(screen.getByTestId("settings-modal")).toBeVisible();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["授权应用", "管理授权应用"],
    ["云浏览器数据", "管理云浏览器数据"],
    ["已购买域名", "管理已购买域名"],
  ])("opens %s with unknown data instead of fabricated empty facts", async (title, trigger) => {
    const fetcher = vi.fn().mockRejectedValue(new Error("unexpected management IO"));
    vi.stubGlobal("fetch", fetcher);
    renderSettings(() => {}, undefined, true, undefined, "data-management");
    fireEvent.click(screen.getByRole("button", { name: trigger }));
    const dialog = screen.getByRole("region", { name: title });
    expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: title, level: 1 })).toHaveFocus();
    expect(dialog).toHaveTextContent("暂时无法读取");
    if (title === "云浏览器数据") {
      const preference = within(dialog).getByRole("button", { name: "登录保持状态不可读取" });
      expect(preference).toBeDisabled();
      expect(preference).not.toHaveAttribute("aria-checked");
      expect(preference).not.toHaveAttribute("aria-pressed");
      expect(preference).toHaveAccessibleDescription(/无法读取/);
      expect(dialog).toHaveTextContent("Cookies 和网站数据");
    }
    if (title === "已购买域名") {
      expect(within(dialog).getByRole("button", { name: "购买域名" })).toBeDisabled();
      expect(within(dialog).getByRole("button", { name: "购买域名" })).toHaveAccessibleDescription(/未接通/);
    }
    expect(within(dialog).queryByText(/暂无|没有已/)).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "返回数据管理" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: title, level: 1 })).not.toBeInTheDocument());
    expect(screen.getByTestId("settings-modal")).toBeVisible();
    expect(screen.getByRole("button", { name: trigger })).toHaveFocus();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["developer", "创建 Webhook", "创建 Webhook", "URL", "https://example.test/hook", "请输入有效的 URL。"],
    ["mail", "添加授权发件人", "添加授权发件人", "发件人邮箱", "sender@example.test", "请输入有效的邮箱地址。"],
  ] as const)("validates %s %s locally on blur and clears feedback on correction", (tab, trigger, title, label, valid, error) => {
    renderSettings(() => {}, undefined, true, undefined, tab);
    if (tab === "developer") fireEvent.keyDown(screen.getByRole("tab", { name: "Webhooks" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: trigger }));
    const dialog = screen.getByRole(tab === "mail" ? "form" : "dialog", { name: title });
    const input = within(dialog).getByRole("textbox", { name: label });
    fireEvent.change(input, { target: { value: "not valid" } });
    fireEvent.blur(input);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(error);
    expect(within(dialog).getByRole("alert")).toHaveTextContent(error);
    fireEvent.change(input, { target: { value: valid } });
    expect(input).not.toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "保存" })).toBeDisabled();
  });
});

it("task delivery options are inspectable while unsupported steering remains unavailable and queue stays unchanged", async () => {
  renderSettings(() => {}, undefined, true, undefined, "appearance");
  const trigger = screen.getByTestId("settings-task-delivery");
  expect(trigger).toBeEnabled();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const list = await screen.findByRole("listbox");
  for (const name of ["发送但不中断", "打断并发送"]) {
    expect(within(list).getByRole("option", { name })).toHaveAttribute("aria-disabled", "true");
  }
  expect(list).toHaveTextContent("尚需服务支持");
  fireEvent.keyDown(list, { key: "Escape" });
  expect(trigger).toHaveTextContent("添加到队列");
  expect(screen.getByTestId("settings-modal")).toBeInTheDocument();
});

it("shared file management shows unreadable authority rather than an invented empty file list", () => {
  renderSettings(() => {}, undefined, true, undefined, "data-management");
  fireEvent.click(screen.getByRole("button", { name: "管理已分享文件" }));
  const dialog = screen.getByRole("dialog", { name: "已分享文件" });
  expect(dialog).toHaveTextContent("暂时无法读取");
  expect(dialog).not.toHaveTextContent("暂无共享文件");
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
  expect(screen.getByTestId("settings-modal")).toBeInTheDocument();
});

it("personalization keeps import availability attached to its entry and knowledge preference explicitly unknown", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  renderSettings(() => {}, undefined, true, undefined, "personalization");
  const entry = screen.getByRole("button", { name: "导入" });
  expect(entry).toHaveAccessibleDescription("知识与记忆导入暂未接通。");
  expect(entry).toHaveTextContent("知识与记忆导入暂未接通。");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "知识" }), { button: 0, ctrlKey: false });
  const preference = screen.getByRole("button", { name: "知识偏好状态不可读取" });
  expect(preference).toBeDisabled();
  expect(preference).not.toHaveAttribute("aria-checked");
  expect(preference).not.toHaveAttribute("aria-pressed");
  expect(preference).toHaveAccessibleDescription("服务尚未接通，无法读取或保存知识偏好。");
  expect(screen.getByText("服务尚未接通，无法读取或保存知识偏好。")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "搜索知识" })).toBeDisabled();
  expect(fetcher).not.toHaveBeenCalled();
});

it("Mail sender edits stay inline, cancel or owned Escape clear them, and Enter performs no IO", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const onClose = vi.fn();
  renderSettings(onClose, undefined, true, undefined, "mail");
  const add = screen.getByRole("button", { name: "添加授权发件人" });
  fireEvent.click(add);
  expect(screen.queryByRole("dialog", { name: "添加授权发件人" })).not.toBeInTheDocument();
  let form = screen.getByRole("form", { name: "添加授权发件人" });
  let input = within(form).getByRole("textbox", { name: "发件人邮箱" });
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: "sender@example.test" } });
  fireEvent.submit(form);
  expect(within(form).getByRole("button", { name: "保存" })).toBeDisabled();
  expect(within(form).getByRole("button", { name: "保存" })).toHaveAccessibleDescription(/尚未接通/);
  fireEvent.click(within(form).getByRole("button", { name: "取消" }));
  expect(screen.queryByRole("form", { name: "添加授权发件人" })).not.toBeInTheDocument();
  expect(add).toHaveFocus();
  fireEvent.click(add);
  form = screen.getByRole("form", { name: "添加授权发件人" });
  input = within(form).getByRole("textbox", { name: "发件人邮箱" });
  expect(input).toHaveValue("");
  fireEvent.change(input, { target: { value: "old@example.test" } });
  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.queryByRole("form", { name: "添加授权发件人" })).not.toBeInTheDocument();
  expect(add).toHaveFocus();
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(add);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "收件箱" }), { button: 0, ctrlKey: false });
  fireEvent.mouseDown(screen.getByRole("tab", { name: "设置" }), { button: 0, ctrlKey: false });
  fireEvent.click(screen.getByRole("button", { name: "添加授权发件人" }));
  expect(within(screen.getByRole("form", { name: "添加授权发件人" })).getByRole("textbox")).toHaveValue("");
  const search = screen.getByRole("textbox", { name: "搜索" });
  search.focus();
  fireEvent.keyDown(search, { key: "Escape" });
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(["subject", "generation", "preview", "admission"] as const)("retires the inline Mail sender on %s change without reviving its contents", async (change) => {
  const draw = (changed: boolean) => <ThemeProvider><LocaleProvider><SettingsModal
    brandName="Acme" initialTab="mail" onClose={() => {}}
    preview={changed && change === "preview"}
    readBoundary={{ admitted: !(changed && change === "admission"), subject: changed && change === "subject" ? "bob" : "alice", generation: changed && change === "generation" ? 2 : 1 }}
  /></LocaleProvider></ThemeProvider>;
  window.localStorage.setItem("kokoro.locale", "zh");
  const view = render(draw(false));
  fireEvent.click(screen.getByRole("button", { name: "添加授权发件人" }));
  fireEvent.change(within(screen.getByRole("form", { name: "添加授权发件人" })).getByRole("textbox"), { target: { value: "private@example.test" } });
  view.rerender(draw(true));
  await waitFor(() => expect(screen.queryByRole("form", { name: "添加授权发件人" })).not.toBeInTheDocument());
  view.rerender(draw(false));
  fireEvent.click(screen.getByRole("button", { name: "添加授权发件人" }));
  expect(within(screen.getByRole("form", { name: "添加授权发件人" })).getByRole("textbox")).toHaveValue("");
});

it("Mailbox prefix is only a temporary draft and is cleared after closing", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  renderSettings(() => {}, undefined, true, undefined, "mail");
  fireEvent.click(screen.getByRole("button", { name: "设置" }));
  let dialog = screen.getByRole("dialog", { name: "邮箱设置" });
  const prefix = within(dialog).getByRole("textbox", { name: "地址前缀" });
  fireEvent.change(prefix, { target: { value: "private-prefix" } });
  expect(prefix).toHaveValue("private-prefix");
  expect(dialog).toHaveTextContent("域名待配置");
  expect(dialog.textContent).not.toContain("manus.bot");
  const save = within(dialog).getByRole("button", { name: "保存" });
  expect(save).toBeDisabled();
  expect(save).toHaveAccessibleDescription(/尚未接通/);
  fireEvent.submit(prefix.closest("form")!);
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
  fireEvent.click(screen.getByRole("button", { name: "设置" }));
  dialog = screen.getByRole("dialog", { name: "邮箱设置" });
  expect(within(dialog).getByRole("textbox", { name: "地址前缀" })).toHaveValue("");
  expect(fetcher).not.toHaveBeenCalled();
});

it("leaving Data retires its local management page and returning restores the overview", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  renderSettings(() => {}, undefined, true, undefined, "data-management");
  fireEvent.click(screen.getByRole("button", { name: "管理授权应用" }));
  expect(screen.getByRole("region", { name: "授权应用" })).toBeVisible();
  fireEvent.keyDown(screen.getByTestId("settings-tab-help"), { key: "Enter" });
  fireEvent.keyDown(screen.getByTestId("settings-tab-data-management"), { key: "Enter" });
  expect(screen.queryByRole("heading", { name: "授权应用", level: 1 })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "数据管理", level: 1 })).toBeVisible();
  expect(screen.getByRole("heading", { name: "已归档任务" })).toBeVisible();
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(["subject", "generation", "preview", "admission"] as const)("retires the Data management subpage on %s change", (change) => {
  const draw = (changed: boolean) => <ThemeProvider><LocaleProvider><SettingsModal
    brandName="Acme" initialTab="data-management" onClose={() => {}}
    preview={changed && change === "preview"}
    readBoundary={{ admitted: !(changed && change === "admission"), subject: changed && change === "subject" ? "bob" : "alice", generation: changed && change === "generation" ? 2 : 1 }}
  /></LocaleProvider></ThemeProvider>;
  window.localStorage.setItem("kokoro.locale", "zh");
  const view = render(draw(false));
  fireEvent.click(screen.getByRole("button", { name: "管理授权应用" }));
  expect(screen.getByRole("region", { name: "授权应用" })).toBeVisible();
  view.rerender(draw(true));
  expect(screen.queryByRole("heading", { name: "授权应用", level: 1 })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "数据管理", level: 1 })).toBeVisible();
  view.rerender(draw(false));
  expect(screen.getByRole("button", { name: "管理授权应用" })).toBeVisible();
});

it("formal account login navigation owns heading and return focus without starting authorization", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ data: { subject: "settings-reader", name: "Actual User", email: "actual@example.test", email_verified: true } }));
  vi.stubGlobal("fetch", fetcher);
  renderSettings(() => {}, undefined, false);
  await waitFor(() => expect(screen.getByRole("textbox", { name: "全名" })).toHaveValue("Actual User"));
  const reads = fetcher.mock.calls.length;
  const entry = () => screen.getByRole("button", { name: "管理登录方式" });
  fireEvent.click(entry());
  const content = screen.getByRole("region", { name: "管理登录方式" });
  expect(screen.queryByRole("dialog", { name: "管理登录方式" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "管理登录方式", level: 1 })).toHaveFocus();
  for (const provider of ["Google", "Microsoft", "Apple"]) expect(within(content).getByRole("group", { name: provider })).toHaveTextContent("连接状态暂时无法读取");
  expect(content).not.toHaveTextContent("尚未新增通行密钥");
  fireEvent.click(screen.getByRole("button", { name: "返回账户" }));
  expect(entry()).toHaveFocus();
  fireEvent.click(entry());
  fireEvent.keyDown(screen.getByTestId("settings-tab-shortcuts"), { key: "Enter" });
  expect(screen.getByRole("heading", { name: "键盘快捷键", level: 1 })).toBeVisible();
  fireEvent.keyDown(screen.getByTestId("settings-tab-account"), { key: "Enter" });
  expect(screen.getByTestId("settings-account")).toBeVisible();
  expect(screen.queryByTestId("settings-login-methods")).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(reads);
});


describe("static asset guidance session lifecycle", () => {
  it.each([
    ["phone", "立即创建", "为您的座席分配一个虚拟电话"],
    ["wallet", "添加", "添加支付方式"],
  ] as const)("keeps %s guidance through same-subject rechecks while cancel, Escape and leaving still close it", async (tab, triggerName, title) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const onClose = vi.fn();
    const draw = (admitted: boolean, generation: number) => <ThemeProvider><LocaleProvider><SettingsModal
      brandName="Acme" initialTab={tab} onClose={onClose} preview={false}
      readBoundary={{ admitted, subject: "owner-A", generation }}
    /></LocaleProvider></ThemeProvider>;
    const view = render(draw(true, 1));
    fireEvent.click(screen.getByRole("button", { name: triggerName }));
    const dialog = screen.getByRole("dialog", { name: title });
    const next = within(dialog).getByRole("button", { name: "继续" });
    expect(next).toBeDisabled();
    expect(next).toHaveAccessibleDescription(/尚未接通/);

    // The real probe revokes read admission and increments generation before a
    // same-subject GET settles. These static descriptions own no read or draft.
    view.rerender(draw(false, 2));
    expect(screen.getByRole("dialog", { name: title })).toBe(dialog);
    expect(next).toBeDisabled();
    view.rerender(draw(true, 2));
    expect(screen.getByRole("dialog", { name: title })).toBe(dialog);
    expect(next).toBeDisabled();
    expect(fetcher).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: triggerName })).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: triggerName }));
    fireEvent.keyDown(screen.getByRole("dialog", { name: title }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument());
    expect(screen.getByTestId("settings-modal")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: triggerName })).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: triggerName }));
    fireEvent.keyDown(screen.getByTestId("settings-tab-help"), { key: "Enter" });
    expect(screen.getByRole("heading", { name: "获取帮助", level: 1 })).toBeVisible();
    expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId(`settings-tab-${tab}`), { key: "Enter" });
    expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: triggerName })).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["phone", "立即创建", "为您的座席分配一个虚拟电话", "subject"],
    ["phone", "立即创建", "为您的座席分配一个虚拟电话", "anonymous"],
    ["phone", "立即创建", "为您的座席分配一个虚拟电话", "preview"],
    ["wallet", "添加", "添加支付方式", "subject"],
    ["wallet", "添加", "添加支付方式", "anonymous"],
    ["wallet", "添加", "添加支付方式", "preview"],
  ] as const)("retires %s guidance after %s / %s when %s changes and never revives it", async (tab, triggerName, title, change) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const draw = (changed: boolean) => <ThemeProvider><LocaleProvider><SettingsModal
      brandName="Acme" initialTab={tab} onClose={() => {}} preview={changed && change === "preview"}
      readBoundary={{ admitted: !(changed && change === "anonymous"), subject: changed ? change === "subject" ? "owner-B" : change === "anonymous" ? null : "owner-A" : "owner-A", generation: changed ? 2 : 1 }}
    /></LocaleProvider></ThemeProvider>;
    const view = render(draw(false));
    fireEvent.click(screen.getByRole("button", { name: triggerName }));
    expect(screen.getByRole("dialog", { name: title })).toBeVisible();
    view.rerender(draw(true));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument());
    view.rerender(draw(false));
    expect(screen.queryByRole("dialog", { name: title })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: triggerName }));
    expect(within(screen.getByRole("dialog", { name: title })).getByRole("button", { name: "继续" })).toBeDisabled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("account devices in the same Settings layer", () => {
  const current = { session_id: "device-current", created_at: "2026-10-14T00:00:00.000Z", expires_at: "2026-10-15T00:00:00.000Z" };
  const sessionPage = () => Response.json({
    data: { current_session: current, sessions: [{ ...current, session_id: "device-other" }] },
    meta: { request_id: "devices-layout", next_cursor: null },
  }, { headers: { "cache-control": "private, no-store", "x-request-id": "devices-layout" } });
  const profile = (subject = "settings-reader") => Response.json({ data: { subject, name: "Actual User", email: "actual@example.test", email_verified: true } });

  it("keeps a single dialog, focuses the device heading, cancels removal without DELETE and returns to its own trigger", async () => {
    const fetcher = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>((input) => {
      if (input === "/api/account/profile") return Promise.resolve(profile());
      if (input === "/api/account/sessions?limit=25") return Promise.resolve(sessionPage());
      throw new Error("Unexpected account device request");
    });
    vi.stubGlobal("fetch", fetcher);
    renderSettings();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "全名" })).toHaveValue("Actual User"));
    const entry = () => screen.getByRole("button", { name: "登录设备" });
    fireEvent.click(entry());
    const page = screen.getByRole("region", { name: "登录设备" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "登录设备", level: 1 })).toHaveFocus();
    expect(screen.queryByRole("dialog", { name: "登录设备" })).not.toBeInTheDocument();
    await within(page).findByText("当前会话");
    expect(within(page).getAllByText("设备信息未知")).toHaveLength(2);
    expect(within(page).getByRole("region", { name: "当前会话" })).not.toContainElement(within(page).getByRole("button", { name: "移除" }));
    expect(page).not.toHaveTextContent(/Chrome|London|online/i);
    fireEvent.click(within(page).getByRole("button", { name: "移除" }));
    expect(within(page).getByText("确定移除此登录会话？")).toBeVisible();
    expect(within(page).getByRole("button", { name: "取消" })).toHaveFocus();
    fireEvent.click(within(page).getByRole("button", { name: "取消" }));
    expect(within(page).queryByRole("button", { name: "确认移除" })).not.toBeInTheDocument();
    expect(within(page).getByRole("button", { name: "移除" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "返回账户" }));
    expect(entry()).toHaveFocus();
    expect(screen.queryByRole("region", { name: "登录设备" })).not.toBeInTheDocument();

    fireEvent.click(entry());
    await screen.findByText("当前会话");
    fireEvent.click(screen.getByRole("button", { name: "移除" }));
    fireEvent.keyDown(screen.getByTestId("settings-tab-shortcuts"), { key: "Enter" });
    expect(screen.getByRole("heading", { name: "键盘快捷键", level: 1 })).toBeVisible();
    fireEvent.keyDown(screen.getByTestId("settings-tab-account"), { key: "Enter" });
    expect(screen.getByRole("heading", { name: "账户", level: 1 })).toBeVisible();
    expect(screen.queryByText("确定移除此登录会话？")).not.toBeInTheDocument();
    expect(entry()).toBeVisible();
    expect(fetcher.mock.calls.filter(([input]) => input.startsWith("/api/account/sessions"))).toHaveLength(2);
    expect(fetcher.mock.calls.every(([input]) => input === "/api/account/profile" || input === "/api/account/sessions?limit=25")).toBe(true);
    // Every request in this journey is a read; cancellation never reaches DELETE.
    expect(fetcher.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });

  it.each(["subject", "generation", "admission", "preview"] as const)("retires pending device reads on %s and never revives the subpage", async (change) => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    const fetcher = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>((input) => input === "/api/account/profile" ? Promise.resolve(profile("alice")) : pending);
    vi.stubGlobal("fetch", fetcher);
    const draw = (changed: boolean) => <ThemeProvider><LocaleProvider><SettingsModal
      brandName="Acme" initialTab="account" onClose={() => {}} preview={changed && change === "preview"}
      readBoundary={{ admitted: !(changed && change === "admission"), subject: changed && change === "subject" ? "bob" : "alice", generation: changed && change === "generation" ? 2 : 1 }}
    /></LocaleProvider></ThemeProvider>;
    const view = render(draw(false));
    fireEvent.click(screen.getByRole("button", { name: "登录设备" }));
    await waitFor(() => expect(fetcher.mock.calls.some(([input]) => input === "/api/account/sessions?limit=25")).toBe(true));
    const signal = fetcher.mock.calls.find(([input]) => input === "/api/account/sessions?limit=25")![1]!.signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    view.rerender(draw(true));
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole("region", { name: "登录设备" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "账户", level: 1 })).toBeVisible();
    await act(async () => finish(sessionPage()));
    expect(screen.queryByText("当前会话")).not.toBeInTheDocument();
    view.rerender(draw(false));
    expect(screen.queryByRole("region", { name: "登录设备" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录设备" })).toBeEnabled();
    expect(fetcher.mock.calls.filter(([input]) => input === "/api/account/sessions?limit=25")).toHaveLength(1);
    expect(fetcher.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });

  it("keeps preview device management unavailable without issuing session requests", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    renderSettings(() => {}, undefined, true);
    const entry = screen.getByRole("button", { name: "登录设备" });
    expect(entry).toBeDisabled();
    fireEvent.click(entry);
    expect(screen.queryByRole("region", { name: "登录设备" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

it("knowledge Save references one stable complete unavailable description and discards canceled drafts", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  renderSettings(() => {}, undefined, true, undefined, "personalization");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "知识" }), { button: 0, ctrlKey: false });
  const add = screen.getByRole("button", { name: "新增" });
  fireEvent.click(add);
  let dialog = screen.getByRole("dialog", { name: "添加知识" });
  const reason = "知识保存服务暂未接通。此处仅供填写临时草稿，关闭后清空。";
  expect(within(dialog).getAllByText(reason, { exact: true })).toHaveLength(1);
  const description = within(dialog).getByText(reason, { exact: true });
  expect(description.id).not.toBe("");
  expect(dialog).toHaveAttribute("aria-describedby", description.id);
  const save = within(dialog).getByRole("button", { name: "保存" });
  expect(save).toBeDisabled();
  expect(save).toHaveAttribute("aria-describedby", description.id);
  expect(save).toHaveAccessibleDescription(reason);
  fireEvent.change(within(dialog).getByRole("textbox", { name: "名称" }), { target: { value: "private knowledge draft" } });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "内容" }), { target: { value: "private content" } });
  fireEvent.submit(save.closest("form")!);
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
  await waitFor(() => expect(add).toHaveFocus());
  fireEvent.click(add);
  dialog = screen.getByRole("dialog", { name: "添加知识" });
  expect(within(dialog).getByRole("textbox", { name: "名称" })).toHaveValue("");
  expect(within(dialog).getByRole("textbox", { name: "内容" })).toHaveValue("");
  expect(within(dialog).getAllByText(reason, { exact: true })).toHaveLength(1);
  expect(within(dialog).getByRole("button", { name: "保存" })).toHaveAttribute("aria-describedby", description.id);
  expect(fetcher).not.toHaveBeenCalled();
});
