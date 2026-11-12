"use client"

import { useCallback, useId, useLayoutEffect, useRef, useState } from "react"
import { z } from "zod"

import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/context"

import styles from "./project-todo-section.module.css"

const statuses = ["todo", "in_progress", "done"] as const
type Status = typeof statuses[number]
export type ProjectTodoTask = Readonly<{ id: string; title: string; status: Status; revision: string }>

function titleValue(raw: string): string | null {
  const title = raw.trim()
  return title && [...title].length <= 160 && !/[\p{Cc}\p{Cs}]/u.test(title) ? title : null
}

// Private browser journal, not a second HTTP schema. The generated transport
// owns encoding and ACK validation; this only checks locally recoverable intent.
const opaque = z.string().min(1).max(512)
const localTitle = z.string().refine(value => titleValue(value) === value)
const localKey = z.string().uuid()
const target = { key: localKey, taskId: opaque, revision: opaque }
const intentShape = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), key: localKey, title: localTitle }).strict(),
  z.object({ kind: z.literal("update"), ...target, title: localTitle.optional(), status: z.enum(statuses).optional() }).strict(),
  z.object({ kind: z.literal("delete"), ...target }).strict(),
])
const journalShape = z.object({ subject: opaque, projectId: opaque, intent: intentShape }).strict()

export type ProjectTodoIntent = Readonly<z.infer<typeof intentShape>>
export type ProjectTodoWriteResult = "ok" | "unknown" | "stale" | "capacity" | "key-conflict" | "denied" | "rejected"
type ListResult = { kind: "ok"; tasks: readonly ProjectTodoTask[] } | { kind: "denied" | "unavailable" }
export type ProjectTodoClient = {
  list: (projectId: string, signal: AbortSignal) => Promise<ListResult>
  write: (projectId: string, intent: ProjectTodoIntent, signal: AbortSignal) => Promise<ProjectTodoWriteResult>
}

type Props = Readonly<{ projectId: string; subject: string; generation: number; client: ProjectTodoClient }>
type Journal = "checking" | "available" | "blocked" | ProjectTodoIntent
type ReadState = "loading" | "ready" | "unavailable" | "denied"
type Notice = Exclude<ProjectTodoWriteResult, "ok" | "unknown" | "denied">
type Edit = { base: ProjectTodoTask; title: string; status: Status; stale: boolean }
const noticeText = {
  stale: "projectTodo.stale", capacity: "projectTodo.capacity",
  "key-conflict": "projectTodo.keyConflict", rejected: "projectTodo.rejected",
} as const

function journalKey(subject: string, projectId: string) {
  return "kokoro.web.project-todo.v1:" + JSON.stringify([subject, projectId])
}

function restoredIntent(value: string | null, subject: string, projectId: string): Journal {
  if (value === null) return "available"
  if (value.length > 4096) return "blocked"
  const parsed = journalShape.safeParse(JSON.parse(value))
  if (!parsed.success || parsed.data.subject !== subject || parsed.data.projectId !== projectId) return "blocked"
  const { intent } = parsed.data
  if (intent.kind === "update" && intent.title === undefined && intent.status === undefined) return "blocked"
  return Object.freeze(intent)
}

function overviewRoute(projectId: string): string | null {
  const { pathname, search, hash } = window.location
  if (pathname !== `/app/project/${encodeURIComponent(projectId)}` || new URLSearchParams(search).has("conversation")) return null
  return pathname + search + hash
}

export function ProjectTodoSection(props: Props) {
  // Unmount the old Project/subject/admission lifetime before rendering new data.
  return <ProjectTodoScope key={JSON.stringify([props.projectId, props.subject, props.generation, typeof window === "undefined" ? null : overviewRoute(props.projectId)])} {...props} />
}

function ProjectTodoScope({ projectId, subject, client }: Props) {
  const t = useT()
  const heading = useId()
  const key = journalKey(subject, projectId)
  const [readState, setReadState] = useState<ReadState>("loading")
  const [tasks, setTasks] = useState<readonly ProjectTodoTask[]>([])
  const [journal, setJournal] = useState<Journal>("checking")
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [draft, setDraft] = useState("")
  const [edit, setEdit] = useState<Edit | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProjectTodoTask | null>(null)
  const scopeRef = useRef<AbortController | null>(null)
  const routeRef = useRef<string | null>(null)
  const readEpoch = useRef(0)
  const flight = useRef(false)
  const deleteOpener = useRef<HTMLButtonElement | null>(null)
  const titleHeading = useRef<HTMLHeadingElement | null>(null)

  const current = useCallback((scope: AbortController) => {
    return !scope.signal.aborted && scopeRef.current === scope &&
      routeRef.current !== null && overviewRoute(projectId) === routeRef.current
  }, [projectId])

  const read = useCallback(async (scope: AbortController) => {
    if (!current(scope)) return
    const epoch = ++readEpoch.current
    setReadState("loading")
    let outcome: ListResult
    try { outcome = await client.list(projectId, scope.signal) }
    catch { outcome = { kind: "unavailable" } }
    if (!current(scope) || readEpoch.current !== epoch) return
    if (outcome.kind === "ok") {
      setTasks(outcome.tasks)
      setReadState("ready")
    } else {
      if (outcome.kind === "denied") setTasks([])
      setReadState(outcome.kind)
    }
  }, [client, projectId, current])

  useLayoutEffect(() => {
    const scope = new AbortController()
    scopeRef.current = scope
    routeRef.current = overviewRoute(projectId)
    const retire = () => {
      if (current(scope)) return
      scope.abort()
      if (scopeRef.current === scope) scopeRef.current = null
    }
    // navigateMountedSurface changes the URL and emits synchronously, before
    // React can replace this Project's rendered subtree.
    window.addEventListener("kokoro:surface-navigation", retire)
    window.addEventListener("popstate", retire)
    window.addEventListener("hashchange", retire)
    retire()
    queueMicrotask(() => {
      if (!current(scope)) return
      try { setJournal(restoredIntent(window.sessionStorage.getItem(key), subject, projectId)) }
      catch { setJournal("blocked") }
      void read(scope)
    })
    return () => {
      window.removeEventListener("kokoro:surface-navigation", retire)
      window.removeEventListener("popstate", retire)
      window.removeEventListener("hashchange", retire)
      scope.abort()
      if (scopeRef.current === scope) scopeRef.current = null
    }
  }, [key, subject, projectId, read, current])

  const refresh = () => {
    const scope = scopeRef.current
    if (scope && current(scope)) void read(scope)
  }

  const recovered = typeof journal === "object" ? journal : null
  const canWrite = readState === "ready" && journal === "available" && !pending
  const dispatch = async (intent: ProjectTodoIntent, retry = false) => {
    const scope = scopeRef.current
    if (!scope || !current(scope) || flight.current || readState !== "ready" ||
        (retry ? recovered !== intent : journal !== "available")) return
    const parsed = intentShape.safeParse(intent)
    if (!parsed.success) { setJournal("blocked"); return }
    const frozen = Object.freeze(parsed.data)
    // Canonical local field order is the same before send and after decoding
    // on a fresh mount, so an original retry can compare the entire record.
    const record = JSON.stringify({ subject, projectId, intent: frozen })
    try {
      const storage = window.sessionStorage
      const prior = storage.getItem(key)
      if (prior !== (retry ? record : null)) throw new Error("project_todo_journal_changed")
      storage.setItem(key, record)
    } catch {
      setJournal("blocked")
      return
    }
    if (!current(scope)) return
    flight.current = true
    setPending(true)
    setNotice(null)
    let outcome: ProjectTodoWriteResult
    try { outcome = await client.write(projectId, frozen, scope.signal) }
    catch { outcome = "unknown" }
    if (!current(scope)) return
    flight.current = false
    setPending(false)
    if (outcome === "unknown") {
      setJournal(frozen)
      return
    }
    try {
      const storage = window.sessionStorage
      if (storage.getItem(key) !== record) throw new Error("project_todo_journal_changed")
      storage.removeItem(key)
      setJournal("available")
    } catch { setJournal("blocked") }
    if (outcome === "ok") {
      if (frozen.kind === "create") setDraft("")
      if (frozen.kind === "update") setEdit(null)
      void read(scope)
    } else if (outcome === "denied") {
      readEpoch.current++
      setTasks([])
      setEdit(null)
      setDraft("")
      setReadState("denied")
    } else {
      setNotice(outcome)
      if (outcome === "stale") {
        if (frozen.kind === "update") {
          const task = tasks.find(item => item.id === frozen.taskId)
          setEdit(current => current?.base.id === frozen.taskId ? { ...current, stale: true } : task
            ? { base: { ...task, revision: frozen.revision }, title: frozen.title ?? task.title, status: frozen.status ?? task.status, stale: true } : null)
        }
        void read(scope)
      }
    }
  }

  const start = (changes: Omit<Extract<ProjectTodoIntent, { kind: "create" }>, "key"> |
    Omit<Extract<ProjectTodoIntent, { kind: "update" }>, "key"> | Omit<Extract<ProjectTodoIntent, { kind: "delete" }>, "key">) => {
    if (!canWrite || flight.current) return
    let commandKey: string
    try { commandKey = crypto.randomUUID() }
    catch { setJournal("blocked"); return }
    void dispatch({ ...changes, key: commandKey })
  }

  const createTitle = titleValue(draft)
  const editTitle = edit && titleValue(edit.title)
  const changed = edit !== null && (editTitle !== edit.base.title || edit.status !== edit.base.status)
  const currentEdit = edit?.stale ? tasks.find(task => task.id === edit.base.id) : null
  const statusText = { todo: t("projectTodo.todo"), in_progress: t("projectTodo.inProgress"), done: t("projectTodo.done") }
  const editor = edit && (<form className={styles.controls} onSubmit={event => {
    event.preventDefault()
    if (!edit.stale && changed && editTitle) start({ kind: "update", taskId: edit.base.id, revision: edit.base.revision,
      ...(editTitle !== edit.base.title ? { title: editTitle } : {}), ...(edit.status !== edit.base.status ? { status: edit.status } : {}) })
  }}>
    <label className={styles.field}>
      {t("firstSite.title")}
      <Input autoFocus value={edit.title} disabled={pending || recovered !== null}
        onChange={event => setEdit({ ...edit, title: event.target.value })} />
    </label>
    <label className={styles.field}>
      {t("projectTodo.status")}
      <select value={edit.status} disabled={pending || recovered !== null}
        onChange={event => {
          const status = statuses.find(value => value === event.target.value)
          if (status) setEdit({ ...edit, status })
        }}>
        {statuses.map(status => <option value={status} key={status}>{statusText[status]}</option>)}
      </select>
    </label>
    {edit.stale ? <Button type="button" disabled={!canWrite || !currentEdit} onClick={event => {
      // React can reuse this DOM button as Submit before the click's default action.
      event.preventDefault()
      if (!currentEdit) return
      setEdit({ base: currentEdit, title: edit.title === edit.base.title ? currentEdit.title : edit.title,
        status: edit.status === edit.base.status ? currentEdit.status : edit.status, stale: false })
      setNotice(null)
    }}>{t("projectTodo.review")}</Button> :
    <Button type="submit" disabled={!canWrite || !changed || !editTitle}>{t("firstSite.save")}</Button>}
    <Button type="button" variant="ghost" disabled={pending || recovered !== null} onClick={() => setEdit(null)}>{t("firstSite.cancel")}</Button>
  </form>)

  return <section className={styles.section} aria-labelledby={heading} data-testid="project-todo">
    <h2 id={heading} ref={titleHeading} tabIndex={-1} className={styles.heading}>{t("projectTodo.heading")}</h2>
    {readState === "denied" ? <p role="alert">{t("projectTodo.denied")}</p> : <>
      <form className={styles.controls} onSubmit={event => {
        event.preventDefault()
        if (createTitle) start({ kind: "create", title: createTitle })
      }}>
        <label className={styles.field}>
          {t("projectTodo.newTitle")}
          <Input value={draft} disabled={!canWrite} onChange={event => setDraft(event.target.value)} />
        </label>
        <Button type="submit" disabled={!canWrite || !createTitle}>{t("firstSite.add")}</Button>
      </form>
      {readState === "loading" && <p role="status">{t("settings.loading")}</p>}
      {pending && <p role="status">{t("projectTodo.saving")}</p>}
      {readState === "unavailable" && <div className={styles.controls}>
        <p role="alert">{t("projectTodo.readFailed")}</p>
        <Button type="button" variant="outline" onClick={refresh}>{t("firstSite.retry")}</Button>
      </div>}
      {journal === "blocked" && <p role="alert">{t("projectTodo.storageFailed")}</p>}
      {recovered !== null && <div className={styles.controls}>
        <p role="alert">{t("projectTodo.unknown")}</p>
        <Button type="button" variant="outline" disabled={pending || readState !== "ready"} onClick={() => void dispatch(recovered, true)}>{t("projectTodo.retryOriginal")}</Button>
      </div>}
      {notice !== null && <p role="alert">{t(noticeText[notice])}</p>}
      {readState === "ready" && tasks.length === 0 && <p>{t("projectTodo.empty")}</p>}
      {tasks.length > 0 && <ul className={styles.tasks}>{tasks.map(task => <li className={styles.task} key={task.id}>
        <div className={styles.controls}>
          <div className={styles.label}><h3>{task.title}</h3><p>{statusText[task.status]}</p></div>
          <Button type="button" variant="outline" disabled={!canWrite || edit !== null} onClick={() => setEdit({ base: task, title: task.title, status: task.status, stale: false })}>{t("firstSite.edit")}</Button>
          <Button type="button" variant="outline" disabled={!canWrite || edit !== null} onClick={event => {
            deleteOpener.current = event.currentTarget
            setDeleteTarget(task)
          }}>{t("projectTodo.delete")}</Button>
        </div>
        {edit?.base.id === task.id && editor}
      </li>)}</ul>}
      {edit !== null && !tasks.some(task => task.id === edit.base.id) && editor}
      <AlertDialog open={deleteTarget !== null} onOpenChange={open => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent size="sm" onCloseAutoFocus={event => {
          const opener = deleteOpener.current
          if (opener?.isConnected && !opener.disabled) { event.preventDefault(); opener.focus() }
          else if (titleHeading.current) { event.preventDefault(); titleHeading.current.focus() }
        }}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("projectTodo.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("projectTodo.deleteDescription", { title: deleteTarget?.title ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("firstSite.cancel")}</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={!canWrite || deleteTarget === null} onClick={() => {
              if (!deleteTarget || !canWrite) return
              start({ kind: "delete", taskId: deleteTarget.id, revision: deleteTarget.revision })
              setDeleteTarget(null)
            }}>{t("projectTodo.delete")}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>}
  </section>
}
