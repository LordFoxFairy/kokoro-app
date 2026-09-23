import { interactionMethodNotAllowed, redirectAuthInteraction } from "@/lib/server/iam-interaction-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET(request: Request): Response {
  return redirectAuthInteraction(request, "/auth/select-tenant")
}

export function HEAD(): Response {
  return interactionMethodNotAllowed("GET")
}

export function OPTIONS(): Response {
  return interactionMethodNotAllowed("GET")
}
