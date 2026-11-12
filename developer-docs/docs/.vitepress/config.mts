import { existsSync, readFileSync } from 'node:fs';

import { defineConfig } from 'vitepress';

interface ReferenceItem {
  readonly link: string;
  readonly text: string;
}

function isReferenceItem(value: unknown): value is ReferenceItem {
  if (value === null || typeof value !== 'object') return false;
  if (!('link' in value) || !('text' in value)) return false;
  return typeof value.link === 'string' && typeof value.text === 'string';
}

const REFERENCE_LABELS: Readonly<Record<string, string>> = {
  'Account Profile': '账户资料',
  'Account Sessions': '账户会话',
  Administration: '后台管理',
  Agents: 'Agent 连接',
  Billing: '计费',
  Chat: '对话',
  Health: '健康检查',
  Identity: '身份',
  Library: '资源库',
  MCP: 'MCP',
  Models: '模型',
  'Mori Music': 'Mori 音乐',
  Projects: '项目',
  Personalization: '个性化',
  Scheduled: '定时任务',
  Schemas: '数据结构',
  Skills: '技能',
  System: '系统',
  Team: '团队',
  Connectors: '连接器',
};

function loadReferenceItems(): ReferenceItem[] {
  const manifestUrl = new URL(
    '../api/reference/v1/generated/manifest.json',
    import.meta.url,
  );
  if (!existsSync(manifestUrl)) return [];
  const parsed: unknown = JSON.parse(readFileSync(manifestUrl, 'utf8'));
  if (parsed === null || typeof parsed !== 'object' || !('items' in parsed)) {
    throw new Error('Generated reference manifest has no items');
  }
  if (!Array.isArray(parsed.items) || !parsed.items.every(isReferenceItem)) {
    throw new Error('Generated reference manifest contains invalid items');
  }
  return parsed.items.map((item) => ({
    ...item,
    text: REFERENCE_LABELS[item.text] ?? item.text,
  }));
}

const referenceItems = loadReferenceItems();

export default defineConfig({
  lang: 'zh-CN',
  title: 'Kokoro 文档',
  description: 'Kokoro 产品指南、外部接入与第一方 API 参考。',
  cleanUrls: true,
  lastUpdated: false,
  markdown: {
    theme: { light: 'github-light-high-contrast', dark: 'github-dark-high-contrast' },
  },
  themeConfig: {
    nav: [
      { text: '产品指南', link: '/product/' },
      { text: 'API 文档', link: '/api/' },
    ],
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档与 API', buttonAriaLabel: '搜索文档与 API' },
          modal: {
            displayDetails: '显示详情',
            resetButtonTitle: '清空搜索',
            backButtonTitle: '返回搜索',
            noResultsText: '没有找到相关结果',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
          },
        },
      },
    },
    sidebar: {
      '/product/': [
        {
          text: '产品功能',
          items: [
            { text: '快速开始', link: '/product/' },
            { text: '任务与对话', items: [{ text: '发送、过程与恢复', link: '/product/tasks/' }] },
            { text: '文件与结果', items: [{ text: '附件、资料库与 Canvas', link: '/product/files/' }] },
            { text: '项目', items: [{ text: '会话、指令与手工 Todo', link: '/product/projects/' }] },
            { text: '定时任务', items: [{ text: '计划、日历与执行记录', link: '/product/scheduled-tasks/' }] },
            { text: '连接与语音', items: [{ text: '入口、授权与识别', link: '/product/connections/' }] },
            { text: '设置', items: [{ text: '个性化与个人知识', link: '/product/settings/personalization' }] },
            { text: '当前支持范围', link: '/product/availability' },
          ],
        },
      ],
      '/api/': [
        {
          text: '开始使用',
          items: [
            { text: '介绍', link: '/api/' },
            { text: '快速开始', link: '/api/quickstart' },
            { text: '认证与适用范围', link: '/api/authentication' },
            { text: '技能读取与精确版本', link: '/api/guides/skills' },
          ],
        },
        {
          text: '字段参考',
          collapsed: true,
          items: [
            { text: 'Kokoro API v1', link: '/api/reference/v1/' },
            ...referenceItems,
          ],
        },
        {
          text: '核心概念',
          items: [
            { text: '项目', link: '/api/concepts/projects' },
            { text: '对话与消息', link: '/api/concepts/conversations-messages' },
            { text: '异步 Agent run', link: '/api/concepts/asynchronous-runs' },
            { text: '生命周期与状态', link: '/api/concepts/lifecycle' },
            { text: 'AG-UI 流与 replay', link: '/api/concepts/ag-ui' },
            { text: '文件与 artifact', link: '/api/concepts/files-artifacts' },
            { text: '定时任务', link: '/api/concepts/scheduled-tasks' },
          ],
        },
        {
          text: '第一方工作流参考',
          collapsed: true,
          items: [
            { text: '创建 run', link: '/api/guides/create-run' },
            { text: '继续对话', link: '/api/guides/follow-up' },
            { text: '取消 run', link: '/api/guides/cancel-run' },
            { text: '恢复 run', link: '/api/guides/resume-run' },
            { text: '断线后 replay', link: '/api/guides/replay-after-disconnect' },
            { text: '幂等 command', link: '/api/guides/idempotent-commands' },
            { text: 'Cursor 分页', link: '/api/guides/cursor-pagination' },
            { text: '积分与非现金充值', link: '/api/guides/credits' },
            { text: '上传生命周期', link: '/api/guides/upload-lifecycle' },
            { text: 'Webhooks 当前边界', link: '/api/guides/webhooks' },
          ],
        },
        {
          text: '平台行为',
          items: [
            { text: '响应与错误', link: '/api/platform/responses-errors' },
            { text: 'Request ID', link: '/api/platform/request-ids' },
            { text: '幂等性', link: '/api/platform/idempotency' },
            { text: '速率与重试', link: '/api/platform/rate-limits-retries' },
            { text: 'UTC 与 RFC 3339', link: '/api/platform/time' },
            { text: '版本与弃用', link: '/api/platform/versioning' },
            { text: '安全边界', link: '/api/platform/security' },
          ],
        },
        {
          text: '发布信息',
          items: [
            { text: '变更记录', link: '/api/changelog' },
            { text: 'Contract provenance', link: '/api/provenance' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/LordFoxFairy/Kokoro' },
    ],
    footer: {
      message: 'Public contract 的事实 owner 是 kokoro-bff。',
      copyright: 'Kokoro 文档',
    },
    outline: { label: '本页目录', level: [2, 3] },
  },
});
