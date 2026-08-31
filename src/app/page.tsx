import { redirect } from "next/navigation"

/**
 * The first Site's canonical workspace is `/app`. Keep `/` as a stable,
 * bookmarkable entry point that lands in the same desktop Web shell instead
 * of rendering a second, divergent home surface.
 */
export default function Home() {
  redirect("/app")
}
