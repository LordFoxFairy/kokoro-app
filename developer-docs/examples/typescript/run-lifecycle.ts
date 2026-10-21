interface JsonRecord {
  readonly [key: string]: unknown;
}

interface SseFrame {
  readonly data: JsonRecord;
  readonly id: string;
}

interface StreamObservation {
  readonly cursor: string;
  readonly frame: SseFrame;
  readonly requestId: string;
}

const REQUEST_TIMEOUT_MS = 15_000;
const STREAM_TOTAL_TIMEOUT_MS = 60_000;
const STREAM_IDLE_TIMEOUT_MS = 15_000;
const MAX_JSON_BYTES = 1 * 1024 * 1024;
const MAX_STREAM_BYTES = 4 * 1024 * 1024;
const MAX_FRAME_BYTES = 256 * 1024;
const EVENT_CURSOR_PATTERN = /^agui_[0-9a-f]{32}$/u;
const EVENT_TYPE_PATTERN = /^[A-Z][A-Z0-9_]+$/u;
const TERMINAL_EVENT_TYPES = new Set(['RUN_FINISHED', 'RUN_ERROR']);
const APPROVAL_EVENT_NAME = 'kokoro.interaction.state';

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Set ${name}`);
  }
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireString(record: JsonRecord, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label}.${key} must be a string`);
  }
  return value;
}

function requireRequestMeta(envelope: JsonRecord): void {
  const meta = requireRecord(envelope.meta, 'response.meta');
  requireString(meta, 'request_id', 'response.meta');
}

const baseUrl = requiredEnvironment('KOKORO_API_BASE_URL').replace(/\/$/u, '');
const apiToken = requiredEnvironment('KOKORO_API_TOKEN');
const userBearer = requiredEnvironment('KOKORO_USER_BEARER');
const sessionId = requiredEnvironment('KOKORO_SESSION_ID');

function serviceHeaders(): Record<string, string> {
  return {
    'x-kokoro-internal-secret': apiToken,
    authorization: `Bearer ${userBearer}`,
    'x-kokoro-service': 'web-bff',
  };
}

function requestUrl(path: string): string {
  return `${baseUrl}${path}`;
}

async function readResponseText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && Number(declaredLength) > maxBytes) {
    throw new Error('response exceeds the configured size budget');
  }
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        throw new Error('response exceeds the configured size budget');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

async function postJson(
  path: string,
  idempotencyKey: string,
  body: JsonRecord,
): Promise<JsonRecord> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(requestUrl(path), {
      body: JSON.stringify(body),
      headers: {
        ...serviceHeaders(),
        'content-type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      method: 'POST',
      signal: controller.signal,
    });
    const text = await readResponseText(response, MAX_JSON_BYTES);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error('Kokoro response was not JSON');
    }
    const envelope = requireRecord(payload, 'response');
    requireRequestMeta(envelope);
    if (!response.ok) {
      const error = isRecord(envelope.error) ? envelope.error : undefined;
      const code = error !== undefined && typeof error.code === 'string'
        ? error.code
        : 'unknown_error';
      throw new Error(`Kokoro request failed with ${response.status}: ${code}`);
    }
    return envelope;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Kokoro request exceeded ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function validateCursor(value: string, label: string): string {
  if (!EVENT_CURSOR_PATTERN.test(value)) {
    throw new Error(`${label} is not a valid opaque AG-UI cursor`);
  }
  return value;
}

function validateAguiData(data: JsonRecord): void {
  const type = requireString(data, 'type', 'SSE data');
  if (!EVENT_TYPE_PATTERN.test(type)) {
    throw new Error(`SSE data.type is not a recognized AG-UI event type: ${type}`);
  }
  if (type === 'CUSTOM') {
    requireString(data, 'name', 'SSE data');
  }
}

function parseSseFrame(lines: readonly string[]): SseFrame | undefined {
  let id: string | undefined;
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'id') id = value;
    if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0) return undefined;
  if (id === undefined || id.length === 0) {
    throw new Error('SSE application frame must contain an id');
  }
  const cursor = validateCursor(id, 'SSE id');
  let parsed: unknown;
  try {
    parsed = JSON.parse(dataLines.join('\n'));
  } catch {
    throw new Error('SSE data must contain valid JSON');
  }
  const data = requireRecord(parsed, 'SSE data');
  validateAguiData(data);
  return { data, id: cursor };
}

class IncrementalSseParser {
  private readonly decoder = new TextDecoder();
  private buffer = '';
  private frameLines: string[] = [];
  private frameBytes = 0;
  private totalBytes = 0;

  push(chunk: Uint8Array): SseFrame[] {
    this.totalBytes += chunk.byteLength;
    if (this.totalBytes > MAX_STREAM_BYTES) {
      throw new Error('event stream exceeds the configured size budget');
    }
    this.buffer += this.decoder.decode(chunk, { stream: true });
    if (new TextEncoder().encode(this.buffer).byteLength > MAX_FRAME_BYTES) {
      throw new Error('one incomplete SSE frame exceeds the configured size budget');
    }
    return this.extractFrames();
  }

  finish(): SseFrame[] {
    this.buffer += this.decoder.decode();
    const frames = this.extractFrames();
    if (this.buffer.length > 0 || this.frameLines.length > 0) {
      throw new Error('event stream ended in an incomplete SSE frame');
    }
    return frames;
  }

  private extractFrames(): SseFrame[] {
    const frames: SseFrame[] = [];
    while (true) {
      const newline = this.buffer.indexOf('\n');
      if (newline === -1) break;
      let line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      this.frameBytes += new TextEncoder().encode(line).byteLength + 1;
      if (this.frameBytes > MAX_FRAME_BYTES) {
        throw new Error('one SSE frame exceeds the configured size budget');
      }
      if (line === '') {
        const frame = parseSseFrame(this.frameLines);
        if (frame !== undefined) frames.push(frame);
        this.frameLines = [];
        this.frameBytes = 0;
      } else if (!line.startsWith(':')) {
        this.frameLines.push(line);
      }
    }
    return frames;
  }
}

function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: AbortController,
  onIdleTimeout: () => void,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const idleTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      onIdleTimeout();
      controller.abort();
      reject(new Error(`event stream idle timeout after ${STREAM_IDLE_TIMEOUT_MS}ms`));
    }, STREAM_IDLE_TIMEOUT_MS);
    void reader.read().then(
      (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(idleTimer);
        resolve(result);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(idleTimer);
        reject(error);
      },
    );
  });
}

function isApprovalFrame(frame: SseFrame): boolean {
  return frame.data.type === 'CUSTOM' && frame.data.name === APPROVAL_EVENT_NAME
    && isRecord(frame.data.value) && frame.data.value.phase === 'waiting';
}

function approvalCommand(frame: SseFrame): JsonRecord {
  if (!isApprovalFrame(frame)) throw new Error('Expected a waiting interaction state');
  const value = requireRecord(frame.data.value, 'SSE interaction state');
  const pauseRef = requireString(value, 'pause_ref', 'SSE interaction state');
  const revision = value.pause_revision;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) {
    throw new Error('Expected a positive exact pause revision');
  }
  if (!Array.isArray(value.groups) || value.groups.length !== 1) throw new Error('This example requires exactly one approval group');
  const group = requireRecord(value.groups[0], 'interaction group');
  if (!Array.isArray(group.items) || group.items.length !== 1) throw new Error('This example requires exactly one approval item');
  const item = requireRecord(group.items[0], 'approval item');
  if (item.kind !== 'tool_approval' || !Array.isArray(item.allowed_decisions) || !item.allowed_decisions.includes('approve')) {
    throw new Error('The interaction does not allow this example approval');
  }
  // The executable fixture demonstrates approval only. Real applications must
  // collect the user's explicit decisions before constructing this command.
  return { kind: 'run.resume', pause_ref: pauseRef, expected_pause_revision: revision,
    decisions: [{ type: 'approve', item_id: requireString(item, 'item_id', 'approval item') }] };
}

function isTerminalFrame(frame: SseFrame): boolean {
  return typeof frame.data.type === 'string' && TERMINAL_EVENT_TYPES.has(frame.data.type);
}

async function consumeEventStream(lastEventId?: string): Promise<StreamObservation> {
  const controller = new AbortController();
  let timeoutKind: 'idle' | 'total' | undefined;
  const totalTimer = setTimeout(() => {
    timeoutKind = 'total';
    controller.abort();
  }, STREAM_TOTAL_TIMEOUT_MS);
  const headers: Record<string, string> = {
    ...serviceHeaders(),
    accept: 'text/event-stream',
  };
  if (lastEventId !== undefined) {
    headers['Last-Event-ID'] = validateCursor(lastEventId, 'Last-Event-ID');
  }

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(
      requestUrl(`/v1/sessions/${encodeURIComponent(sessionId)}/events`),
      { headers, signal: controller.signal },
    );
    if (!response.ok) {
      throw new Error(`Kokoro event stream failed with ${response.status}`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('text/event-stream')) {
      throw new Error('Kokoro event stream returned an unexpected content type');
    }
    const requestId = response.headers.get('x-kokoro-request-id');
    if (requestId === null || requestId.length === 0) {
      throw new Error('Kokoro event stream did not return X-Kokoro-Request-Id');
    }
    if (response.body === null) throw new Error('Kokoro event stream has no body');
    reader = response.body.getReader();
    const parser = new IncrementalSseParser();
    while (true) {
      const chunk = await readChunk(reader, controller, () => {
        timeoutKind = 'idle';
      });
      if (chunk.done) {
        for (const frame of parser.finish()) {
          if (isApprovalFrame(frame) || isTerminalFrame(frame)) {
            return { cursor: frame.id, frame, requestId };
          }
        }
        throw new Error('event stream ended before approval or terminal event');
      }
      for (const frame of parser.push(chunk.value)) {
        // Confirm the complete frame before advancing the replay cursor.
        if (isApprovalFrame(frame) || isTerminalFrame(frame)) {
          return { cursor: frame.id, frame, requestId };
        }
      }
    }
  } catch (error) {
    if (timeoutKind === 'idle') {
      throw new Error(`Kokoro event stream idle timeout after ${STREAM_IDLE_TIMEOUT_MS}ms`);
    }
    if (timeoutKind === 'total' || controller.signal.aborted) {
      throw new Error(`Kokoro event stream exceeded ${STREAM_TOTAL_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(totalTimer);
    if (reader !== undefined) {
      try {
        await reader.cancel();
      } catch {
        // The peer may already have closed the stream.
      }
      reader.releaseLock();
    }
    controller.abort();
  }
}

const messageResponse = await postJson(
  `/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
  'example-typescript-create-001',
  {
    content: 'Review the public API contract.',
    model: 'default',
    project_ref: 'project_example',
  },
);
const messageData = requireRecord(messageResponse.data, 'response.data');
const runId = requireString(messageData, 'run_id', 'response.data');

const approval = await consumeEventStream();
if (!isApprovalFrame(approval.frame)) {
  throw new Error('Expected a waiting approval frame before resume');
}
const command = approvalCommand(approval.frame);

await postJson(
  `/v1/sessions/${encodeURIComponent(sessionId)}/runs/${encodeURIComponent(runId)}/control`,
  'example-typescript-resume-001',
  command,
);

const completed = await consumeEventStream(approval.cursor);
if (!isTerminalFrame(completed.frame)) {
  throw new Error('Expected a terminal AG-UI frame after resume');
}
process.stdout.write(`${runId} ${completed.frame.data.type} ${completed.cursor}\n`);

export {};
