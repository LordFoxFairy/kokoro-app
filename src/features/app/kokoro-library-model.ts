import {
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Film,
  AudioLines,
  Presentation,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { MessageKey } from "@/i18n/messages"

export type LibraryFilter = "all" | "slides" | "documents" | "spreadsheets" | "images" | "video" | "audio" | "other"

export const FILTERS: readonly { value: LibraryFilter; key: MessageKey }[] = [
  { value: "all", key: "library.filterAll" },
  { value: "documents", key: "library.filterDocuments" },
  { value: "slides", key: "library.filterSlides" },
  { value: "spreadsheets", key: "library.filterSpreadsheets" },
  { value: "images", key: "library.filterImages" },
  { value: "video", key: "library.filterVideo" },
  { value: "audio", key: "library.filterAudio" },
  { value: "other", key: "library.filterOther" },
]

export type LibraryArtifactQuery = Readonly<{query: string; type: LibraryFilter}>

export type LibraryUrlState = {
  filter: LibraryFilter
  query: string
  view: "grid" | "list"
  favoritesOnly: boolean
}

export const DEFAULT_URL_STATE: LibraryUrlState = { filter: "all", query: "", view: "grid", favoritesOnly: false }

export function artifactFilter(mime: string, title: string): Exclude<LibraryFilter, "all"> {
  mime = mime.toLowerCase()
  const value = `${mime} ${title}`.toLowerCase()
  if (value.includes("presentation") || value.includes("powerpoint") || /\b(slides|deck|投影片)\b/.test(value)) return "slides"
  if (value.includes("spreadsheet") || value.includes("excel") || value.includes("csv") || value.includes("试算表") || value.includes("試算表")) return "spreadsheets"
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(title)) return "images"
  if (mime.startsWith("audio/") || /\.(mp3|wav|ogg|flac|m4a)$/i.test(title)) return "audio"
  if (mime.startsWith("video/") || /\.(mp4|mov|webm|mkv)$/i.test(title)) return "video"
  if (mime.includes("text") || mime.includes("pdf") || mime.includes("document") || /\.(docx?|pdf|txt|md)$/i.test(title)) return "documents"
  return "other"
}

export function artifactIcon(kind: LibraryFilter): LucideIcon {
  switch (kind) {
    case "slides": return Presentation
    case "documents": return FileText
    case "spreadsheets": return FileSpreadsheet
    case "images": return FileImage
    case "video": return Film
    case "audio": return AudioLines
    default: return File
  }
}
