import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { loadCatalog } from '../scripts/lib/catalog.mjs';
import { loadPinnedPublicContract } from '../scripts/lib/contract.mjs';
import { loadExampleManifest } from '../scripts/lib/example-validation.mjs';
import { runExecutableExamples } from '../scripts/lib/example-runner.mjs';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const portalRoot = resolve(testDirectory, '..');

test('runs every published example against the credential-free HTTP fixture', async () => {
  const catalog = loadCatalog(join(portalRoot, 'catalog/contracts.yaml'));
  const entry = catalog.contracts[0];
  assert.ok(entry);
  const { contract } = loadPinnedPublicContract(entry, { portalRoot });
  const manifest = loadExampleManifest(
    join(portalRoot, 'examples/manifest.yaml'),
    contract,
    { portalRoot },
  );

  const results = await runExecutableExamples(manifest, { portalRoot });

  assert.deepEqual(
    results.map((result) => result.id),
    [
      'curl-create-run',
      'curl-cancel-run',
      'curl-upload-resource',
      'typescript-run-lifecycle',
      'python-cursor-pagination',
    ],
  );
  assert.ok(results.every((result) => result.exitCode === 0));
});

test('lifecycle example consumes a live stream incrementally before resuming', () => {
  const source = readFileSync(
    join(portalRoot, 'examples/typescript/run-lifecycle.ts'),
    'utf8',
  );

  assert.match(source, /getReader\(\)/u);
  assert.match(source, /AbortController/u);
  assert.match(source, /kokoro\.interaction\.state/u);
  assert.match(source, /Last-Event-ID/u);
});
