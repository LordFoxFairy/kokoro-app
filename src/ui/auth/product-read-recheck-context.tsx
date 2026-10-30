"use client"

import { createContext, useContext } from "react"

/** Captured by the GET owner, never reconstructed from the current actor. */
export type ProductRead401 = Readonly<{ subject: string | null; generation: number; signal: AbortSignal }>
// Existing projection hooks may ignore the result. A bounded sequential GET
// reader can await actual same-subject readmission instead of restarting itself.
export type ProductReadRecheck = (read: ProductRead401) => Promise<boolean> | void

const ReadRecheck = createContext<ProductReadRecheck | null>(null)
export const ProductReadRecheckProvider = ReadRecheck.Provider

/** Injected/preview surfaces have no authority to request Product readmission. */
export function useProductReadRecheck(): ProductReadRecheck | null {
  return useContext(ReadRecheck)
}
