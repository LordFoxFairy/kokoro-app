"use client"

import { parseProductReturnTarget } from "@/lib/product-return-target"

export function openProductSignIn(
  navigate: (url: string) => void = (url) => window.location.replace(url),
): void {
  const path = `${window.location.pathname}${window.location.search}`
  const target = parseProductReturnTarget(`${path}${window.location.hash}`) ?? parseProductReturnTarget(path)
  navigate(target === null ? "/login" : `/login?${new URLSearchParams({ return_to: target })}`)
}

/** Complete logout through the canonical IAM native-session adapter. */
export async function endProductSession(
  navigate: (url: string) => void = (url) => window.location.assign(url),
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted()
  const response = await fetch("/iam/sign-out", {
    method: "POST",
    cache: "no-store",
    ...(signal ? { signal } : {}),
  })
  signal?.throwIfAborted()
  if (response.ok || response.status === 401 || response.status === 303 || response.status === 307) {
    navigate("/")
    return
  }
  throw new Error("Native sign-out unavailable")
}
