"use client"

// Same-origin file transport and one short-lived browser download URL.

export function fileFetch(url: string, signal?: AbortSignal): Promise<Response> {
  return fetch(url, signal ? { cache: "no-store", signal } : { cache: "no-store" })
}

// Authenticated download lifecycle shared by Canvas, timeline, and library:
// enqueue the anchor download before releasing the temporary Blob URL.
export async function downloadFetchedFile(response: Response, name: string, signal?: AbortSignal): Promise<boolean> {
  if (!response.ok || signal?.aborted) return false
  const blob = await response.blob()
  return downloadVerifiedBlob(blob, name, signal)
}

export function downloadVerifiedBlob(blob: Blob, name: string, signal?: AbortSignal): boolean {
  if (signal?.aborted) return false
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = objectUrl
  anchor.download = name
  try {
    if (signal?.aborted) return false
    anchor.click()
  } finally {
    // Also release the URL if a browser rejects the synthetic click.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
  }
  return true
}
