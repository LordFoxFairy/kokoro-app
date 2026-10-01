"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import type { Project, ProjectInstructionRevisionWire } from "@/contract/project"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { getProject, listProjects, listProjectInstructionRevisions, ProjectReadError } from "./project-list"

export type ProjectReadState<T> =
  | { status: "blocked" | "loading" }
  | { status: "error"; retryable: boolean }
  | { status: "ready"; data: T }

function denied(error: unknown): boolean {
  return error instanceof ProjectReadError && (error.status === 401 || error.status === 403)
}

/** Page-owned collection/detail generations; no persistent or cross-user cache. */
export function useProjectList(preview: boolean, boundary: ProjectReadBoundary | undefined, projectRef?: string, readInstructions = false) {
  const admitted = !preview && boundary?.admitted === true && boundary.subject !== null
  const [revision, setRevision] = useState(0)
  const generation = boundary?.generation
  const subject = boundary?.subject
  const key = useMemo(() => ({ generation, subject, admitted, revision }), [generation, subject, admitted, revision])
  const [history, setHistory] = useState<{ key: object; state: ProjectReadState<ProjectInstructionRevisionWire[]> } | null>(null)
  const [collection, setCollection] = useState<{ key: object; state: ProjectReadState<Project[]> } | null>(null)
  const [detail, setDetail] = useState<{ key: object; state: ProjectReadState<Project> } | null>(null)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    let live = true
    queueMicrotask(() => { if (live) setCollection(null) })
    if (admitted) void listProjects(controller.signal).then(
      (data) => { if (live && !controller.signal.aborted) setCollection({ key, state: { status: "ready", data } }) },
      (error: unknown) => {
        if (live && !controller.signal.aborted) setCollection({ key, state: { status: "error", retryable: !denied(error) } })
      },
    )
    return () => { live = false; controller.abort() }
  }, [admitted, key])

  const list: ProjectReadState<Project[]> = !admitted
    ? { status: "blocked" }
    : collection?.key === key ? collection.state : { status: "loading" }
  const knownProject = list.status === "ready" ? list.data.find((item) => item.id === projectRef) : undefined
  const detailKey = useMemo(() => ({ key, projectRef }), [key, projectRef])
  const readDetail = admitted && projectRef !== undefined && list.status === "ready" && knownProject === undefined
  useEffect(() => {
    const controller = new AbortController()
    let live = true
    queueMicrotask(() => { if (live) setDetail(null) })
    if (readDetail && projectRef !== undefined) void getProject(projectRef, controller.signal).then(
      (data) => { if (live && !controller.signal.aborted) setDetail({ key: detailKey, state: { status: "ready", data } }) },
      (error: unknown) => {
        if (!live || controller.signal.aborted) return
        // A denial on either read revokes the whole earlier Project projection.
        if (denied(error)) setCollection({ key, state: { status: "error", retryable: false } })
        setDetail({ key: detailKey, state: { status: "error", retryable: !denied(error) && !(error instanceof ProjectReadError && error.status === 404) } })
      },
    )
    return () => { live = false; controller.abort() }
  }, [detailKey, key, projectRef, readDetail])

  const readHistory = readInstructions && admitted && projectRef !== undefined && list.status === "ready"
  useEffect(() => {
    const controller = new AbortController()
    let live = true
    if (readHistory && projectRef !== undefined) void listProjectInstructionRevisions(projectRef, controller.signal).then(
      (data) => { if (live && !controller.signal.aborted) setHistory({ key: detailKey, state: { status: "ready", data } }) },
      (error: unknown) => {
        if (!live || controller.signal.aborted) return
        if (denied(error)) setCollection({ key, state: { status: "error", retryable: false } })
        setHistory({ key: detailKey, state: { status: "error", retryable: !denied(error) && !(error instanceof ProjectReadError && error.status === 404) } })
      },
    )
    return () => { live = false; controller.abort() }
  }, [detailKey, key, projectRef, readHistory])

  const current: ProjectReadState<Project> = !admitted || projectRef === undefined
    ? { status: "blocked" }
    : knownProject !== undefined ? { status: "ready", data: knownProject }
      : list.status === "error" ? list
        : detail?.key === detailKey ? detail.state : { status: "loading" }

  const instructionHistory: ProjectReadState<ProjectInstructionRevisionWire[]> = !readInstructions || !admitted || projectRef === undefined
    ? { status: "blocked" }
    : current.status === "error" ? current
      : list.status === "error" ? list
        : history?.key === detailKey ? history.state : { status: "loading" }

  const unavailable = list.status === "error" || current.status === "error"
  const context = useMemo(() => ({ generation, subject, admitted, projectRef, preview, unavailable }), [generation, subject, admitted, projectRef, preview, unavailable])
  return { list, current, instructionHistory, context, refresh }
}
