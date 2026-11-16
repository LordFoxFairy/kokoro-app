import { NextResponse } from "next/server";
import { productBffConfig, productBffHeaders } from "@/lib/server/product-bff";
import { requestWithDomain } from "@/lib/server/upstream-http";
import { manuscriptCoverErrorSchema, MANUSCRIPT_COVER_ERRORS } from "@/hub/schemas";
import {
  type ProjectionFault,
  projectionError,
  PROJECTION_REQUEST_ID,
  MCP_CONNECTION_ID,
} from "@/lib/server/hub-projection";
import { boundedArtifactBody } from "@/lib/server/hub-download";

export async function proxySkillCover(
  request: Request,
  path: string[],
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const fail = (fault: ProjectionFault) => projectionError(fault, requestId);
  const url = new URL(request.url);
  const revision = path[1] ?? "";
  if (
    request.method !== "GET" ||
    path.length !== 3 ||
    path[0] !== "skills" ||
    path[2] !== "cover" ||
    !MCP_CONNECTION_ID.test(revision) ||
    url.pathname !== `/api/hub/skills/${encodeURIComponent(revision)}/cover` ||
    url.search ||
    url.hash ||
    request.body !== null ||
    ["content-length", "transfer-encoding", "idempotency-key"].some((header) =>
      request.headers.has(header),
    )
  )
    return fail("invalidSkillRequest");
  const config = productBffConfig();
  if (config === null) return fail("configuration");
  if (
    request.headers.has("origin") &&
    request.headers.get("origin") !== config.session.webOrigin
  )
    return fail("forbidden");
  const cancellation = new AbortController();
  const signal = AbortSignal.any([request.signal, cancellation.signal]);
  const deadline = Date.now() + 10_000;
  const timer = setTimeout(
    () => cancellation.abort(new Error("cover deadline")),
    10_000,
  );
  let upstream: Response;
  try {

    if (signal.aborted) return fail("bffUnavailable");
    const headers = productBffHeaders(config, request, requestId);
    headers.set("accept", "image/png, image/jpeg, image/webp");
    upstream = await requestWithDomain(
      `${config.bffBaseUrl.replace(/\/+$/u, "")}/v1/skills/${encodeURIComponent(revision)}/cover`,
      config.domain,
      {
        method: "GET",
        headers: Object.fromEntries(headers),
        signal,
        timeoutMs: Math.max(1, deadline - Date.now()),
        maxResponseBytes: 5_242_880,
        maxErrorResponseBytes: 65_536,
        strictResponseLength: true,
        streamTotalTimeoutMs: 10_000,
        streamIdleTimeoutMs: 10_000,
      },
    );
  } catch {
    return fail("bffUnavailable");
  } finally {
    clearTimeout(timer);
  }
  if (upstream.status !== 200) {
    // Binary reads never forward redirects or unvalidated dependency envelopes.
    const parsed = manuscriptCoverErrorSchema.safeParse(
      await upstream.json().catch(() => null),
    );
    if (
      !parsed.success ||
      !MANUSCRIPT_COVER_ERRORS[upstream.status]?.includes(
        parsed.data.error.code,
      )
    )
      return fail("invalidOwnerResponse");
    return NextResponse.json(parsed.data, {
      status: upstream.status,
      headers: {
        "cache-control": "private, no-store",
        "x-request-id": requestId,
      },
    });
  }
  const h = upstream.headers;
  const length = h.get("content-length");
  const type = h.get("content-type");
  const ownerId = h.get("x-request-id");
  if (
    upstream.body === null ||
    type === null ||
    !["image/png", "image/jpeg", "image/webp"].includes(type) ||
    length === null ||
    !/^[1-9][0-9]*$/u.test(length) ||
    Number(length) > 5_242_880 ||
    h.get("cache-control") !== "no-store" ||
    h.get("referrer-policy") !== "no-referrer" ||
    h.get("x-content-type-options") !== "nosniff" ||
    ownerId === null ||
    !PROJECTION_REQUEST_ID.test(ownerId)
  ) {
    await upstream.body?.cancel();
    return fail("invalidOwnerResponse");
  }
  return new Response(
    boundedArtifactBody(upstream.body, Number(length), request.signal),
    {
      headers: {
        "content-type": type,
        "content-length": length,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "x-request-id": ownerId,
      },
    },
  );
}
