import { AppGate } from "@/ui/auth/app-gate"

/**
 * Keep the authenticated workbench mounted while the primary rail moves
 * between direct chat and its catalog surfaces. A page-level AppGate remounts
 * the session probe on every Link navigation, which briefly paints the loading
 * surface and makes the rail flash. The app segment is the stable route shell;
 * `usePathname()` inside KokoroAppSurface still selects the active surface.
 */
export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  void children
  return <AppGate />
}
