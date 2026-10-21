import assert from 'node:assert/strict';
import test from 'node:test';

import { validateExampleManifest } from '../scripts/lib/example-validation.mjs';

const contract = {
  openapi: '3.1.0',
  info: { title: 'Fixture API', version: '1.0.0' },
  paths: {
    '/v1/sessions/{id}/messages': {
      post: {
        operationId: 'createMessage',
        'x-kokoro-owner': 'kokoro-bff',
        'x-kokoro-visibility': 'public',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageCreateRequest' },
            },
          },
        },
        responses: { 202: { description: 'Accepted' } },
      },
    },
  },
  components: {
    schemas: {
      MessageCreateRequest: {
        type: 'object',
        required: ['content'],
        additionalProperties: false,
        properties: {
          content: { type: 'string', minLength: 1 },
        },
      },
    },
  },
};

function manifest(body = { content: 'Review the contract.' }) {
  return {
    schema_version: 1,
    examples: [
      {
        id: 'typescript-create-run',
        file: 'examples/typescript/run-lifecycle.ts',
        runtime: 'tsx',
        operations: [
          {
            operation_id: 'createMessage',
            content_type: 'application/json',
            request_body: body,
          },
        ],
      },
    ],
  };
}

test('accepts an example request that satisfies the public operation schema', () => {
  const result = validateExampleManifest(manifest(), contract, {
    checkFiles: false,
    portalRoot: '/fixture',
  });

  assert.equal(result.examples.length, 1);
  assert.equal(result.operationCount, 1);
});

test('rejects an example request with an invalid body', () => {
  assert.throws(
    () =>
      validateExampleManifest(manifest({ content: '' }), contract, {
        checkFiles: false,
        portalRoot: '/fixture',
      }),
    /typescript-create-run.*request body.*must NOT have fewer than 1 characters/,
  );
});

test('rejects an example that references a non-public operation', () => {
  const unknown = manifest();
  unknown.examples[0].operations[0].operation_id = 'internalRunIngress';

  assert.throws(
    () =>
      validateExampleManifest(unknown, contract, {
        checkFiles: false,
        portalRoot: '/fixture',
      }),
    /unknown public operation internalRunIngress/,
  );
});

test('rejects an example file outside the portal examples directory', () => {
  const escaped = manifest();
  escaped.examples[0].file = ['..', 'kokoro-agent', 'private.py'].join('/');

  assert.throws(
    () =>
      validateExampleManifest(escaped, contract, {
        checkFiles: false,
        portalRoot: '/fixture',
      }),
    /must stay under examples\//,
  );
});
