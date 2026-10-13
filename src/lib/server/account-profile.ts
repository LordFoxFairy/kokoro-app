import { randomUUID } from "node:crypto";
import { accountUserinfoSchema } from "@/lib/account-profile.schema";
import { matchesCanonicalWebRequest } from "./iam-relay-config";
import { oidcRpConfig } from "./oidc-provider";
import { currentProductSession } from "./product-session";
import { verifyProductIdentity } from "./product-identity";
import {
  requestWithDomain,
  UpstreamResponseTooLargeError,
  UpstreamResponseIncompleteError,
} from "./upstream-http";

/** Read-only IAM projection, admitted and retired within one Product session. */
export async function readAccountProfile(request: Request): Promise<Response> {
  const requestId = randomUUID();
  const headers = {
    "cache-control": "private, no-store",
    "x-request-id": requestId,
  };
  const fail = (status: number, code: string) =>
    Response.json({ error: { code, message: code } }, { status, headers });
  const config = oidcRpConfig(process.env);
  if (!config) return fail(503, "account_profile_not_configured");
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.pathname !== "/api/account/profile" ||
    request.url.includes("?") ||
    request.body !== null ||
    request.headers.has("transfer-encoding") ||
    (request.headers.has("content-length") &&
      request.headers.get("content-length") !== "0")
  )
    return fail(400, "account_profile_invalid_request");
  if (
    url.origin !== config.relay.webOrigin ||
    !matchesCanonicalWebRequest(request, config.relay, "GET")
  )
    return fail(403, "account_profile_forbidden");
  const controller = new AbortController();
  const deadlineAt = performance.now() + 5_000;
  let retired = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let upstream: Response | undefined;
  let interrupt!: (reason: unknown) => void;
  const cancellation = new Promise<never>((_, reject) => {
    interrupt = reject;
  });
  let fault = "account_profile_unavailable";
  const stop = () => {
    controller.abort();
    void reader?.cancel().catch(() => undefined);
    if (upstream?.body && !upstream.body.locked)
      void upstream.body.cancel().catch(() => undefined);
  };
  const abort = () => {
    fault = "account_profile_aborted";
    interrupt(new Error(fault));
    stop();
  };
  const timer = setTimeout(() => {
    fault = "account_profile_timeout";
    interrupt(new Error(fault));
    stop();
  }, 5_000);
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) abort();
  const check = () => {
    if (retired || request.signal.aborted || controller.signal.aborted)
      throw new Error(fault);
    if (performance.now() >= deadlineAt) {
      fault = "account_profile_timeout";
      stop();
      throw new Error(fault);
    }
  };
  const store = {
    redisUrl: config.redisUrl,
    webOrigin: config.relay.webOrigin,
    secret: config.authSecret,
  };
  const operation = async () => {
    check();
    const session = await currentProductSession(request, store);
    check();
    if (
      !session ||
      session.accessExpiresAt <= Date.now() ||
      session.expiresAt <= Date.now()
    )
      return fail(401, "account_profile_session_required");
    try {
      await verifyProductIdentity(
        config,
        session.access,
        session.subject,
        controller.signal,
      );
    } catch {
      check();
      return fail(503, "account_profile_admission_failed");
    }
    check();
    upstream = await requestWithDomain(
      `${config.relay.bffOrigin}/iam/oauth2/userinfo`,
      config.domain,
      {
        method: "GET",
        signal: controller.signal,
        timeoutMs: Math.max(1, Math.ceil(deadlineAt - performance.now())),
        maxResponseBytes: 16_384,
        headers: new Headers({
          accept: "application/json",
          authorization: `Bearer ${session.access}`,
          "x-kokoro-service": "web-bff",
          "x-kokoro-internal-secret": config.relay.secret,
          "x-kokoro-request-id": requestId,
        }),
      },
    );
    if (retired || controller.signal.aborted) {
      stop();
      check();
    }
    check();
    if (upstream.status !== 200)
      return fail(
        upstream.status === 401 || upstream.status === 403
          ? 401
          : upstream.status === 429 || upstream.status >= 500
            ? 503
            : 502,
        "account_profile_upstream_rejected",
      );
    if (
      !/^application\/json(?:\s*;|$)/iu.test(
        upstream.headers.get("content-type") ?? "",
      )
    )
      return fail(502, "account_profile_invalid_response");
    const declared = upstream.headers.get("content-length");
    if (
      declared !== null &&
      (!/^\d+$/u.test(declared) || Number(declared) > 16_384)
    )
      return fail(502, "account_profile_invalid_response");
    let text = "";
    let size = 0;
    if (upstream.body) {
      reader = upstream.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      try {
        for (;;) {
          const part = await reader.read();
          check();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 16_384)
            return fail(502, "account_profile_invalid_response");
          text += decoder.decode(part.value, { stream: true });
        }
        text += decoder.decode();
      } catch {
        check();
        return fail(502, "account_profile_invalid_response");
      } finally {
        if (reader) {
          void reader.cancel().catch(() => undefined);
          reader.releaseLock();
          reader = undefined;
        }
      }
    }
    check();
    let raw: unknown;
    try {
      raw = JSON.parse(text) as unknown;
    } catch {
      return fail(502, "account_profile_invalid_response");
    }
    const profile = accountUserinfoSchema.safeParse(raw);
    if (!profile.success || profile.data.sub !== session.subject)
      return fail(502, "account_profile_invalid_response");
    const latest = await currentProductSession(request, store);
    check();
    if (
      !latest ||
      latest.id !== session.id ||
      latest.generation !== session.generation ||
      latest.subject !== session.subject ||
      latest.accessExpiresAt <= Date.now() ||
      latest.expiresAt <= Date.now()
    )
      return fail(401, "account_profile_session_retired");
    return Response.json(
      {
        data: {
          subject: profile.data.sub,
          name: profile.data.name ?? null,
          email: profile.data.email ?? null,
          email_verified: profile.data.email_verified ?? null,
        },
      },
      { headers },
    );
  };
  try {
    return await Promise.race([cancellation, operation()]);
  } catch (error) {
    if (
      error instanceof UpstreamResponseTooLargeError ||
      error instanceof UpstreamResponseIncompleteError
    )
      return fail(502, "account_profile_invalid_response");
    return fail(fault === "account_profile_aborted" ? 499 : 503, fault);
  } finally {
    retired = true;
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
    stop();
  }
}
