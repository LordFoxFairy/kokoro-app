import {
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Film,
  Globe2,
  Presentation,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { MessageKey } from "@/i18n/messages"

export type LibraryFilter = "all" | "slides" | "websites" | "documents" | "spreadsheets" | "images" | "media" | "other"

export const FILTERS: readonly { value: LibraryFilter; key: MessageKey }[] = [
  { value: "all", key: "library.filterAll" },
  { value: "slides", key: "library.filterSlides" },
  { value: "websites", key: "library.filterWebsites" },
  { value: "documents", key: "library.filterDocuments" },
  { value: "spreadsheets", key: "library.filterSpreadsheets" },
  { value: "images", key: "library.filterImages" },
  { value: "media", key: "library.filterMedia" },
  { value: "other", key: "library.filterOther" },
]

export type LibraryUrlState = {
  filter: LibraryFilter
  query: string
  view: "grid" | "list"
  favoritesOnly: boolean
}

export const DEFAULT_URL_STATE: LibraryUrlState = { filter: "all", query: "", view: "grid", favoritesOnly: false }

export function artifactFilter(mime: string, title: string): Exclude<LibraryFilter, "all"> {
  const value = `${mime} ${title}`.toLocaleLowerCase()
  if (value.includes("presentation") || value.includes("powerpoint") || /\b(slides|deck|投影片)\b/.test(value)) return "slides"
  if (value.includes("html") || value.includes("website") || value.includes("网页") || value.includes("網站")) return "websites"
  if (value.includes("spreadsheet") || value.includes("excel") || value.includes("csv") || value.includes("试算表") || value.includes("試算表")) return "spreadsheets"
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(title)) return "images"
  if (mime.startsWith("audio/") || mime.startsWith("video/") || /\.(mp3|mp4|mov|wav)$/i.test(title)) return "media"
  if (mime.includes("text") || mime.includes("pdf") || mime.includes("document") || /\.(docx?|pdf|txt|md)$/i.test(title)) return "documents"
  return "other"
}

export function artifactIcon(kind: LibraryFilter): LucideIcon {
  switch (kind) {
    case "slides": return Presentation
    case "websites": return Globe2
    case "documents": return FileText
    case "spreadsheets": return FileSpreadsheet
    case "images": return FileImage
    case "media": return Film
    default: return File
  }
}
