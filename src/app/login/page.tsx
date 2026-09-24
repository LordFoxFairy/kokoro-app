import { LoginPanel } from "@/ui/auth/login-panel"

export default async function LoginRoute({ searchParams }: { searchParams: Promise<{ auth?: string }> }) {
  // The single-tenant Product RP entry stays renderable before System starts.
  // Authorization still begins through the server-owned Auth.js route.
  return <LoginPanel initialFailure={(await searchParams).auth === "sign_in_failed"} />
}
