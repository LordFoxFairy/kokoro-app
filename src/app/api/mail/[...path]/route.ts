import { proxyHubRequest } from "@/app/api/hub/[...path]/route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ path: string[] }> }

function proxyMail(request: Request, context: RouteContext): Promise<Response> {
  return proxyHubRequest(request, {
    params: context.params.then(({ path }) => ({ path: ["mail", ...(path ?? [])] })),
  })
}

export const GET = proxyMail
export const POST = proxyMail
export const PUT = proxyMail
export const PATCH = proxyMail
export const DELETE = proxyMail
