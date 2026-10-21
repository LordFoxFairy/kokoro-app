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
    '../reference/v1/generated/manifest.json',
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
  title: 'Kokoro Developer API',
  description: 'Kokoro public Product API 的中文 contract-first 开发者门户。',
  cleanUrls: true,
  lastUpdated: false,
  themeConfig: {
    nav: [
      { text: '文档', link: '/introduction' },
      { text: 'API 参考', link: '/reference/v1/' },
      { text: '变更记录', link: '/changelog' },
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
    sidebar: [
      {
        text: '开始使用',
        items: [
          { text: '介绍', link: '/introduction' },
          { text: '快速开始', link: '/quickstart' },
          { text: '认证与请求约定', link: '/authentication' },
        ],
      },
      {
        text: 'API 参考',
        items: [
          { text: 'Kokoro API v1', link: '/reference/v1/' },
          ...referenceItems,
        ],
      },
      {
        text: '核心概念',
        items: [
          { text: '项目', link: '/concepts/projects' },
          { text: '对话与消息', link: '/concepts/conversations-messages' },
          { text: '异步 Agent run', link: '/concepts/asynchronous-runs' },
          { text: '生命周期与状态', link: '/concepts/lifecycle' },
          { text: 'AG-UI 流与 replay', link: '/concepts/ag-ui' },
          { text: '文件与 artifact', link: '/concepts/files-artifacts' },
          { text: '定时任务', link: '/concepts/scheduled-tasks' },
        ],
      },
      {
        text: '工作流指南',
        items: [
          { text: '技能读取与精确版本', link: '/guides/skills' },
          { text: '创建 run', link: '/guides/create-run' },
          { text: '继续对话', link: '/guides/follow-up' },
          { text: '取消 run', link: '/guides/cancel-run' },
          { text: '恢复 run', link: '/guides/resume-run' },
          { text: '断线后 replay', link: '/guides/replay-after-disconnect' },
          { text: '幂等 command', link: '/guides/idempotent-commands' },
          { text: 'Cursor 分页', link: '/guides/cursor-pagination' },
          { text: '上传生命周期', link: '/guides/upload-lifecycle' },
          { text: 'Webhooks 当前边界', link: '/guides/webhooks' },
        ],
      },
      {
        text: '平台行为',
        items: [
          { text: '响应与错误', link: '/platform/responses-errors' },
          { text: 'Request ID', link: '/platform/request-ids' },
          { text: '幂等性', link: '/platform/idempotency' },
          { text: '速率与重试', link: '/platform/rate-limits-retries' },
          { text: 'UTC 与 RFC 3339', link: '/platform/time' },
          { text: '版本与弃用', link: '/platform/versioning' },
          { text: '安全边界', link: '/platform/security' },
        ],
      },
      {
        text: '发布信息',
        items: [
          { text: '变更记录', link: '/changelog' },
          { text: 'Contract provenance', link: '/provenance' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/LordFoxFairy/Kokoro' },
    ],
    footer: {
      message: 'Public contract 的事实 owner 是 kokoro-bff。',
      copyright: 'Kokoro Developer API',
    },
    outline: { label: '本页目录', level: [2, 3] },
  },
});
