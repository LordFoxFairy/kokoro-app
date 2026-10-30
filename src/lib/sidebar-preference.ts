import { SIDEBAR_COOKIE_NAME } from "@/components/ui/sidebar-constants"

/** Presentation only: this cookie never admits a user or authorizes a read. */
export function parseRailCollapsedCookie(cookieHeader: string): boolean | null {
  const cookie = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${SIDEBAR_COOKIE_NAME}=`))
  const value = cookie?.slice(SIDEBAR_COOKIE_NAME.length + 1)
  return value === "true" ? false : value === "false" ? true : null
}
