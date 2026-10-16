const REQUEST_DEADLINE_MS = 10_000;
const MAX_RESPONSE_BYTES = 65_536;
const endpoint = "/api/hub/preferences/personalization";

/** One finite personalization request, including the entire response body.
 * Its controller is private: a timeout never retires the editing session. */
export async function requestPersonalization(
  init: RequestInit,
  sessionSignal?: AbortSignal,
): Promise<{ ok: boolean; status: number; value: unknown }> {
  sessionSignal?.throwIfAborted();
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let finished = false;
  let rejectCancellation!: (reason: unknown) => void;
  const cancellation = new Promise<never>((_resolve, reject) => {
    rejectCancellation = reject;
  });
  const cancel = (reason: unknown) => {
    if (finished) return;
    controller.abort(reason);
    void reader?.cancel().catch(() => undefined);
    rejectCancellation(reason);
  };
  const onSessionAbort = () =>
    cancel(
      sessionSignal?.reason ??
        new DOMException("Personalization request cancelled", "AbortError"),
    );
  sessionSignal?.addEventListener("abort", onSessionAbort, { once: true });
  const deadline = setTimeout(
    () =>
      cancel(
        new DOMException("Personalization request timed out", "TimeoutError"),
      ),
    REQUEST_DEADLINE_MS,
  );

  const operation = async () => {
    const response = await fetch(endpoint, {
      ...init,
      signal: controller.signal,
    });
    if (finished || controller.signal.aborted) {
      void response.body?.cancel().catch(() => undefined);
      controller.signal.throwIfAborted();
      throw new DOMException("Personalization request retired", "AbortError");
    }
    let text = "";
    if (response.body !== null) {
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let bytes = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          controller.signal.throwIfAborted();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > MAX_RESPONSE_BYTES) {
            void reader.cancel().catch(() => undefined);
            throw new Error("Personalization response is oversized");
          }
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    }
    controller.signal.throwIfAborted();
    let value: unknown = null;
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      if (response.ok) throw new Error("Personalization response is invalid");
    }
    return { ok: response.ok, status: response.status, value };
  };
  try {
    return await Promise.race([operation(), cancellation]);
  } finally {
    finished = true;
    clearTimeout(deadline);
    sessionSignal?.removeEventListener("abort", onSessionAbort);
  }
}
