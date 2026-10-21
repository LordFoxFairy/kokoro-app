import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createMarkdownRenderer } from 'vitepress';
import { parse as parseYaml } from 'yaml';

import {
  assertPublicContract,
  generateReferenceFiles,
  writeReferenceFiles,
} from '../scripts/lib/reference-generator.mjs';
import { assertPublicationSafe } from '../scripts/lib/publication-policy.mjs';
import { renderExample } from '../scripts/lib/schema-renderer.mjs';

function fixtureContract(visibility = 'public') {
  return {
    openapi: '3.1.0',
    info: { title: 'Fixture API', version: '1.0.0' },
    tags: [{ name: 'Chat', description: 'Asynchronous conversations.' }],
    paths: {
      '/v1/sessions/{id}/messages': {
        parameters: [{ $ref: '#/components/parameters/SessionId' }],
        post: {
          tags: ['Chat'],
          operationId: 'createMessage',
          summary: 'Submit a message',
          'x-kokoro-owner': 'kokoro-bff',
          'x-kokoro-visibility': visibility,
          'x-kokoro-stability': 'beta',
          'x-kokoro-idempotency': 'required',
          'x-kokoro-permission': 'chat.message.create',
          parameters: [{ $ref: '#/components/parameters/IdempotencyKey' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MessageCreateRequest' },
                example: { content: 'Review the contract.' },
              },
            },
          },
          responses: {
            202: {
              description: 'Accepted',
              headers: {
                'X-Request-Id': {
                  description: 'Request correlation identifier.',
                  schema: { type: 'string', minLength: 1 },
                  example: 'req_example',
                },
              },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/MessageReceiptResponse' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      parameters: {
        SessionId: {
          name: 'id',
          in: 'path',
          required: true,
          description: 'Opaque session identifier.',
          schema: { type: 'string' },
        },
        IdempotencyKey: {
          name: 'Idempotency-Key',
          in: 'header',
          required: true,
          schema: { type: 'string' },
        },
      },
      schemas: {
        MessageCreateRequest: {
          type: 'object',
          required: ['content'],
          additionalProperties: false,
          properties: {
            content: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
              example: 'Review the contract.',
            },
          },
        },
        MessageReceiptResponse: {
          type: 'object',
          required: ['data'],
          properties: {
            data: { type: 'object' },
          },
        },
      },
    },
  };
}

const catalogEntry = {
  id: 'kokoro-bff-public-v1',
  owner: 'kokoro-bff',
  visibility: 'public',
  version: '1.0.0',
  source: {
    repository: 'https://github.com/LordFoxFairy/kokoro-bff.git',
    checkout: '../kokoro-bff',
    path: 'contract/openapi/v1/openapi.yaml',
    commit: '0123456789abcdef0123456789abcdef01234567',
  },
  digest: {
    algorithm: 'sha256',
    value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  },
  generation: { command: 'corepack pnpm reference:generate' },
  publication: { classification: 'public', include_in_portal: true },
};

test('renders schema regex constraints as literal code, never inferred links', async () => {
  const contract = fixtureContract();
  contract.components.schemas.MessageCreateRequest.properties.content.pattern = '^https://github\\.com/[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?/[A-Za-z0-9_.-]{1,100}$';
  const renderer = await createMarkdownRenderer('/tmp/kokoro-reference-render');
  const environment = {};
  const html = renderer.render(generateReferenceFiles(contract, catalogEntry).get('chat.md'), environment);
  assert.ok(environment.links.every((link) => /^\.\/schemas(?:\.html)?#/u.test(link)));
  assert.match(html, /<code>\^https:\/\/github/);
  for (const pattern of ['^(yes|no)$', '^(yes|no`)$']) {
    contract.components.schemas.MessageCreateRequest.properties.content.pattern = pattern;
    const rendered = renderer.render(generateReferenceFiles(contract, catalogEntry).get('chat.md'), {});
    assert.ok(rendered.includes(`<code>${pattern}</code>`), 'the displayed regex must preserve its original operators and backticks');
  }
});

test('rejects a non-public operation before reference generation', () => {
  assert.throws(
    () => assertPublicContract(fixtureContract('internal-owner'), catalogEntry),
    /createMessage must have public visibility/,
  );
});

test('publishes only explicit public operations and their reachable component graph without mutating the owner input', () => {
  const contract = fixtureContract();
  contract.paths['/skill.v1.SkillService/PrivateRead'] = {
    post: {
      ...structuredClone(contract.paths['/v1/sessions/{id}/messages'].post),
      operationId: 'privateRead',
      'x-kokoro-visibility': 'browser-private',
      requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/PrivateOnly' } } } },
    },
  };
  contract.components.schemas.PrivateOnly = { type: 'string', description: 'private-schema-must-not-publish' };
  contract.components.schemas.Nested = { type: 'object', properties: { next: { $ref: '#/components/schemas/Nested' } } };
  contract.components.schemas.MessageReceiptResponse.properties.data = { $ref: '#/components/schemas/Nested' };
  const before = structuredClone(contract);
  const files = generateReferenceFiles(contract, catalogEntry);
  const manifest = JSON.parse(files.get('manifest.json'));
  assert.equal(manifest.operationCount, 1);
  assert.ok(manifest.schemaNames.includes('Nested'));
  assert.equal(manifest.schemaNames.includes('PrivateOnly'), false);
  assert.doesNotMatch([...files.values()].join('\n'), /privateRead|PrivateOnly|PrivateRead|private-schema-must-not-publish/u);
  assert.deepEqual(contract, before);
});

test('uses declared owner idempotency for conditional mutations rather than inferring it from the HTTP verb', () => {
  const contract = fixtureContract();
  const operation = contract.paths['/v1/sessions/{id}/messages'].post;
  operation['x-kokoro-idempotency'] = 'none';
  operation.parameters = [{ name: 'If-Match', in: 'header', required: true, schema: { type: 'string' } }];
  const manifest = JSON.parse(generateReferenceFiles(contract, catalogEntry).get('manifest.json'));
  assert.equal(manifest.operations[0].idempotency, 'none');
});

test('rejects unknown publication classifications and unresolved public references', () => {
  const unknown = fixtureContract();
  unknown.paths['/v1/sessions/{id}/messages'].post['x-kokoro-visibility'] = 'new-unknown-surface';
  assert.throws(() => generateReferenceFiles(unknown, catalogEntry), /visibility/u);
  const unresolved = fixtureContract();
  unresolved.components.schemas.MessageReceiptResponse.properties.data = { $ref: '#/components/schemas/Absent' };
  assert.throws(() => generateReferenceFiles(unresolved, catalogEntry), /unresolved|reference/u);
});

test('renders owner permission namespaces and identifier templates while retaining publication guards', () => {
  const contract = fixtureContract();
  const operation = contract.paths['/v1/sessions/{id}/messages'].post;
  operation['x-kokoro-permission'] = 'iam:account-session.read';
  operation.description = 'Client conv_<UUID> uses skill:<skill_id> as a literal identifier.';
  operation['x-kokoro-fixed-visibility'] = 'private';
  contract.components.schemas.MessageCreateRequest['x-kokoro-json-byte-limit'] = 4096;
  const files = generateReferenceFiles(contract, catalogEntry);
  const rendered = files.get('chat.md');
  assert.match(rendered, /iam:account-session\.read/u);
  assert.match(rendered, /conv_&lt;UUID&gt;/u);
  assert.match(rendered, /skill:&lt;skill_id&gt;/u);
  assert.doesNotMatch(rendered, /<UUID>|<skill_id>/u);
  operation.description = 'Literal tag:<script>alert(1)</script> is still rejected.';
  assert.throws(() => generateReferenceFiles(contract, catalogEntry), /HTML|publication/u);
  operation.description = 'Valid description';
  contract.tags[0].name = 'safe_<textarea>';
  operation.tags = ['safe_<textarea>'];
  assert.throws(() => generateReferenceFiles(contract, catalogEntry), /HTML|publication/u);
});

test('generates deterministic operation, schema, and manifest files', () => {
  const first = generateReferenceFiles(fixtureContract(), catalogEntry);
  const second = generateReferenceFiles(fixtureContract(), catalogEntry);

  assert.deepEqual([...first], [...second]);
  assert.deepEqual([...first.keys()].sort(), [
    'chat.md',
    'index-fragment.md',
    'manifest.json',
    'schemas.md',
  ]);

  const chatPage = first.get('chat.md');
  for (const [name, title] of [['chat.md', 'Chat'], ['schemas.md', 'Schemas（数据结构）']]) {
    const frontmatter = /^---\n([\s\S]*?)\n---\n/u.exec(first.get(name));
    assert.ok(frontmatter, 'VitePress frontmatter must start the document, before comments');
    assert.deepEqual(parseYaml(frontmatter[1]), { title, outline: [2, 3, 4, 5], editLink: false });
  }
  assert.match(chatPage, /POST<\/span> `\/v1\/sessions\/\{id\}\/messages`/);
  assert.match(chatPage, /Operation ID.*`createMessage`/);
  assert.match(chatPage, /Idempotency-Key/);
  assert.match(chatPage, /Review the contract\./);
  assert.doesNotMatch(chatPage, /generated_at|Date\(|timestamp/i);

  const indexFragment = first.get('index-fragment.md');
  assert.match(
    indexFragment,
    /\]\(\/reference\/v1\/generated\/chat#create-message\)/,
  );
  assert.doesNotMatch(indexFragment, /\]\(\.\//);

  const manifest = JSON.parse(first.get('manifest.json'));
  assert.deepEqual(manifest.items, [
    { text: 'Chat', link: '/reference/v1/generated/chat' },
    { text: 'Schemas', link: '/reference/v1/generated/schemas' },
  ]);
});

test('renders the complete public metadata and field-level constraints', () => {
  const contract = fixtureContract();
  contract.components.schemas.MessageReceiptResponse.properties = {
    data: {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', minLength: 1 },
            },
          },
        },
      },
    },
  };
  const files = generateReferenceFiles(contract, catalogEntry);
  const chatPage = files.get('chat.md');
  const schemasPage = files.get('schemas.md');
  const manifest = JSON.parse(files.get('manifest.json'));

  assert.match(chatPage, /Owner.*`kokoro-bff`/);
  assert.match(chatPage, /Visibility.*`public`/);
  assert.match(chatPage, /Stability.*`beta`/);
  assert.match(chatPage, /Idempotency.*`required`/);
  assert.match(chatPage, /Max length.*200/);
  assert.match(chatPage, /Example.*`req_example`/s);
  assert.match(chatPage, /X-Request-Id/);
  assert.match(schemasPage, /`data\.items`/);
  assert.match(schemasPage, /`data\.items\[\]\.id`/);
  assert.equal(manifest.owner, 'kokoro-bff');
  assert.equal(manifest.visibility, 'public');
  assert.deepEqual(manifest.operations[0], {
    idempotency: 'required',
    method: 'POST',
    operationId: 'createMessage',
    owner: 'kokoro-bff',
    path: '/v1/sessions/{id}/messages',
    permission: 'chat.message.create',
    stability: 'beta',
    tag: 'Chat',
    visibility: 'public',
  });
});

test('resolves component request, response, and example references', () => {
  const contract = fixtureContract();
  const operation = contract.paths['/v1/sessions/{id}/messages'].post;
  const requestBody = operation.requestBody;
  const response = operation.responses[202];
  contract.components.requestBodies = { MessageBody: requestBody };
  contract.components.responses = { Accepted: response };
  contract.components.examples = {
    AcceptedBody: { value: { data: { ok: true } } },
  };
  operation.requestBody = { $ref: '#/components/requestBodies/MessageBody' };
  operation.responses = { 202: { $ref: '#/components/responses/Accepted' } };
  contract.components.responses.Accepted.content['application/json'].examples = {
    accepted: { $ref: '#/components/examples/AcceptedBody' },
  };

  const files = generateReferenceFiles(contract, catalogEntry);
  const page = files.get('chat.md');
  assert.match(page, /\{\n\x20{2}"data": \{\n\x20{4}"ok": true/u);
  assert.match(page, /Response `202`/);
});

test('rejects unsupported metadata and mismatched idempotency parameters', () => {
  const unsupported = fixtureContract();
  unsupported.paths['/v1/sessions/{id}/messages'].post['x-kokoro-stability'] =
    'not-a-state';
  assert.throws(
    () => assertPublicContract(unsupported, catalogEntry),
    /unsupported x-kokoro-stability/,
  );

  const mismatch = fixtureContract();
  mismatch.paths['/v1/sessions/{id}/messages'].post.parameters = [];
  assert.throws(
    () => assertPublicContract(mismatch, catalogEntry),
    /must reference Idempotency-Key/,
  );
});

test('rejects publication-unsafe canonical examples', () => {
  const unsafe = fixtureContract();
  unsafe.paths['/v1/sessions/{id}/messages'].post.requestBody.content[
    'application/json'
  ].example = {
    content: ['sk', 'live', '1234567890abcdefghijkl'].join('_'),
  };

  assert.throws(
    () => generateReferenceFiles(unsafe, catalogEntry),
    /publication|secret/i,
  );
});

test('rejects publication-unsafe extensions and URL schemes', () => {
  const unsafeHeader = fixtureContract();
  unsafeHeader.paths['/v1/sessions/{id}/messages'].post['x-kokoro-private'] =
    'hidden';
  assert.throws(
    () => assertPublicContract(unsafeHeader, catalogEntry),
    /publication|unknown Kokoro extension/i,
  );

  const unsafeUrl = fixtureContract();
  unsafeUrl.paths['/v1/sessions/{id}/messages'].post.description = [
    'java',
    'script:alert(1)',
  ].join('');
  assert.throws(
    () => generateReferenceFiles(unsafeUrl, catalogEntry),
    /publication|URL scheme/i,
  );
});

test('rejects raw HTML in canonical descriptions while allowing generator markup', () => {
  const unsafe = fixtureContract();
  unsafe.paths['/v1/sessions/{id}/messages'].post.description =
    '<script>alert(1)</script>';
  assert.throws(
    () => generateReferenceFiles(unsafe, catalogEntry),
    /raw HTML|comments/i,
  );

  assert.doesNotThrow(() => generateReferenceFiles(fixtureContract(), catalogEntry));
});

test('keeps example content inside a dynamically sized code fence', () => {
  const rendered = renderExample({ content: '```' });
  assert.match(rendered, /````json\n/u);
  assert.match(rendered, /\n````\n$/u);
});

test('distinguishes URL schemes from object-like data fields', () => {
  assert.doesNotThrow(() => assertPublicationSafe('{"data":{"ok":true}}'));
  assert.throws(
    () => assertPublicationSafe('data:text/html,<script>alert(1)</script>'),
    /dangerous URL scheme/,
  );
});

test('keeps reference replacement inside managed or temporary directories', () => {
  const files = generateReferenceFiles(fixtureContract(), catalogEntry);
  const unmanaged = mkdtempSync(join(tmpdir(), 'kokoro-unmanaged-'));
  try {
    writeFileSync(join(unmanaged, 'unrelated.txt'), 'do not remove');
    assert.throws(
      () => writeReferenceFiles(files, unmanaged),
      /unmanaged temporary directory/,
    );
  } finally {
    rmSync(unmanaged, { force: true, recursive: true });
  }

  assert.throws(
    () => writeReferenceFiles(files, process.cwd()),
    /must be inside/,
  );
  const escapeDirectory = mkdtempSync(join(tmpdir(), 'kokoro-escape-'));
  try {
    assert.throws(
      () =>
        writeReferenceFiles(
          new Map([['../escape.md', 'x']]),
          escapeDirectory,
        ),
      /escapes output directory/,
    );
  } finally {
    rmSync(escapeDirectory, { force: true, recursive: true });
  }
});

test('rejects a temporary output path hidden behind an escaping symlink', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'kokoro-output-root-'));
  const outside = mkdtempSync(join(homedir(), '.kokoro-output-outside-'));
  const link = join(temporaryRoot, 'link');
  try {
    symlinkSync(outside, link, 'dir');
    assert.throws(
      () =>
        writeReferenceFiles(
          generateReferenceFiles(fixtureContract(), catalogEntry),
          join(link, 'generated'),
        ),
      /must be inside/,
    );
  } finally {
    rmSync(temporaryRoot, { force: true, recursive: true });
    rmSync(outside, { force: true, recursive: true });
  }
});

test('replaces stale generated output atomically', () => {
  const directory = mkdtempSync(join(tmpdir(), 'kokoro-reference-'));
  try {
    writeFileSync(
      join(directory, 'manifest.json'),
      JSON.stringify({ generatedBy: 'kokoro-developer-docs/reference-v1' }),
    );
    writeFileSync(join(directory, 'stale.md'), 'stale');

    writeReferenceFiles(
      generateReferenceFiles(fixtureContract(), catalogEntry),
      directory,
    );

    assert.throws(() => readFileSync(join(directory, 'stale.md')));
    assert.match(
      readFileSync(join(directory, 'chat.md'), 'utf8'),
      /Generated from the pinned canonical OpenAPI/,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
