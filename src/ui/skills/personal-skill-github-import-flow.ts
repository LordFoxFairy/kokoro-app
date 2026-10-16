import { HubClientError, createSkillInstallationClient } from "@/hub/client"
import { createSkillGithubImportClient } from "@/hub/skill-github-import-client"
import { githubDraftSchema, githubPreviewSchema, githubSelectorSchema, type GithubSelector } from "@/hub/skill-github-import.schema"
import { createSkillPublishClient } from "@/hub/skill-publish-client"
import type { z } from "zod"

type Stage = "preview" | "import" | "read" | "publish" | "install"
export type GithubImported = Readonly<{ name: string; repository: string; skill_id: string; source_ref: string; installation_id: string }>
export type GithubFlowState = Readonly<{ kind: "idle" | "running" | "select" | "ready" | "unknown" | "failed" | "completed"; stage?: Stage; paths?: readonly string[]; commit?: string; path?: string; name?: string; code?: string; result?: GithubImported; skillId?: string }>
export function createPersonalSkillGithubImportFlow(options: { github: ReturnType<typeof createSkillGithubImportClient>; publish: Pick<ReturnType<typeof createSkillPublishClient>, "publishDraft" | "getManaged">; installation: Pick<ReturnType<typeof createSkillInstallationClient>, "install">; subject: string; key?: () => string }) {
  let state: GithubFlowState = { kind: "idle" }, admitted = false
  let repositoryUrl: string | undefined, selector: GithubSelector | undefined, choices: z.infer<typeof githubPreviewSchema> | undefined
  let draft: z.infer<typeof githubDraftSchema> | undefined, name: string | undefined, series: string | undefined
  let importKey: string | undefined, publishKey: string | undefined, installKey: string | undefined
  let published: Awaited<ReturnType<typeof options.publish.publishDraft>> | undefined
  let publishBody: { audience: "owner"; expected_state_version: string } | undefined
  let active: { controller: AbortController; stage: Stage } | undefined
  const listeners = new Set<() => void>(), key = options.key ?? (() => crypto.randomUUID())
  const update = (next: GithubFlowState) => { state = Object.freeze(next); for (const listener of listeners) listener() }
  const cancel = () => { if (!active) return; const old = active; active = undefined; old.controller.abort(); update({ kind: old.stage === "preview" ? "failed" : "unknown", stage: old.stage, ...(draft ? { skillId: draft.skill_id } : {}) }) }
  const run = async (first: Stage) => {
    if (active || !admitted || !options.subject) return
    const running = { controller: new AbortController(), stage: first }; active = running
    const signal = running.controller.signal
    const current = () => { signal.throwIfAborted(); if (active !== running || !admitted) throw new Error("retired GitHub intent") }
    const stage = (next: Stage) => { current(); running.stage = next; update({ kind: "running", stage: next, ...(draft ? { skillId: draft.skill_id } : {}) }) }
    try {
      stage(first)
      if (first === "preview") {
        const value = githubPreviewSchema.parse(await options.github.preview({ repository_url: repositoryUrl! }, signal)); current(); choices = value
        if (value.selection_required) { update({ kind: "select", paths: value.paths, commit: value.commit }); return }
        selector = Object.freeze({ ...value.selector }); name = value.metadata.display_name
        update({ kind: "ready", name, commit: selector.commit, path: selector.path }); return
      }
      if (!selector) throw new Error("immutable selector missing")
      if (!draft) {
        stage("import"); importKey ??= key()
        const value = githubDraftSchema.parse(await options.github.import(selector, importKey, signal)); current()
        if (choices && !choices.selection_required && value.content_digest !== choices.content_sha256) throw new HubClientError("parse", "GitHub immutable content mismatch", null, 201)
        draft = value
      }
      if (!series) {
        stage("read")
        const record = await options.publish.getManaged(draft.skill_id, signal); current()
        if (record.skill_id !== draft.skill_id || record.source_ref !== draft.source_ref) throw new HubClientError("parse", "GitHub draft identity mismatch", null, 200)
        series = record.series_id; name = record.name
      }
      if (!published) {
        stage("publish"); publishKey ??= key(); publishBody ??= Object.freeze({ audience: "owner", expected_state_version: draft.state_version })
        const value = await options.publish.publishDraft(draft.skill_id, publishBody, publishKey, signal); current()
        if (value.source_ref !== draft.source_ref || value.status !== "active") throw new HubClientError("parse", "GitHub publish identity mismatch", null, 200)
        published = value
      }
      stage("install"); installKey ??= key()
      const receipt = await options.installation.install(draft.source_ref, installKey, signal); current()
      const installation = receipt.installation
      if (installation.source_ref !== draft.source_ref || installation.series_id !== series || installation.revision !== published.revision || !installation.installed || !installation.enabled || installation.source_status !== "active" || installation.product.publication_audience !== "owner") throw new HubClientError("parse", "GitHub installation ACK mismatch", null, 200)
      update({ kind: "completed", result: { name: name!, repository: repositoryUrl!, skill_id: draft.skill_id, source_ref: draft.source_ref, installation_id: installation.installation_id } })
    } catch (error) {
      if (active !== running) return
      const uncertain = running.stage !== "preview" && (signal.aborted || !(error instanceof HubClientError) || ["network", "parse", "aborted"].includes(error.reason) || error.code === "skill_command_in_progress")
      update({ kind: uncertain ? "unknown" : "failed", stage: running.stage, ...(draft ? { skillId: draft.skill_id } : {}), ...(error instanceof HubClientError && error.code ? { code: error.code } : {}) })
    } finally { if (active === running) active = undefined }
  }
  const clearIntent = () => { repositoryUrl = undefined; name = undefined; selector = undefined; draft = undefined; series = undefined; importKey = undefined; publishKey = undefined; installKey = undefined; choices = undefined; published = undefined; publishBody = undefined; update({ kind: "idle" }) }
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }, getSnapshot: () => state,
    setAdmitted: (value: boolean) => { admitted = value; if (!value) cancel() }, cancel,
    // Rechecks retire read-only choices and acknowledged result presentation,
    // not an unresolved write's immutable selector or command keys.
    retireRead: () => { cancel(); if (["select", "ready", "completed"].includes(state.kind)) clearIntent() },
    retire: () => { admitted = false; cancel(); clearIntent() },
    finishCompleted: () => { if (state.kind === "completed") clearIntent() },
    preview: async (url: string) => { if (active || state.kind !== "idle" && !(state.kind === "failed" && state.stage === "preview")) return; repositoryUrl = url; await run("preview") },
    select: (path: string) => { if (state.kind !== "select" || !choices?.selection_required || !choices.paths.includes(path)) return; const [owner, repository] = choices.repository_url.slice("https://github.com/".length).split("/"); selector = Object.freeze(githubSelectorSchema.parse({ owner, repository, commit: choices.commit, path })); update({ kind: "ready", commit: selector.commit, path: selector.path }) },
    confirm: () => state.kind === "ready" ? run("import") : Promise.resolve(),
    retry: () => (state.kind === "unknown" || state.kind === "failed") && state.stage ? run(state.stage) : Promise.resolve(),
  }
}
