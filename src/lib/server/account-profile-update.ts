import { randomUUID } from "node:crypto";
import {
  accountProfileUpdateSchema,
  accountProfileUpdateAckSchema,
  accountProfileUpdateErrorSchemas,
  parseAccountProfileJson,
} from "@/lib/account-profile-update.schema";
import { productBffConfig, productBffHeaders } from "./product-bff";
import { currentProductSession } from "./product-session";
import { requestWithDomain } from "./upstream-http";

/** One canonical name write, bounded from entry through final opaque-session revalidation. */
export async function updateAccountProfile(
  request: Request,
): Promise<Response> {
  const deadline = performance.now() + 10000;
  const requestId = randomUUID();
  const headers = {
    "cache-control": "private, no-store",
    "x-request-id": requestId,
  };
  const fail = (status: number, code: string) =>
    Response.json(
      {
        error: {
          code,
          message: code,
          retryable: status === 429 || status === 503,
        },
      },
      { status, headers },
    );
  const config = productBffConfig();
  if (!config) return fail(503, "account_profile_unavailable");
  const url = new URL(request.url);
  const origin = new URL(config.session.webOrigin);
  if (
    request.method !== "PATCH" ||
    url.pathname !== "/api/account/profile" ||
    request.url.includes("?") ||
    request.headers.has("idempotency-key")
  )
    return fail(400, "account_profile_input_invalid");
  if (
    url.protocol !== origin.protocol ||
    request.headers.get("host") !== origin.host ||
    request.headers.get("origin") !== origin.origin
  )
    return fail(403, "account_profile_forbidden");
  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(
      request.headers.get("content-type") ?? "",
    ) ||
    (request.headers.has("content-encoding") &&
      request.headers.get("content-encoding") !== "identity")
  )
    return fail(400, "account_profile_input_invalid");
  const controller = new AbortController();
  let retired = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let upstream: Response | undefined;
  let reject!: (reason: unknown) => void;
  const cancelled = new Promise<never>((_, fail) => {
    reject = fail;
  });
  const stop = () => {
    controller.abort();
    void reader?.cancel().catch(() => undefined);
    if (upstream?.body && !upstream.body.locked)
      void upstream.body.cancel().catch(() => undefined);
  };
  const abort = () => {
    stop();
    reject(new Error("Retired name write"));
  };
  const timer = setTimeout(abort, Math.max(0, deadline - performance.now()));
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) abort();
  const check = () => {
    if (retired || controller.signal.aborted || performance.now() >= deadline)
      throw new Error("Retired name write");
  };
  const read = async (
    body: ReadableStream<Uint8Array> | null,
    maximum: number,
    initial = 0,
  ) => {
    let size = initial;
    let text = "";
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    if (size > maximum) throw new RangeError("Too large");
    if (body) {
      reader = body.getReader();
      try {
        for (;;) {
          const part = await reader.read();
          check();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > maximum) throw new RangeError("Too large");
          text += decoder.decode(part.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        void reader.cancel().catch(() => undefined);
        reader.releaseLock();
        reader = undefined;
      }
    }
    check();
    return text;
  };
  const operation = async () => {
    check();
    let input;
    try {
      input = accountProfileUpdateSchema.parse(
        parseAccountProfileJson(await read(request.body, 65536)),
      );
    } catch (error) {
      check();
      return fail(
        error instanceof RangeError ? 413 : 400,
        error instanceof RangeError
          ? "account_profile_request_too_large"
          : "account_profile_input_invalid",
      );
    }
    const session = await currentProductSession(request, config.session);
    check();
    if (
      !session ||
      session.accessExpiresAt <= Date.now() ||
      session.expiresAt <= Date.now()
    )
      return fail(401, "session_invalid");
    const outgoing = productBffHeaders(config, session, requestId);
    outgoing.set("content-type", "application/json");
    outgoing.set("accept", "application/json");
    upstream = await requestWithDomain(
      `${config.bffBaseUrl}/v1/account/profile`,
      config.domain,
      {
        method: "PATCH",
        body: new TextEncoder().encode(JSON.stringify(input)).buffer,
        headers: outgoing,
        signal: controller.signal,
        timeoutMs: Math.max(1, Math.ceil(deadline - performance.now())),
        maxRequestBytes: 65536,
        maxResponseBytes: 1048576,
      },
    );
    if (retired || controller.signal.aborted) {
      stop();
      check();
    }
    check();
    if (
      upstream.headers.get("x-request-id") !== requestId ||
      !/^application\/json(?:\s*;|$)/iu.test(
        upstream.headers.get("content-type") ?? "",
      ) ||
      !/(?:^|,)\s*no-store\s*(?:,|$)/iu.test(
        upstream.headers.get("cache-control") ?? "",
      ) ||
      upstream.headers.has("location") ||
      upstream.headers.has("set-cookie")
    )
      return fail(502, "account_profile_response_invalid");
    let size = 0;
    upstream.headers.forEach((value, key) => {
      size += new TextEncoder().encode(`${key}: ${value}\r\n`).byteLength;
    });
    let output: unknown;
    try {
      const raw = parseAccountProfileJson(
        await read(upstream.body, 1048576, size),
      );
      if (upstream.status === 200) {
        const ack = accountProfileUpdateAckSchema.parse(raw);
        if (
          ack.data.subject !== session.subject ||
          ack.data.name !== input.name
        )
          throw new Error("ACK binding");
        output = ack;
      } else {
        const error =
          accountProfileUpdateErrorSchemas[upstream.status]?.parse(raw);
        if (!error) throw new Error("Unknown status");
        output = { error: { ...error.error, message: error.error.code } };
      }
    } catch {
      check();
      return fail(502, "account_profile_response_invalid");
    }
    const latest = await currentProductSession(request, config.session);
    check();
    if (
      !latest ||
      latest.id !== session.id ||
      latest.generation !== session.generation ||
      latest.subject !== session.subject ||
      latest.access !== session.access ||
      latest.accessExpiresAt !== session.accessExpiresAt ||
      latest.expiresAt !== session.expiresAt ||
      latest.accessExpiresAt <= Date.now() ||
      latest.expiresAt <= Date.now()
    )
      return fail(401, "session_invalid");
    const retry = upstream.headers.get("retry-after");
    if (
      (upstream.status === 429 && retry === null) ||
      (retry !== null &&
        (!/^[1-9]\d{0,4}$/u.test(retry) ||
          Number(retry) > 86400 ||
          upstream.status !== 429))
    )
      return fail(502, "account_profile_response_invalid");
    return Response.json(output, {
      status: upstream.status,
      headers: {
        ...headers,
        ...(retry === null ? {} : { "retry-after": retry }),
      },
    });
  };
  try {
    return await Promise.race([cancelled, operation()]);
  } catch {
    return fail(503, "account_profile_unavailable");
  } finally {
    retired = true;
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
    stop();
  }
}
