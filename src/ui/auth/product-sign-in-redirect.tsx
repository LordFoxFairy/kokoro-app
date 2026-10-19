"use client"

import { useEffect, useRef } from "react"

import type { ProductReturnTarget } from "@/lib/product-return-target"

import { openProductSignIn } from "./product-auth-client"

/** Navigation only: the server has already established that no session exists. */
export function ProductSignInRedirect({ fallbackTarget }: { fallbackTarget: ProductReturnTarget | null }) {
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    openProductSignIn()
  }, [])

  const href = fallbackTarget === null ? "/login" : `/login?${new URLSearchParams({ return_to: fallbackTarget })}`
  return <noscript><a href={href}>登录 Kokoro</a></noscript>
}
