// A session belongs either to the user's direct-chat inbox or to one opaque
// project reference. This is product context, never a tenant/site identity.
export type SessionScope =
  | { kind: "direct" }
  | { kind: "project"; projectRef: string }

export const DIRECT_SESSION_SCOPE: SessionScope = { kind: "direct" }

export function sessionScopeKey(scope: SessionScope): string {
  return scope.kind === "direct" ? "direct" : `project:${scope.projectRef}`
}
