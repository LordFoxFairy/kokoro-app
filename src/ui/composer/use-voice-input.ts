"use client"

import { useCallback, useLayoutEffect, useRef, useState } from "react"

import { AUTH_INDEX_SUBJECT_KEY, readBrowserAuthIndexSubject } from "@/ui/shell/page-clients"

export type VoiceInputState = "idle" | "listening" | "transcribing" | "error"
export type VoiceInputError = "unsupported" | "permission" | "recognizer"
export type VoiceDraftScope = Readonly<{ subject?: string }>

type VoiceStatus =
  | { state: Exclude<VoiceInputState, "error">; error: null }
  | { state: "error"; error: VoiceInputError }

const idle: VoiceStatus = { state: "idle", error: null }

type SpeechRecognitionResultEventLike = Event & {
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}
type SpeechRecognitionErrorEventLike = Event & { error?: string }
type SpeechRecognitionLike = EventTarget & {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
}

type UseVoiceInputOptions = {
  draft: string
  onDraftChange: (value: string) => void
  preview: boolean
  previewTranscript: string
  /** The shell owns identity; null means no admitted draft. */
  scope?: VoiceDraftScope | null
}

function appendTranscript(draft: string, transcript: string): string {
  return draft && !/\s$/u.test(draft) ? `${draft} ${transcript}` : `${draft}${transcript}`
}

function ownerMatches(scope: VoiceDraftScope | null | undefined): boolean {
  if (scope === null) return false
  try { return scope?.subject === undefined || readBrowserAuthIndexSubject() === scope.subject }
  catch { return false }
}

export function useVoiceInput({ draft, onDraftChange, preview, previewTranscript, scope }: UseVoiceInputOptions) {
  const [status, setStatus] = useState<VoiceStatus>(idle)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const previewTimerRef = useRef<number | null>(null)
  const attemptRef = useRef(0)
  const draftRef = useRef({ draft, onDraftChange, scope, preview })

  const retire = useCallback(() => {
    // Invalidate before abort(): the browser may synchronously deliver a stale end/error.
    attemptRef.current += 1
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current)
    previewTimerRef.current = null
    const recognition = recognitionRef.current
    recognitionRef.current = null
    recognition?.abort()
  }, [])
  const cancel = useCallback(() => {
    retire()
    setStatus(idle)
  }, [retire])

  useLayoutEffect(() => {
    const previous = draftRef.current
    draftRef.current = { draft, onDraftChange, scope, preview }
    if (previous.scope !== scope || previous.preview !== preview) cancel()
  }, [draft, onDraftChange, scope, preview, cancel])

  useLayoutEffect(() => {
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === AUTH_INDEX_SUBJECT_KEY && event.oldValue !== event.newValue) cancel()
    }
    window.addEventListener("kokoro:surface-navigation", cancel)
    window.addEventListener("kokoro:auth-invalidated", cancel)
    window.addEventListener("popstate", cancel)
    window.addEventListener("pagehide", cancel)
    window.addEventListener("storage", storage)
    return () => {
      window.removeEventListener("kokoro:surface-navigation", cancel)
      window.removeEventListener("kokoro:auth-invalidated", cancel)
      window.removeEventListener("popstate", cancel)
      window.removeEventListener("pagehide", cancel)
      window.removeEventListener("storage", storage)
      retire()
    }
  }, [cancel, retire])

  const toggle = useCallback(() => {
    if (recognitionRef.current !== null || previewTimerRef.current !== null) {
      cancel()
      return
    }
    const startingScope = draftRef.current.scope
    if (!ownerMatches(startingScope)) return
    const attempt = ++attemptRef.current
    const route = window.location.href
    const current = () => {
      if (attemptRef.current !== attempt) return false
      if (draftRef.current.scope === startingScope && window.location.href === route && ownerMatches(startingScope)) return true
      cancel()
      return false
    }
    const append = (text: string) => {
      const transcript = text.trim()
      if (transcript) {
        const latest = draftRef.current
        latest.onDraftChange(appendTranscript(latest.draft, transcript))
      }
    }
    if (preview) {
      setStatus({ state: "listening", error: null })
      previewTimerRef.current = window.setTimeout(() => {
        if (!current()) return
        previewTimerRef.current = window.setTimeout(() => {
          if (!current()) return
          previewTimerRef.current = null
          setStatus(idle)
          append(previewTranscript)
        }, 220)
        setStatus({ state: "transcribing", error: null })
      }, 620)
      return
    }

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) {
      setStatus({ state: "error", error: "unsupported" })
      return
    }
    try {
      const recognition = new Recognition()
      let final = ""
      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = document.documentElement.lang || navigator.language
      recognition.onresult = (event) => {
        if (recognitionRef.current !== recognition || !current()) return
        const text = Array.from(event.results).filter(result => result.isFinal).map(result => result[0]?.transcript ?? "").join(" ").trim()
        if (text) {
          final = text
          setStatus({ state: "transcribing", error: null })
        }
      }
      recognition.onerror = (event) => {
        if (recognitionRef.current !== recognition || !current()) return
        recognitionRef.current = null
        if (event.error === "no-speech" || event.error === "aborted") setStatus(idle)
        else setStatus({ state: "error", error: event.error === "not-allowed" ? "permission" : "recognizer" })
      }
      recognition.onend = () => {
        if (recognitionRef.current !== recognition || !current()) return
        recognitionRef.current = null
        setStatus(idle)
        append(final)
      }
      recognitionRef.current = recognition
      setStatus({ state: "listening", error: null })
      recognition.start()
    } catch (error) {
      if (attemptRef.current !== attempt) return
      recognitionRef.current = null
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")
      setStatus({ state: "error", error: denied ? "permission" : "recognizer" })
    }
  }, [cancel, preview, previewTranscript])

  return { ...status, toggle, cancel }
}
