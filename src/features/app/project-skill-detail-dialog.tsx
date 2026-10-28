"use client"

import { useMemo, type RefObject } from "react"
import type { PersonalInstallation, SkillCatalogCard } from "@/hub/schemas"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { ManusSkillDetailDialog } from "@/ui/skills/manus-skill-detail-dialog"

/** Exact Project locator and focus host only; the existing reader owns metadata/package/download. */
export function ProjectSkillDetailDialog({ projectId, item, boundary, onClose, returnFocusRef }: {
  projectId: string; item: PersonalInstallation; boundary: ProjectReadBoundary;
  onClose: () => void; returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const target = useMemo(() => ({ project_id: projectId, installation_id: item.installation_id, source_ref: item.source_ref, revision: item.revision }), [projectId, item.installation_id, item.source_ref, item.revision])
  const card: SkillCatalogCard = {
    skill_id: item.series_id, revision_skill_id: item.source_ref.slice(6), installation_id: item.installation_id,
    source_ref: item.source_ref, installed_source_ref: item.source_ref, name: item.display_name,
    description: item.summary, content_hash: item.series_id, scope: item.product.source_kind ?? "unknown",
    installed: item.installed, enabled: item.enabled, source_status: item.source_status,
  }
  return <ManusSkillDetailDialog detailSource="project-installation" projectTarget={target}
    readBoundary={boundary} skill={boundary.admitted ? card : null} pending={!boundary.admitted}
    open onOpenChange={open => { if (!open) onClose() }} returnFocusRef={returnFocusRef} />
}
