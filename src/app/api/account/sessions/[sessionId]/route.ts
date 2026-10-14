import { accountSessions, accountSessionMethodNotAllowed } from "@/lib/server/account-sessions"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function DELETE(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  return accountSessions(request, context.params.then(({ sessionId }) => sessionId))
}
const rejected = () => accountSessionMethodNotAllowed("DELETE")
export const POST = rejected
export const PUT = rejected
export const PATCH = rejected
export const GET = rejected
export const HEAD = rejected
export const OPTIONS = rejected
