"use client"

import { useLayoutEffect, useMemo } from "react"

import { createScheduledTaskClient } from "@/features/scheduled-tasks"
import type { ProjectReadBoundary } from "./use-session-state"

function scopedClient(subject: string | null) {
  let admission: ProjectReadBoundary | null = null
  return {
    client: createScheduledTaskClient(fetch, () =>
      admission?.admitted && subject !== null && admission.subject === subject
        ? admission.generation
        : null,
    ),
    admit: (next: ProjectReadBoundary) => {
      admission = next
    },
    retire: () => {
      admission = null
    },
  }
}

/** Keep unknown commands for a rechecked actor, never for a replacement actor. */
export function useScheduledTaskClient(boundary: ProjectReadBoundary) {
  const binding = useMemo(
    () => scopedClient(boundary.subject),
    [boundary.subject],
  )
  useLayoutEffect(() => {
    binding.admit(boundary)
    return () => binding.retire()
  }, [binding, boundary])
  return binding.client
}
