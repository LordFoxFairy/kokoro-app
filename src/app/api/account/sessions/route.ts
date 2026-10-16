import { accountSessions, accountSessionMethodNotAllowed } from "@/lib/server/account-sessions"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request) { return accountSessions(request) }
const rejected = () => accountSessionMethodNotAllowed("GET")
export const POST = rejected
export const PUT = rejected
export const PATCH = rejected
export const DELETE = rejected
export const HEAD = rejected
export const OPTIONS = rejected
