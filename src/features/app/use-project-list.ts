"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import type { Project, ProjectInstructionRevisionWire } from "@/contract/project"
import { useProductReadRecheck } from "@/ui/auth/product-read-recheck-context"
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
  const reportRead401 = useProductReadRecheck()
  const admitted = !preview && boundary?.admitted === true && boundary.subject !== null
  const [refreshRequest, setRefreshRequest] = useState<{ route: object | null; revision: number }>({ route: null, revision: 0 })
  const generation = boundary?.generation
  const subject = boundary?.subject
  const report401 = useCallback((error: unknown, signal: AbortSignal) => {
    if (!signal.aborted && error instanceof ProjectReadError && error.reason === "http" && error.status === 401 && generation !== undefined)
      reportRead401?.({ subject: subject ?? null, generation, signal })
  }, [reportRead401, subject, generation])
  const tenant = boundary?.tenant
  const authHint = boundary?.authInvalidationHint
  const identityKey = useMemo(() => ({ generation, subject, tenant, authHint, admitted }), [generation, subject, tenant, authHint, admitted])
  const route = useMemo(() => ({ identityKey, projectRef }), [identityKey, projectRef])
  const key = useMemo(() => ({ identityKey, revision: refreshRequest.revision }), [identityKey, refreshRequest.revision])
  const detailKey = useMemo(() => ({ key, route }), [key, route])
  const readScopeRef = useRef<{ key: object; active: boolean; epoch: number; controllers: Set<AbortController> } | null>(null)
  const projectScopeRef = useRef<{ key: typeof detailKey; active: boolean; controllers: Set<AbortController>; detailController: AbortController | null } | null>(null)
  useLayoutEffect(() => {
    const scope = { key, active: true, epoch: 0, controllers: new Set<AbortController>() }
    readScopeRef.current = scope
    return () => {
      scope.active = false
      for (const controller of scope.controllers) controller.abort()
      scope.controllers.clear()
    }
  }, [key])
  useLayoutEffect(() => {
    const scope = { key: detailKey, active: true, controllers: new Set<AbortController>(), detailController: null }
    projectScopeRef.current = scope
    return () => {
      scope.active = false
      for (const controller of scope.controllers) {
        controller.abort()
        readScopeRef.current?.controllers.delete(controller)
      }
      scope.controllers.clear()
    }
  }, [detailKey])
  const [history, setHistory] = useState<{ key: typeof detailKey; state: ProjectReadState<ProjectInstructionRevisionWire[]> } | null>(null)
  // A durable 202 is a current-actor negative fact. Keep it over slow/failed collection refreshes.
  const [retired, setRetired] = useState<{ key: object; ids: ReadonlySet<string> } | null>(null)
  const [collection, setCollection] = useState<{ key: typeof key; state: ProjectReadState<Project[]> } | null>(null)
  const [detail, setDetail] = useState<{ key: typeof detailKey; state: ProjectReadState<Project> } | null>(null)
  const refresh = useCallback(() => {
    const route = projectScopeRef.current?.key.route ?? null
    setRefreshRequest(previous => ({ route, revision: previous.revision + 1 }))
  }, [])
  const retireProject = useCallback((target: string) => {
    if (!admitted) return
    const scope = projectScopeRef.current
    if (scope?.key.route.projectRef === target) scope.detailController?.abort()
    setRetired((current) => {
      const ids = current?.key === identityKey ? new Set(current.ids) : new Set<string>()
      ids.add(target)
      return { key: identityKey, ids }
    })
  }, [admitted, identityKey])
  const retiredIds = retired?.key === identityKey ? retired.ids : undefined

  useEffect(() => {
    const readFence = readScopeRef.current
    if (!readFence || readFence.key !== key) return
    const epoch = readFence.epoch
    let live = true
    let controller: AbortController | null = null
    queueMicrotask(() => {
      if (!live || !readFence.active || readFence.key !== key || epoch !== readFence.epoch) return
      if (!admitted) return
      controller = new AbortController()
      readFence.controllers.add(controller)
      const publish = (state: ProjectReadState<Project[]>) => setCollection(previous =>
        previous?.key === key && previous.state.status === "error" && !previous.state.retryable
          ? previous : { key, state })
      void listProjects(controller.signal).then(
        (data) => { if (live && readFence.active && epoch === readFence.epoch && !controller?.signal.aborted) publish({ status: "ready", data }) },
        (error: unknown) => {
          if (live && readFence.active && epoch === readFence.epoch && controller !== null && !controller.signal.aborted) {
            report401(error, controller.signal)
            publish({ status: "error", retryable: !denied(error) })
          }
        },
      )
    })
    return () => {
      live = false
      controller?.abort()
      if (controller !== null) readFence.controllers.delete(controller)
    }
  }, [admitted, key, report401])

  const rawList: ProjectReadState<Project[]> = !admitted
    ? { status: "blocked" }
    : collection?.key === key ? collection.state : { status: "loading" }
  const exact = detail?.key === detailKey ? detail.state : undefined
  const sameOwnerList = collection?.key.identityKey === identityKey && collection.state.status === "ready" ? collection.state : undefined
  // Keep confirmed rows during a reread, not an old "no projects" result.
  // Request eligibility still uses the fresh key, never the retained UI.
  const rail = rawList.status === "loading" && exact?.status !== "loading"
    && sameOwnerList?.data.some((item) => !retiredIds?.has(item.id)) ? sameOwnerList : rawList
  const list: ProjectReadState<Project[]> = rail.status === "ready" && retiredIds?.size
    ? { status: "ready", data: rail.data.filter((item) => !retiredIds.has(item.id)) }
    : rail
  const projectRetired = projectRef !== undefined && retiredIds?.has(projectRef) === true
  const knownProject = rawList.status === "ready" ? rawList.data.find((item) => item.id === projectRef) : undefined
  const collectionDenied = rawList.status === "error" && !rawList.retryable
  const previouslyKnown = sameOwnerList?.data.find((project) => project.id === projectRef)
  const readDetail = admitted && !projectRetired && projectRef !== undefined && !collectionDenied
    && knownProject === undefined && (rawList.status !== "loading" || previouslyKnown === undefined)
  useEffect(() => {
    if (!readDetail || projectRef === undefined) return
    const readFence = readScopeRef.current
    const projectFence = projectScopeRef.current
    if (!readFence || readFence.key !== key || !projectFence || projectFence.key !== detailKey) return
    const epoch = readFence.epoch
    queueMicrotask(() => {
      if (!readFence.active || epoch !== readFence.epoch || !projectFence.active || projectFence.detailController !== null) return
      const controller = new AbortController()
      projectFence.detailController = controller
      readFence.controllers.add(controller)
      projectFence.controllers.add(controller)
      const active = () => readFence.active && epoch === readFence.epoch && projectFence.active && !controller.signal.aborted
      void getProject(projectRef, controller.signal).then(
        (data) => { if (active()) setDetail({ key: detailKey, state: { status: "ready", data } }) },
        (error: unknown) => {
          if (!active()) return
          report401(error, controller.signal)
          // Either denial revokes both projections for this generation.
          if (denied(error)) setCollection({ key, state: { status: "error", retryable: false } })
          setDetail({ key: detailKey, state: { status: "error", retryable: !denied(error) && !(error instanceof ProjectReadError && error.status === 404) } })
        },
      )
    })
  }, [detailKey, key, projectRef, readDetail, report401])

  const sameRouteRefresh = refreshRequest.route === route && exact?.status !== "loading"
  const settledMissing = sameRouteRefresh && rawList.status === "ready" && knownProject === undefined && exact?.status !== "ready"
  const readHistory = readInstructions && admitted && !projectRetired && !settledMissing
    && projectRef !== undefined && rawList.status === "ready"
  useEffect(() => {
    const controller = new AbortController()
    let live = true
    if (readHistory && projectRef !== undefined) void listProjectInstructionRevisions(projectRef, controller.signal).then(
      (data) => { if (live && !controller.signal.aborted) setHistory({ key: detailKey, state: { status: "ready", data } }) },
      (error: unknown) => {
        if (!live || controller.signal.aborted) return
        report401(error, controller.signal)
        if (denied(error)) setCollection({ key, state: { status: "error", retryable: false } })
        setHistory({ key: detailKey, state: { status: "error", retryable: !denied(error) && !(error instanceof ProjectReadError && error.status === 404) } })
      },
    )
    return () => { live = false; controller.abort() }
  }, [detailKey, key, projectRef, readHistory, report401])

  const priorDetail = detail?.key.route === route && detail.key.key.revision >= (collection?.key.revision ?? 0) ? detail.state : undefined
  const retainedProject = sameRouteRefresh && rawList.status === "loading"
    ? priorDetail?.status === "ready" ? priorDetail.data : priorDetail?.status === "error" ? undefined : previouslyKnown
    : undefined
  const project = knownProject ?? retainedProject
  const current: ProjectReadState<Project> = !admitted || projectRef === undefined || projectRetired
    ? { status: "blocked" }
    : collectionDenied ? rawList
      : exact?.status === "ready" || exact?.status === "error" && !exact.retryable ? exact
        : knownProject === undefined && exact?.status === "error" ? exact
          : project !== undefined ? { status: "ready", data: project } : { status: "loading" }

  const instructionHistory: ProjectReadState<ProjectInstructionRevisionWire[]> = !readInstructions || !admitted || projectRef === undefined || projectRetired
    ? { status: "blocked" }
    : current.status === "error" ? current
      : rawList.status === "error" ? rawList
        : history?.key === detailKey || sameRouteRefresh && !settledMissing && history?.key.route === route && history.state.status === "ready"
          ? history.state : { status: "loading" }

  // ACK invalidates old name reads synchronously. No receipt value enters this hook.
  const refreshRenamedProject = useCallback(async (target: string, signal: AbortSignal): Promise<Project> => {
    const readFence = readScopeRef.current
    const renameFence = projectScopeRef.current
    if (!admitted || target !== projectRef || !readFence?.active || readFence.key !== key
      || !renameFence?.active || renameFence.key !== detailKey || signal.aborted) {
      throw new DOMException("Aborted", "AbortError")
    }
    const epoch = ++readFence.epoch
    // An acknowledged rename invalidates any previous generation's display.
    setDetail(previous => previous?.key === detailKey ? previous : { key: detailKey, state: { status: "loading" } })
    for (const old of readFence.controllers) old.abort()
    readFence.controllers.clear()
    for (const old of renameFence.controllers) old.abort()
    renameFence.controllers.clear()
    const controller = new AbortController()
    readFence.controllers.add(controller)
    renameFence.controllers.add(controller)
    const abort = () => controller.abort()
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) abort()
    const check = () => {
      if (!readFence.active || !renameFence.active || epoch !== readFence.epoch || controller.signal.aborted) {
        throw new DOMException("Aborted", "AbortError")
      }
    }
    try {
      const project = await getProject(target, controller.signal)
      check()
      const projects = await listProjects(controller.signal)
      check()
      // Publish both fresh owner reads together, only after the sequential barrier.
      setDetail({ key: detailKey, state: { status: "ready", data: project } })
      setCollection({ key, state: { status: "ready", data: projects } })
      return project
    } catch (error) {
      check()
      if (denied(error)) {
        setCollection({ key, state: { status: "error", retryable: false } })
        setDetail({ key: detailKey, state: { status: "error", retryable: false } })
      }
      throw error
    } finally {
      signal.removeEventListener("abort", abort)
      controller.abort()
      readFence.controllers.delete(controller)
      renameFence.controllers.delete(controller)
    }
  }, [admitted, projectRef, detailKey, key])

  const unavailable = list.status === "error" || current.status === "error"
  const context = useMemo(() => ({ generation, subject, admitted, projectRef, preview, unavailable }), [generation, subject, admitted, projectRef, preview, unavailable])
  return { list, current, instructionHistory, context, refresh, retireProject, refreshRenamedProject }
}
