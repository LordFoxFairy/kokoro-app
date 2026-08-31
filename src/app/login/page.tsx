import { LoginPanel } from "@/ui/auth/login-panel"

export default async function LoginRoute() {
  // Login branding is resolved from the same System manifest as the workspace;
  // Brand and tenant context arrive through the shared runtime manifest path.
  return <LoginPanel />
}
