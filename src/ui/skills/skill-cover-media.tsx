"use client"

import Image from "next/image"
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react"

type Props = {
  src: string | undefined
  identity: string
  sizes: string
  fallback?: ReactNode
  children?: (media: ReactNode, loaded: boolean) => ReactNode
}

/** A cover URL names a private resource, not a promise that an image exists. */
export function SkillCoverMedia(props: Props) {
  return <CurrentSkillCoverMedia key={JSON.stringify([props.identity, props.src])} {...props} />
}

function CurrentSkillCoverMedia({ src, sizes, fallback, children }: Props) {
  const [loaded, setLoaded] = useState(false)
  const active = useRef(false)
  const failed = useRef(false)
  useLayoutEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  const onLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    if (active.current && !failed.current && event.currentTarget.naturalWidth > 0) setLoaded(true)
  }, [])
  // Next's hydration workaround resets img.src when onError's identity changes.
  // A display-state render must not restart this private, no-store media read.
  const onError = useCallback(() => {
    failed.current = true
    if (active.current) setLoaded(false)
  }, [])
  const media = <>
    {!loaded ? fallback : null}
    {src ? <Image
      src={src}
      alt=""
      fill
      sizes={sizes}
      unoptimized
      style={{ opacity: loaded ? 1 : 0 }}
      onLoad={onLoad}
      onError={onError}
    /> : null}
  </>
  return children ? children(media, loaded) : media
}
