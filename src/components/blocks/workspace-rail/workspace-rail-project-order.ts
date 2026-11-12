import { useMemo, useSyncExternalStore } from "react"
import { z } from "zod"

import { createPersistedStore } from "@/lib/persisted-store"
import { readBrowserInvalidationHint, type ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { readBrowserAuthIndexSubject } from "@/ui/shell/page-clients"

const projectIdsSchema = z.array(z.string().min(1)).refine((ids) => new Set(ids).size === ids.length)
const empty = () => null
const unsubscribe = () => {}
const subscribeToNothing = () => unsubscribe

/** Only the verified account's browser presentation preference, never Project records. */
export function useProjectRailOrder(boundary: ProjectReadBoundary | undefined, enabled: boolean) {
  const subject = enabled && boundary?.admitted ? boundary.subject : null
  const tenant = enabled && boundary?.admitted ? boundary.tenant : undefined
  const authInvalidationHint = boundary?.authInvalidationHint
  const key = subject && tenant && authInvalidationHint !== undefined ? JSON.stringify([tenant, subject]) : null
  const store = useMemo(() => key === null ? null : createPersistedStore({
    key: `kokoro.web.project-rail-order:${key}`,
    schema: projectIdsSchema,
  }), [key])
  const saved = useSyncExternalStore(store?.subscribe ?? subscribeToNothing, store?.read ?? empty, empty)

  return store === null ? null : {
    saved,
    scopeKey: JSON.stringify([key, boundary?.generation, authInvalidationHint]),
    write(ids: string[]) {
      // The two markers only veto an old gesture. They never grant admission
      // or supply the account key, even before the storage event is delivered.
      try {
        if (readBrowserAuthIndexSubject() === subject && readBrowserInvalidationHint() === authInvalidationHint) store.write(ids)
      } catch { /* Browser storage is optional. */ }
    },
  }
}
