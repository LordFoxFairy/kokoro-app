export type ResourceKind = "all" | "file" | "web"

export type ProjectResourcePreview = {
  id: string
  name: string
  kind: Exclude<ResourceKind, "all">
  detail: string
}

export type ProjectWebsitePreview = {
  id: string
  name: string
  detail: string
}

export type ProjectScheduledPreview = {
  id: string
  title: string
  prompt: string
  frequency: "daily" | "weekly"
  time: string
  timezone: string
  autoApprove: boolean
}

export const previewResources: readonly ProjectResourcePreview[] = [
  { id: "research-brief", name: "研究简报.md", kind: "file", detail: "Markdown · 4 KB" },
  { id: "kokoro-product-site", name: "Kokoro 产品网站", kind: "web", detail: "网页参考" },
]

export const previewWebsites: readonly ProjectWebsitePreview[] = [
  { id: "kokoro-product-site", name: "Kokoro 产品网站", detail: "kokoro.miaokit.cloud" },
  { id: "launch-notes-site", name: "产品发布页", detail: "launch.example.test" },
]

export const previewScheduledTasks: readonly ProjectScheduledPreview[] = [
  {
    id: "daily-briefing",
    title: "每日简报",
    prompt: "汇总今天的重要消息",
    frequency: "daily",
    time: "08:00",
    timezone: "UTC",
    autoApprove: false,
  },
]
