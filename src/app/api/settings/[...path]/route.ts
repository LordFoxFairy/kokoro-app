import { proxyHubRequest } from "@/app/api/hub/[...path]/route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ path: string[] }> }

function proxySettings(request: Request, context: RouteContext): Promise<Response> {
  return proxyHubRequest(request, {
    params: context.params.then(({ path }) => ({ path: ["settings", ...(path ?? [])] })),
  })
}

export const GET = proxySettings
export const POST = proxySettings
export const PUT = proxySettings
export const PATCH = proxySettings
export const DELETE = proxySettings
