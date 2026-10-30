"use client"

import { createContext, useContext, type ReactNode } from "react"

/** An admitted runtime Connection, never a Server/provider/display-name selector. */
export type McpTrialTarget = Readonly<{ connectionId: string; name: string }>
export type McpTrialHandler = (target: McpTrialTarget) => boolean
const TrialContext = createContext<McpTrialHandler | null>(null)

/** The mounted Chat shell owns draft creation; MCP dialogs own presentation only. */
export function McpTrialProvider({ onTry, children }: { onTry: McpTrialHandler | null; children: ReactNode }) {
  return <TrialContext.Provider value={onTry}>{children}</TrialContext.Provider>
}
export function useMcpTrial(): McpTrialHandler | null { return useContext(TrialContext) }
