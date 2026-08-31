"use client"

import { useState, type ReactNode } from "react"
import { AudioWaveform } from "lucide-react"

export type BrandMarkProps = {
  logoUrl?: string
  fallback: ReactNode
  imageClassName: string
}

/** Runtime tenant assets fall back to the text mark instead of showing a broken image. */
export function BrandMark({ logoUrl, fallback, imageClassName }: BrandMarkProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  if (!logoUrl || failedUrl === logoUrl) return <>{fallback}</>

  // eslint-disable-next-line @next/next/no-img-element
  return <img className={imageClassName} src={logoUrl} alt="" onError={() => setFailedUrl(logoUrl)} />
}

export function BrandFallback({ mark, className }: { mark?: string; className?: string }) {
  const normalized = mark?.trim()
  if (normalized && normalized !== "心") return <span>{normalized}</span>

  return <AudioWaveform className={className} strokeWidth={2.25} />
}
