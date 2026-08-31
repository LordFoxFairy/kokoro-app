import { z } from "zod"

const sharedTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  shared_at: z.string().datetime(),
}).strict()

const sharedFileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  media_type: z.string().min(1),
  shared_at: z.string().datetime(),
}).strict()

const archivedTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  archived_at: z.string().datetime(),
}).strict()

const authorizedAppSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  authorized_at: z.string().datetime(),
}).strict()

const cloudBrowserSiteSchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1),
  last_used_at: z.string().datetime().nullable(),
}).strict()

const summarySchema = z.object({
  shared_tasks: z.array(sharedTaskSchema),
  shared_files: z.array(sharedFileSchema),
  archived_tasks: z.array(archivedTaskSchema),
  authorized_apps: z.array(authorizedAppSchema),
  cloud_browser: z.object({
    persist_sign_in: z.boolean(),
    sites: z.array(cloudBrowserSiteSchema),
  }).strict(),
}).strict()

const dataEnvelope = <T extends z.ZodTypeAny>(inner: T) => z.object({
  data: inner,
  ok: z.boolean().optional(),
  request_id: z.string().optional(),
}).strict()
const errorEnvelope = z.object({ error: z.object({ code: z.string(), message: z.string() }).passthrough() }).passthrough()

export type SharedTask = z.infer<typeof sharedTaskSchema>
export type SharedFile = z.infer<typeof sharedFileSchema>
export type ArchivedTask = z.infer<typeof archivedTaskSchema>
export type AuthorizedApp = z.infer<typeof authorizedAppSchema>
export type CloudBrowserSite = z.infer<typeof cloudBrowserSiteSchema>

export type DataManagementSummary = {
  sharedTasks: SharedTask[]
  sharedFiles: SharedFile[]
  archivedTasks: ArchivedTask[]
  authorizedApps: AuthorizedApp[]
  cloudBrowser: { persistSignIn: boolean; sites: CloudBrowserSite[] }
}

export type DataManagementClient = {
  summary: () => Promise<DataManagementSummary>
  setCloudBrowserPersistence: (enabled: boolean) => Promise<{ persistSignIn: boolean }>
  revokeAuthorizedApp: (appId: string) => Promise<void>
  removeCloudBrowserSite: (siteId: string) => Promise<void>
}

export class DataManagementClientError extends Error {
  readonly code: string | null
  readonly status: number | null

  constructor(message: string, code: string | null, status: number | null) {
    super(message)
    this.name = "DataManagementClientError"
    this.code = code
    this.status = status
  }
}

const BASE = "/api/settings/data-management"

async function readError(response: Response): Promise<DataManagementClientError> {
  const raw: unknown = await response.json().catch(() => null)
  const parsed = errorEnvelope.safeParse(raw)
  return new DataManagementClientError(
    parsed.success && parsed.data.error.message
      ? parsed.data.error.message
      : `data-management request failed with status ${response.status}`,
    parsed.success ? parsed.data.error.code : null,
    response.status,
  )
}

async function request<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  init?: RequestInit,
): Promise<z.infer<T>> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, { cache: "no-store", ...init })
  } catch (error) {
    throw new DataManagementClientError(error instanceof Error ? error.message : String(error), null, null)
  }
  if (!response.ok) throw await readError(response)
  return dataEnvelope(schema).parse(await response.json()).data
}

function mapSummary(raw: z.infer<typeof summarySchema>): DataManagementSummary {
  return {
    sharedTasks: raw.shared_tasks,
    sharedFiles: raw.shared_files,
    archivedTasks: raw.archived_tasks,
    authorizedApps: raw.authorized_apps,
    cloudBrowser: {
      persistSignIn: raw.cloud_browser.persist_sign_in,
      sites: raw.cloud_browser.sites,
    },
  }
}

export function createDataManagementClient(): DataManagementClient {
  return {
    summary: async () => mapSummary(await request("", summarySchema)),
    setCloudBrowserPersistence: async (enabled) => {
      const result = await request(
        "/cloud-browser",
        z.object({ persist_sign_in: z.boolean() }).strict(),
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ persist_sign_in: enabled }),
        },
      )
      return { persistSignIn: result.persist_sign_in }
    },
    revokeAuthorizedApp: async (appId) => {
      await request(`/authorized-apps/${encodeURIComponent(appId)}`, z.null(), { method: "DELETE" })
    },
    removeCloudBrowserSite: async (siteId) => {
      await request(`/cloud-browser/sites/${encodeURIComponent(siteId)}`, z.null(), { method: "DELETE" })
    },
  }
}
