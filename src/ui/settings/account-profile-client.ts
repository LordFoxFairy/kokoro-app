import {
  accountProfileResponseSchema,
  type AccountProfile,
} from "@/lib/account-profile.schema";

/** One finite, cancellable browser read; no account credentials or cache. */
export async function readAccountProfile(
  signal: AbortSignal,
): Promise<AccountProfile> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const deadlineAt = performance.now() + 5_000;
  let retired = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let interrupt!: (reason: unknown) => void;
  const cancellation = new Promise<never>((_, reject) => {
    interrupt = reject;
  });
  const cancel = (reason: unknown) => {
    controller.abort(reason);
    void reader?.cancel().catch(() => undefined);
    interrupt(reason);
  };
  const abort = () =>
    cancel(
      signal.reason ?? new DOMException("Account read aborted", "AbortError"),
    );
  const timer = setTimeout(
    () => cancel(new DOMException("Account read timed out", "TimeoutError")),
    5_000,
  );
  signal.addEventListener("abort", abort, { once: true });
  const check = () => {
    controller.signal.throwIfAborted();
    if (retired || performance.now() >= deadlineAt)
      throw new Error("Account read retired");
  };
  const operation = async () => {
    const response = await fetch("/api/account/profile", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (retired || controller.signal.aborted) {
      void response.body?.cancel().catch(() => undefined);
      check();
    }
    check();
    if (
      response.status !== 200 ||
      !/^application\/json(?:\s*;|$)/iu.test(
        response.headers.get("content-type") ?? "",
      )
    ) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error("Account read failed");
    }
    let text = "";
    let size = 0;
    if (response.body) {
      reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      try {
        for (;;) {
          const part = await reader.read();
          check();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 16_384) throw new Error("Account response oversized");
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
    const raw: unknown = JSON.parse(text);
    return accountProfileResponseSchema.parse(raw).data;
  };
  try {
    return await Promise.race([cancellation, operation()]);
  } finally {
    retired = true;
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    controller.abort();
  }
}
