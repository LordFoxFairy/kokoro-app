import { FileOutput, FilePenLine, FileText, Globe, Info, ListTree, Plug, Search, Wrench } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { RunProcessActivity } from "@/contract/chat"
import type { MessageKey } from "@/i18n/messages"

type ToolCode = Extract<RunProcessActivity, { activity: "tool" }>["display_code"]

// UI-only presentation of the owner's generated category set, not another wire schema.
export const TOOL_ACTION_PRESENTATION = {
  "tool.execution": { label: "thread.toolCall", Icon: Wrench },
  "tool.file.read": { label: "thread.toolFileRead", Icon: FileText },
  "tool.file.write": { label: "thread.toolFileWrite", Icon: FilePenLine },
  "tool.file.deliver": { label: "thread.toolFileDeliver", Icon: FileOutput },
  "tool.mcp.discover": { label: "thread.toolMcpDiscover", Icon: ListTree },
  "tool.mcp.describe": { label: "thread.toolMcpDescribe", Icon: Info },
  "tool.mcp.call": { label: "thread.toolMcpCall", Icon: Plug },
  "tool.web.search": { label: "thread.toolWebSearch", Icon: Search },
  "tool.web.fetch": { label: "thread.toolWebFetch", Icon: Globe },
} satisfies Record<ToolCode, { label: MessageKey; Icon: LucideIcon }>
