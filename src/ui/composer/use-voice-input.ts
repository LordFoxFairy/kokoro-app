"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type VoiceInputState = "idle" | "listening" | "transcribing" | "error"

type SpeechRecognitionResultEventLike = Event & {
  results: ArrayLike<{ 0: { transcript: string } }>
}
type SpeechRecognitionErrorEventLike = Event & { error?: string }
type SpeechRecognitionLike = EventTarget & {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

type UseVoiceInputOptions = {
  draft: string
  onDraftChange: (value: string) => void
  preview: boolean
  previewTranscript: string
}

function appendTranscript(draft: string, transcript: string): string {
  const current = draft.trimEnd()
  const next = transcript.trim()
  if (!next) return draft
  return current ? `${current} ${next}` : next
}

export function useVoiceInput({ draft, onDraftChange, preview, previewTranscript }: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceInputState>("idle")
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const previewTimerRef = useRef<number | null>(null)
  const attemptRef = useRef(0)
  const draftRef = useRef(draft)
  const onDraftChangeRef = useRef(onDraftChange)

  useEffect(() => {
    draftRef.current = draft
    onDraftChangeRef.current = onDraftChange
  }, [draft, onDraftChange])

  const clearPreviewTimer = useCallback(() => {
    if (previewTimerRef.current === null) return
    window.clearTimeout(previewTimerRef.current)
    previewTimerRef.current = null
  }, [])

  const cancel = useCallback(() => {
    // Invalidate callbacks before aborting. SpeechRecognition may deliver a
    // late result/end event after abort(), and that result must not reinsert
    // text into a draft the user explicitly cancelled.
    attemptRef.current += 1
    clearPreviewTimer()
    const recognition = recognitionRef.current
    recognitionRef.current = null
    recognition?.abort()
    setState("idle")
  }, [clearPreviewTimer])

  const toggle = useCallback(() => {
    if (state === "listening" || state === "transcribing") {
      // Manus keeps voice capture in the same inline affordance. Re-clicking
      // that affordance cancels the pending capture without opening another
      // surface or changing the composer geometry.
      cancel()
      return
    }

    if (preview) {
      const attempt = ++attemptRef.current
      setState("listening")
      previewTimerRef.current = window.setTimeout(() => {
        if (attemptRef.current !== attempt) return
        previewTimerRef.current = window.setTimeout(() => {
          if (attemptRef.current !== attempt) return
          onDraftChangeRef.current(appendTranscript(draftRef.current, previewTranscript))
          previewTimerRef.current = null
          setState("idle")
        }, 220)
        setState("transcribing")
      }, 620)
      return
    }

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) {
      setState("error")
      return
    }

    const recognition = new Recognition()
    const attempt = ++attemptRef.current
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = document.documentElement.lang || navigator.language
    recognition.onresult = (event) => {
      if (attemptRef.current !== attempt || recognitionRef.current !== recognition) return
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ")
      setState("transcribing")
      onDraftChangeRef.current(appendTranscript(draftRef.current, transcript))
    }
    recognition.onerror = () => {
      if (attemptRef.current !== attempt || recognitionRef.current !== recognition) return
      recognitionRef.current = null
      setState("error")
    }
    recognition.onend = () => {
      if (attemptRef.current !== attempt || recognitionRef.current !== recognition) return
      recognitionRef.current = null
      setState((current) => current === "error" ? current : "idle")
    }
    recognitionRef.current = recognition
    setState("listening")
    try {
      recognition.start()
    } catch {
      if (attemptRef.current !== attempt) return
      recognitionRef.current = null
      setState("error")
    }
  }, [cancel, preview, previewTranscript, state])

  useEffect(() => () => {
    attemptRef.current += 1
    clearPreviewTimer()
    recognitionRef.current?.abort()
    recognitionRef.current = null
  }, [clearPreviewTimer])

  return { state, toggle, cancel }
}
