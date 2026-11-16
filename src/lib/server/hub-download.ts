// Existing Library/Artifact/Project transfer validation; budgets and EOF semantics retained.
import { NextResponse } from "next/server";


export const MAX_PERSONAL_DOWNLOAD_BYTES = 1_048_576;

export const MAX_ARTIFACT_DOWNLOAD_BYTES = 1_073_741_824;

function safeDownloadHeaders(
  headers: Headers,
  maxBytes: number,
  preserveLibraryLength: boolean,
): Headers | null {
  const type = headers.get("content-type");
  const rawLength = headers.get("content-length");
  const disposition = headers.get("content-disposition");
  const requestId = headers.get("x-request-id");
  const match =
    disposition === null
      ? null
      : /^attachment; filename="([\x20-\x7e]*)"; filename\*=UTF-8''([A-Za-z0-9._~!%-]+)$/u.exec(
          disposition,
        );
  if (
    type === null ||
    !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/iu.test(type) ||
    rawLength === null ||
    !/^(0|[1-9][0-9]*)$/u.test(rawLength) ||
    Number(rawLength) > maxBytes ||
    match === null ||
    /["\\;]/u.test(match[1] ?? "") ||
    headers.get("cache-control") !== "no-store" ||
    headers.get("referrer-policy") !== "no-referrer" ||
    headers.get("x-content-type-options") !== "nosniff" ||
    requestId === null ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(requestId)
  )
    return null;
  try {
    const filename = decodeURIComponent(match[2] ?? "");
    if (
      filename.length === 0 ||
      filename.length > 255 ||
      /[\u0000-\u001f\u007f/\\]/u.test(filename)
    )
      return null;
  } catch {
    return null;
  }
  return new Headers({
    "content-type": type,
    "content-length": rawLength,
    "content-disposition": disposition ?? "",
    // Next must not gzip exact Library bytes and drop the validated length.
    "cache-control": preserveLibraryLength ? "private, no-store, no-transform" : "private, no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-request-id": requestId,
  });
}

export function personalDownloadHeaders(headers: Headers): Headers | null {
  return safeDownloadHeaders(headers, MAX_PERSONAL_DOWNLOAD_BYTES, true);
}

export function artifactDownloadHeaders(headers: Headers, preserveLibraryLength: boolean): Headers | null {
  return safeDownloadHeaders(headers, MAX_ARTIFACT_DOWNLOAD_BYTES, preserveLibraryLength);
}

export function invalidPersonalDownloadResponse(): Response {
  return NextResponse.json(
    { error: "library_file_invalid_response" },
    { status: 502, headers: { "cache-control": "private, no-store" } },
  );
}

export function invalidArtifactDownloadResponse(): Response {
  return NextResponse.json(
    { error: "library_artifact_invalid_response" },
    { status: 502, headers: { "cache-control": "private, no-store" } },
  );
}

export function boundedArtifactBody(
  source: ReadableStream<Uint8Array>,
  length: number,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let total = 0;
  let closed = false;
  let onAbort: (() => void) | undefined;
  const cleanup = () => {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      onAbort = () => {
        if (closed) return;
        closed = true;
        void reader.cancel(signal.reason);
        controller.error(
          signal.reason ?? new Error("artifact download cancelled"),
        );
        cleanup();
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    },
    async pull(controller) {
      if (closed) return;
      try {
        const result = await reader.read();
        if (closed) return;
        if (result.done) {
          closed = true;
          cleanup();
          if (total !== length)
            controller.error(new Error("artifact download incomplete"));
          else controller.close();
          return;
        }
        total += result.value.byteLength;
        if (total > length || total > MAX_ARTIFACT_DOWNLOAD_BYTES) {
          closed = true;
          cleanup();
          await reader.cancel(
            new Error("artifact download exceeded declared length"),
          );
          controller.error(
            new Error("artifact download exceeded declared length"),
          );
          return;
        }
        controller.enqueue(result.value);
      } catch (error) {
        if (closed) return;
        closed = true;
        cleanup();
        controller.error(error);
      }
    },
    async cancel(reason) {
      closed = true;
      cleanup();
      await reader.cancel(reason);
    },
  });
}
