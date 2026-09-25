// Presentation-only permission hints from the BFF/IAM role catalog. IAM remains authoritative.
import type { TeamRole } from "./client"

function permissions(assigned: readonly string[], catalog: readonly TeamRole[]): Set<string> | null {
  const byName = new Map(catalog.map((role) => [role.name, role]))
  const result = new Set<string>()
  for (const name of assigned) {
    const role = byName.get(name)
    if (role === undefined) return null
    for (const [resource, actions] of Object.entries(role.permissions)) {
      for (const action of actions ?? []) result.add(`${resource}:${action}`)
    }
  }
  return result
}

function has(assigned: readonly string[], catalog: readonly TeamRole[], permission: string): boolean {
  return permissions(assigned, catalog)?.has(permission) ?? false
}

export function canInvite(actor: readonly string[], catalog: readonly TeamRole[]): boolean {
  return has(actor, catalog, "invitation:create")
}

export function canManageInvitations(actor: readonly string[], catalog: readonly TeamRole[]): boolean {
  return has(actor, catalog, "invitation:cancel")
}

export function canReadInvitations(actor: readonly string[], catalog: readonly TeamRole[]): boolean {
  return has(actor, catalog, "invitation:read")
}

export function canRemoveMember(actor: readonly string[], target: readonly string[], catalog: readonly TeamRole[]): boolean {
  return has(actor, catalog, "member:delete") && (!target.includes("owner") || actor.includes("owner"))
}

export function canReplaceMemberRoles(
  actor: readonly string[], current: readonly string[], replacement: readonly string[], catalog: readonly TeamRole[],
): boolean {
  const actorPermissions = permissions(actor, catalog)
  const replacementPermissions = permissions(replacement, catalog)
  if (actorPermissions === null || replacementPermissions === null || !actorPermissions.has("member:update")) return false
  if (current.includes("owner") !== replacement.includes("owner") && !actor.includes("owner")) return false
  return actor.includes("owner") || [...replacementPermissions].every((permission) => actorPermissions.has(permission))
}
