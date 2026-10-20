"use client"

import { useEffect, useRef } from "react"

/** URL-owned editor lifetime and focus; no transport or task mutation here. */
export function useScheduledEditorLifecycle(
  contextKey: string,
  editorOpen: boolean,
  setEditingTaskId: (value: string | null) => void,
  setInitialPrompt: (value: string) => void,
) {
  const openerRef = useRef<HTMLElement | null>(null)
  const editorGenerationRef = useRef(0)
  const mountedRef = useRef(false)
  const currentContextKeyRef = useRef(contextKey)
  const currentEditorOpenRef = useRef(editorOpen)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; editorGenerationRef.current += 1 }
  }, [])
  useEffect(() => {
    currentContextKeyRef.current = contextKey
    currentEditorOpenRef.current = editorOpen
  }, [contextKey, editorOpen])
  useEffect(() => {
    if (editorOpen) return
    editorGenerationRef.current += 1
    setEditingTaskId(null)
    setInitialPrompt("")
  }, [editorOpen, setEditingTaskId, setInitialPrompt])
  useEffect(() => {
    editorGenerationRef.current += 1
    setEditingTaskId(null)
    setInitialPrompt("")
    openerRef.current = null
  }, [contextKey, setEditingTaskId, setInitialPrompt])

  return { openerRef, editorGenerationRef, mountedRef, currentContextKeyRef, currentEditorOpenRef }
}
