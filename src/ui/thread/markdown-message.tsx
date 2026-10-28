import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

import styles from "./thread.module.css"

// 助手消息按 markdown 渲染：react-markdown 构建 React 元素树，默认不启用 rehype-raw，
// 故内嵌的原始 HTML（<script>/<img onerror> 等）被当作文本而非可执行节点——从根上防 XSS。
// remark-gfm 补齐表格/任务列表/删除线/自动链接。仅助手走这里；用户输入保持纯文本。
const MARKDOWN_COMPONENTS: Components = {
  // LLM 生成的链接强制新窗 + noopener/noreferrer/nofollow：不泄露 referrer、不让目标页操作 opener。
  a({ children, href }) {
    // The default URL filter may remove a destination; keep its text, not a current-page link.
    if (!href?.trim()) return <>{children}</>
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    )
  },
}

// Tool output is readable Markdown, not permission to navigate or fetch assets.
// Keep resource labels visible; the exact destinations remain in the raw record.
const TEXT_RESOURCE_COMPONENTS: Components = {
  ...MARKDOWN_COMPONENTS,
  a: ({ children }) => <>{children}</>,
  img: ({ alt }) => <span>{alt}</span>,
}

type MarkdownMessageProps = {
  content: string
  resourcePolicy?: "default" | "text-only"
}

export function MarkdownMessage({ content, resourcePolicy = "default" }: MarkdownMessageProps) {
  return (
    <div className={styles.md} data-slot="markdown-message" data-resource-policy={resourcePolicy}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={resourcePolicy === "text-only" ? TEXT_RESOURCE_COMPONENTS : MARKDOWN_COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
