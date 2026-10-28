import { FileOutput, FilePenLine, FileText, FolderOpen, Globe, Info, ListTree, Plug, Search, Wrench } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { RunActivityDetail } from "@/contract/answer-actions"
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

const NATIVE_EXECUTION_PRESENTATION = {
  edit_file: { label: "thread.toolFileEdit", Icon: FilePenLine, pathKey: "file_path" },
  ls: { label: "thread.toolDirectoryList", Icon: FolderOpen, pathKey: "path" },
  glob: { label: "thread.toolFileFind", Icon: Search, pathKey: "path" },
  grep: { label: "thread.toolFileSearch", Icon: Search, pathKey: "path" },
} satisfies Record<string, { label: MessageKey; Icon: LucideIcon; pathKey: string }>

/** Read a literal path from the original complete preview, never infer it from output. */
function nativePath(detail: RunActivityDetail, key: string): string | undefined {
  const preview = detail.input_preview
  if (!preview || preview.truncated || preview.redacted) return undefined
  try {
    const input: unknown = JSON.parse(preview.text)
    if (!input || typeof input !== "object" || Array.isArray(input)) return undefined
    const value = (input as Record<string, unknown>)[key]
    return typeof value === "string" && value.startsWith("/") && value.trim() === value
      && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value) ? value : undefined
  } catch { return undefined }
}

/** One display mapping for timeline and inspector; facts remain owned by the same activity. */
export function toolActionPresentation(activity: Extract<RunProcessActivity, { activity: "tool" }>, suppliedDetail?: RunActivityDetail) {
  const detail = suppliedDetail?.activity_id === activity.activity_id ? suppliedDetail : undefined
  const target = detail?.target ?? activity.display_detail
  const native = activity.display_code === "tool.execution" && detail && Object.hasOwn(NATIVE_EXECUTION_PRESENTATION, detail.tool_name)
    ? NATIVE_EXECUTION_PRESENTATION[detail.tool_name as keyof typeof NATIVE_EXECUTION_PRESENTATION] : undefined
  const targetText = target?.kind === "file" ? target.virtual_path ?? target.name : target?.name
  return {
    ...(native ?? TOOL_ACTION_PRESENTATION[activity.display_code]),
    targetText: targetText ?? (native && detail ? nativePath(detail, native.pathKey) : undefined),
    file: target?.kind === "file" || Boolean(native),
  }
}
