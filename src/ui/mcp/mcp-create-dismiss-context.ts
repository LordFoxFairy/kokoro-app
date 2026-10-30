"use client";

import { createContext } from "react";

/** Explicit creation-window dismissal, distinct from actor retirement or React cleanup. */
export const McpCreateDismissContext = createContext<
  ((onDismiss: () => void) => () => void) | null
>(null);
