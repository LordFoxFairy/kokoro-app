"use client";

import { Check } from "lucide-react";
import type { McpAvailability } from "@/hub/mcp-connector.schema";
import { useT } from "@/i18n/context";

const messages = {
  available: "mcp.active",
  refresh_required: "mcp.availability.refreshRequired",
  refreshing: "mcp.availability.refreshing",
  reauthorization_required: "mcp.availability.reauthorizationRequired",
  unavailable: "mcp.availability.unavailable",
} as const;

/** Read-only owner qualification; rendering never refreshes, reconnects, or enables. */
export function McpAvailabilityStatus({ availability, className, availableIconClassName }: {
  availability: McpAvailability;
  className?: string | undefined;
  availableIconClassName?: string | undefined;
}) {
  const t = useT();
  const label = t(messages[availability]);
  return availability === "available" && availableIconClassName ? (
    <Check className={availableIconClassName} aria-label={label} />
  ) : (
    <span className={className} data-availability={availability} aria-label={label}>{label}</span>
  );
}
