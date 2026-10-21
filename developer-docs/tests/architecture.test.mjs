import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertGeneratedReferencePublication,
  assertPortalArchitecture,
  auditPortalArchitecture,
} from '../scripts/lib/architecture.mjs';

function portalFixture() {
  const root = mkdtempSync(join(tmpdir(), 'kokoro-portal-architecture-'));
  mkdirSync(join(root, 'docs/guides'), { recursive: true });
  mkdirSync(join(root, 'examples/curl'), { recursive: true });
  mkdirSync(join(root, 'catalog'), { recursive: true });
  writeFileSync(
    join(root, 'docs/index.md'),
    '# Public API\n\n[x](/guides/create-run)\n',
  );
  writeFileSync(join(root, 'docs/guides/create-run.md'), '# Create a run\n');
  writeFileSync(
    join(root, 'examples/curl/create-run.sh'),
    'curl --header "x-kokoro-service: web-bff" "$KOKORO_BASE_URL/v1/sessions"\n',
  );
  writeFileSync(join(root, 'catalog/contracts.yaml'), 'schema_version: 1\n');
  return root;
}

test('accepts publication sources with only public portal inputs', () => {
  const root = portalFixture();

  const result = assertPortalArchitecture(root);

  assert.equal(result.violations.length, 0);
  assert.equal(result.filesScanned, 4);
});

test('rejects copied contracts, database schemas, and internal generated DTOs', () => {
  const root = portalFixture();
  writeFileSync(join(root, 'docs/openapi.yaml'), 'openapi: 3.1.0\n');
  writeFileSync(join(root, 'docs/private-schema.sql'), 'CREATE TABLE secret ();\n');
  mkdirSync(join(root, 'docs/generated/internal'), { recursive: true });
  writeFileSync(join(root, 'docs/generated/internal/user.ts'), 'export {};\n');

  const result = auditPortalArchitecture(root);

  assert.deepEqual(
    result.violations.map(({ rule }) => rule).sort(),
    ['canonical-source-only', 'no-database-schema', 'no-internal-generated-dto'],
  );
});

test('rejects secret literals and headers outside the public allowlist', () => {
  const root = portalFixture();
  const bearer = [
    'eyJhbGciOiJIUzI1NiJ9',
    'eyJzdWIiOiIxIn0',
    'signature',
  ].join('.');
  const privateHeader = ['x-kokoro-root', 'token: leaked'].join('-');
  const liveKey = ['sk', 'live', '1234567890abcdefghijkl'].join('_');
  writeFileSync(
    join(root, 'docs/unsafe.md'),
    [
      '# Unsafe',
      `Authorization: Bearer ${bearer}`,
      privateHeader,
      liveKey,
    ].join('\n'),
  );

  assert.throws(
    () => assertPortalArchitecture(root),
    (error) => {
      assert.match(error.message, /no-secret-literals/);
      assert.match(error.message, /public-header-allowlist/);
      return true;
    },
  );
});

test('rejects publication links that escape into an internal owner checkout', () => {
  const root = portalFixture();
  const privatePath = ['..', '..', 'kokoro-agent', 'contract', 'openapi.yaml'].join(
    '/',
  );
  writeFileSync(
    join(root, 'docs/unsafe.md'),
    `[private](${privatePath})\n`,
  );

  assert.throws(
    () => assertPortalArchitecture(root),
    /no-internal-owner-paths/,
  );
});

test('scans generated reference output with the publication policy', () => {
  const root = portalFixture();
  mkdirSync(join(root, 'docs/reference/v1/generated'), { recursive: true });
  writeFileSync(
    join(root, 'docs/reference/v1/generated/manifest.json'),
    JSON.stringify({ generatedBy: 'kokoro-developer-docs/reference-v1' }),
  );
  writeFileSync(
    join(root, 'docs/reference/v1/generated/chat.md'),
    '<script>alert(1)</script>',
  );

  assert.throws(
    () => assertGeneratedReferencePublication(root),
    /publication|HTML/i,
  );
});
