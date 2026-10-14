import {
  accountProfileRequestIdSchema,
  accountProfileUpdateSchema,
  accountProfileUpdateAckSchema,
  accountProfileUpdateErrorSchemas,
  parseAccountProfileJson,
  type AccountProfileUpdate,
} from "@/lib/account-profile-update.schema";

/** A single browser write: unknown outcomes throw, declared rejections return without automatic replay. */
export async function writeAccountProfile(
  input: AccountProfileUpdate,
  subject: string,
  signal: AbortSignal,
): Promise<{ kind: "ack" } | { kind: "rejected"; status: number }> {
  const body = accountProfileUpdateSchema.parse(input);
  signal.throwIfAborted();
  const controller = new AbortController();
  const deadline = performance.now() + 10000;
  let retired = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let reject!: (reason: unknown) => void;
  const cancelled = new Promise<never>((_, fail) => {
    reject = fail;
  });
  const stop = () => {
    controller.abort();
    void reader?.cancel().catch(() => undefined);
    reject(new Error("Unknown name write"));
  };
  const timer = setTimeout(stop, 10000);
  signal.addEventListener("abort", stop, { once: true });
  const check = () => {
    if (retired || controller.signal.aborted || performance.now() >= deadline)
      throw new Error("Unknown name write");
  };
  const operation = async (): Promise<
    { kind: "ack" } | { kind: "rejected"; status: number }
  > => {
    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (retired || controller.signal.aborted) {
      void response.body?.cancel().catch(() => undefined);
      check();
    }
    check();
    if (
      !/^application\/json(?:\s*;|$)/iu.test(
        response.headers.get("content-type") ?? "",
      ) ||
      !accountProfileRequestIdSchema.safeParse(
        response.headers.get("x-request-id"),
      ).success ||
      !/(?:^|,)\s*no-store\s*(?:,|$)/iu.test(
        response.headers.get("cache-control") ?? "",
      ) ||
      response.headers.has("location") ||
      response.headers.has("set-cookie")
    ) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error("Unknown name response");
    }
    let text = "";
    let size = 0;
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    response.headers.forEach((value, key) => {
      size += new TextEncoder().encode(`${key}: ${value}\r\n`).byteLength;
    });
    if (size > 1048576) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error("Name response oversized");
    }
    if (response.body) {
      reader = response.body.getReader();
      try {
        for (;;) {
          const part = await reader.read();
          check();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 1048576) throw new Error("Name response oversized");
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
    const retry = response.headers.get("retry-after");
    if (
      (response.status === 429 && retry === null) ||
      (retry !== null &&
        (!/^[1-9]\d{0,4}$/u.test(retry) ||
          Number(retry) > 86400 ||
          response.status !== 429))
    )
      throw new Error("Unknown Retry-After");
    const raw = parseAccountProfileJson(text);
    if (response.status === 200) {
      const ack = accountProfileUpdateAckSchema.parse(raw);
      if (ack.data.subject !== subject || ack.data.name !== body.name)
        throw new Error("ACK binding");
      return { kind: "ack" };
    }
    const schema = accountProfileUpdateErrorSchemas[response.status];
    if (!schema) throw new Error("Unknown name status");
    schema.parse(raw);
    return { kind: "rejected", status: response.status };
  };
  try {
    return await Promise.race([cancelled, operation()]);
  } finally {
    retired = true;
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
    controller.abort();
  }
}
