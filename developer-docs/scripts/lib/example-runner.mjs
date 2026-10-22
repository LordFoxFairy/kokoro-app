import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FIXTURE_TOKEN = 'example-only-token';
const EXAMPLE_TIMEOUT_MS = 60_000;

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    request.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) {
        reject(new Error('fixture request exceeded 1 MiB'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-length': Buffer.byteLength(body),
    'content-type': 'application/json',
  });
  response.end(body);
}

function assertServiceContext(request) {
  const expected = {
    'x-kokoro-internal-secret': FIXTURE_TOKEN,
    authorization: 'Bearer example-user-session',
    'x-kokoro-service': 'web-bff',
  };
  for (const [name, value] of Object.entries(expected)) {
    if (request.headers[name] !== value) {
      throw new Error(`fixture expected ${name}`);
    }
  }
}

function parseJson(body, label) {
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new Error(`${label} body must be JSON`);
  }
}

function sessionSummary(sessionId, title) {
  return {
    session_id: sessionId,
    title,
    updated_at: '2026-09-04T12:00:00.000Z',
  };
}

async function handleCreateMessage(request, response, url, method, requests) {
  const match = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/messages$/);
  if (method !== 'POST' || match === null) return false;

  const payload = parseJson(await readBody(request), 'createMessage');
  if (payload.content !== 'Review the public API contract.') {
    throw new Error('fixture received an unexpected message body');
  }
  if (!request.headers['idempotency-key']) {
    throw new Error('createMessage requires Idempotency-Key');
  }
  requests.push('createMessage');
  sendJson(response, 202, {
    data: {
      assistant_message_id: 'msg_assistant_example',
      run_id: 'run_example',
      user_message_id: 'msg_user_example',
    },
    meta: { request_id: 'req_create_example' },
  });
  return true;
}

async function handleControlRun(request, response, url, method, requests) {
  const match = url.pathname.match(
    /^\/v1\/sessions\/([^/]+)\/runs\/([^/]+)\/control$/,
  );
  if (method !== 'POST' || match === null) return false;

  const payload = parseJson(await readBody(request), 'controlRun');
  if (payload.kind !== 'run.cancel' && payload.kind !== 'run.resume') {
    throw new Error('fixture received an unsupported control kind');
  }
  const idempotencyKey = request.headers['idempotency-key'];
  if (typeof idempotencyKey !== 'string' || idempotencyKey === '') {
    throw new Error('controlRun requires Idempotency-Key');
  }
  if (payload.kind === 'run.resume') {
    const decisions = payload.decisions;
    const decision = Array.isArray(decisions) ? decisions[0] : undefined;
    if (payload.pause_ref !== 'pause_example' || payload.expected_pause_revision !== 1
      || decisions?.length !== 1 || decision?.item_id !== 'item_example' || decision?.type !== 'approve'
      || Object.keys(decision).length !== 2) throw new Error('fixture expected the exact admitted pause and approval item');
  }
  requests.push('controlRun');
  sendJson(response, 202, {
    data: {
      command_id: idempotencyKey,
      replayed: false,
      request_digest: 'sha256:fixture',
      run_id: decodeURIComponent(match[2] ?? ''),
      status: 'pending',
    },
    meta: { request_id: 'req_control_example' },
  });
  return true;
}

async function handleEventStream(request, response, url, method, requests) {
  const match = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/events$/);
  if (method !== 'GET' || match === null) return false;

  await readBody(request);
  requests.push('streamSessionEvents');
  const previousCursor = request.headers['last-event-id'];
  if (
    previousCursor !== undefined &&
    previousCursor !== 'agui_00000000000000000000000000000001'
  ) {
    throw new Error('fixture received an unexpected Last-Event-ID');
  }
  response.writeHead(200, {
    'cache-control': 'no-cache',
    'content-type': 'text/event-stream',
    'x-kokoro-request-id': 'req_stream_example',
  });
  const frame =
    previousCursor === undefined
      ? {
          data: {
            name: 'kokoro.interaction.state',
            type: 'CUSTOM',
            value: { interaction_revision: 1, pause_revision: 1, pause_ref: 'pause_example', phase: 'waiting',
              groups: [{ group_id: 'group_example', items: [{ item_id: 'item_example', request_id: 'request_example',
                kind: 'tool_approval', allowed_decisions: ['approve', 'reject'], display: { name: 'Review',
                  description: 'Approve this fixture action', editable: false, input_schema: { type: 'object' } } }] }], action_result: null },
          },
          id: 'agui_00000000000000000000000000000001',
        }
      : {
          data: {
            runId: 'run_example',
            threadId: decodeURIComponent(match[1] ?? ''),
            timestamp: 1_788_523_200_000,
            type: 'RUN_FINISHED',
          },
          id: 'agui_00000000000000000000000000000002',
        };
  const body = `: fixture keep-alive\n\nid: ${frame.id}\r\ndata: ${JSON.stringify(frame.data)}\r\n\r\n`;
  const split = Math.max(1, Math.floor(body.length / 2));
  response.write(body.slice(0, split));
  await new Promise((resolve) => setTimeout(resolve, 5));
  response.write(body.slice(split));
  if (previousCursor === undefined) {
    await new Promise((resolve) => {
      let settled = false;
      const close = () => {
        if (settled) return;
        settled = true;
        response.off('close', close);
        request.off('aborted', close);
        resolve();
      };
      response.once('close', close);
      request.once('aborted', close);
    });
  } else {
    response.end();
  }
  return true;
}

async function handleUpload(request, response, url, method, requests) {
  const match = url.pathname.match(/^\/v1\/projects\/([^/]+)\/resources$/);
  if (method !== 'POST' || match === null) return false;

  const body = await readBody(request);
  const contentType = request.headers['content-type'];
  if (
    typeof contentType !== 'string' ||
    !contentType.startsWith('multipart/form-data;') ||
    !body.includes(Buffer.from('fixture resource'))
  ) {
    throw new Error('fixture expected one multipart resource');
  }
  if (!request.headers['idempotency-key']) {
    throw new Error('uploadProjectResources requires Idempotency-Key');
  }
  requests.push('uploadProjectResources');
  sendJson(response, 200, {
    data: { ok: true },
    meta: { request_id: 'req_upload_example' },
  });
  return true;
}

async function handleSessionList(request, response, url, method, requests) {
  if (method !== 'GET' || url.pathname !== '/v1/sessions') return false;

  await readBody(request);
  requests.push('listSessions');
  const cursor = url.searchParams.get('cursor');
  if (cursor === null) {
    sendJson(response, 200, {
      data: {
        next_cursor: 'cur_example_page_2',
        sessions: [sessionSummary('session_example_1', 'First session')],
      },
      meta: { request_id: 'req_sessions_page_1' },
    });
  } else if (cursor === 'cur_example_page_2') {
    sendJson(response, 200, {
      data: {
        next_cursor: null,
        sessions: [sessionSummary('session_example_2', 'Second session')],
      },
      meta: { request_id: 'req_sessions_page_2' },
    });
  } else {
    throw new Error('fixture received an unknown cursor');
  }
  return true;
}

async function handleFixtureRequest(request, response, requests) {
  try {
    assertServiceContext(request);
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const method = request.method ?? 'GET';
    const handlers = [
      handleCreateMessage,
      handleControlRun,
      handleEventStream,
      handleUpload,
      handleSessionList,
    ];
    for (const handler of handlers) {
      if (await handler(request, response, url, method, requests)) return;
    }
    await readBody(request);
    sendJson(response, 404, {
      error: { code: 'fixture_route_not_found', message: 'Fixture route missing' },
      meta: { request_id: 'req_missing_example' },
    });
  } catch (error) {
    if (!response.headersSent && !response.destroyed) {
      sendJson(response, 400, {
        error: {
          code: 'fixture_request_invalid',
          message: error instanceof Error ? error.message : String(error),
        },
        meta: { request_id: 'req_invalid_example' },
      });
    }
  }
}

function startFixtureServer() {
  const requests = [];
  const server = createServer((request, response) =>
    handleFixtureRequest(request, response, requests),
  );

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('fixture server did not bind a TCP port'));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) =>
              error === undefined ? closeResolve() : closeReject(error),
            );
          }),
        requests,
      });
    });
  });
}

function commandFor(example, portalRoot) {
  if (example.runtime === 'bash') {
    return { command: 'bash', arguments: [example.absolutePath] };
  }
  if (example.runtime === 'python') {
    return { command: 'python3', arguments: [example.absolutePath] };
  }
  if (example.runtime === 'tsx') {
    return {
      command: join(portalRoot, 'node_modules/.bin/tsx'),
      arguments: [example.absolutePath],
    };
  }
  throw new Error(`unsupported example runtime ${example.runtime}`);
}

function runCommand(command, argumentsValue, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argumentsValue, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        new Error(
          `${command} exceeded the ${EXAMPLE_TIMEOUT_MS / 1000} second example timeout`,
        ),
      );
    }, EXAMPLE_TIMEOUT_MS);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (exitCode) => {
      clearTimeout(timeout);
      resolve({ exitCode: exitCode ?? 1, stderr, stdout });
    });
  });
}

function assertObservedOperations(example, observed) {
  const expected = example.operations.map(({ operationId }) => operationId);
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    throw new Error(
      `${example.id} operation trace mismatch: expected ${expected.join(', ')}, received ${observed.join(', ')}`,
    );
  }
}

export async function runExecutableExamples(manifest, options) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'kokoro-examples-'));
  const exampleFile = join(temporaryDirectory, 'fixture.txt');
  writeFileSync(exampleFile, 'fixture resource\n');
  const fixture = await startFixtureServer();
  const results = [];
  const environment = {
    ...process.env,
    EXAMPLE_FILE: exampleFile,
    KOKORO_API_BASE_URL: fixture.baseUrl,
    KOKORO_API_TOKEN: FIXTURE_TOKEN,
    KOKORO_USER_BEARER: 'example-user-session',
    KOKORO_PROJECT_ID: 'project_example',
    KOKORO_RUN_ID: 'run_example',
    KOKORO_SESSION_ID: 'session_example',
    NO_COLOR: '1',
  };

  try {
    for (const example of manifest.examples) {
      const requestOffset = fixture.requests.length;
      const { command, arguments: argumentsValue } = commandFor(
        example,
        options.portalRoot,
      );
      const result = await runCommand(command, argumentsValue, {
        cwd: options.portalRoot,
        env: environment,
      });
      if (result.exitCode !== 0) {
        throw new Error(
          `${example.id} exited ${result.exitCode}: ${result.stderr.trim()}`,
        );
      }
      assertObservedOperations(
        example,
        fixture.requests.slice(requestOffset),
      );
      results.push({ id: example.id, ...result });
    }
    return results;
  } finally {
    await fixture.close();
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}
