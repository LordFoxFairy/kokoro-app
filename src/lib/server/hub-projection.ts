// Existing Hub projection response and request policies; no admission or I/O.
import { NextResponse } from "next/server";


export type ProjectionFault =
  | "configuration"
  | "bffNotConfigured"
  | "iamUnavailable"
  | "unauthenticated"
  | "forbidden"
  | "invalidQuery"
  | "invalidSkillRequest"
  | "tooLarge"
  | "bffUnavailable"
  | "invalidOwnerResponse";

export type ProjectionLocalCode =
  | "product_tenant_not_configured"
  | "skill_dependency_unavailable"
  | "iam_admission_unavailable"
  | "session_authentication_required"
  | "session_forbidden"
  | "invalid_query_parameter"
  | "invalid_skill_request"
  | "request_body_too_large"
  | "skill_response_invalid";

export const PROJECTION_FAILURES = {
  configuration: {
    status: 503,
    code: "product_tenant_not_configured",
    retryable: false,
  },
  bffNotConfigured: {
    status: 503,
    code: "skill_dependency_unavailable",
    retryable: false,
  },
  iamUnavailable: {
    status: 503,
    code: "iam_admission_unavailable",
    retryable: true,
  },
  unauthenticated: {
    status: 401,
    code: "session_authentication_required",
    retryable: false,
  },
  forbidden: { status: 403, code: "session_forbidden", retryable: false },
  invalidQuery: {
    status: 400,
    code: "invalid_query_parameter",
    retryable: false,
  },
  invalidSkillRequest: {
    status: 400,
    code: "invalid_skill_request",
    retryable: false,
  },
  tooLarge: { status: 413, code: "request_body_too_large", retryable: false },
  bffUnavailable: {
    status: 503,
    code: "skill_dependency_unavailable",
    retryable: true,
  },
  invalidOwnerResponse: {
    status: 502,
    code: "skill_response_invalid",
    retryable: false,
  },
} as const satisfies Record<
  ProjectionFault,
  {
    status: 400 | 401 | 403 | 413 | 502 | 503;
    code: ProjectionLocalCode;
    retryable: boolean;
  }
>;

export function projectionError(fault: ProjectionFault, requestId: string): Response {
  const { status, code, retryable } = PROJECTION_FAILURES[fault];
  return NextResponse.json(
    { error: { code, message: code, retryable } },
    {
      status,
      headers: { "cache-control": "no-store", "x-request-id": requestId },
    },
  );
}

export function connectionProjectionError(
  fault: ProjectionFault,
  requestId: string,
): Response {
  const base = PROJECTION_FAILURES[fault];
  const code =
    fault === "bffNotConfigured" || fault === "bffUnavailable"
      ? "mcp_connection_dependency_unavailable"
      : fault === "invalidOwnerResponse"
        ? "mcp_connection_response_invalid"
        : base.code;
  return NextResponse.json(
    { error: { code, message: code, retryable: base.retryable } },
    {
      status: base.status,
      headers: { "cache-control": "no-store", "x-request-id": requestId },
    },
  );
}

export const PROJECTION_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export const JSON_MEDIA_TYPE = /^application\/json(?:;\s*charset=utf-8)?$/iu;

export const MAX_SKILL_COMMAND_BYTES = 65_536;

export const MCP_CONNECTION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u;
