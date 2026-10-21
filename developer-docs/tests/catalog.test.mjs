import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCatalogText } from '../scripts/lib/catalog.mjs';

const validCatalog = `
schema_version: 1
contracts:
  - id: kokoro-bff-public-v1
    owner: kokoro-bff
    visibility: public
    version: 1.0.0
    source:
      repository: https://github.com/LordFoxFairy/kokoro-bff.git
      checkout: ../kokoro-bff
      path: contract/openapi/v1/openapi.yaml
      commit: 0123456789abcdef0123456789abcdef01234567
    digest:
      algorithm: sha256
      value: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    generation:
      command: corepack pnpm reference:generate
    publication:
      classification: public
      include_in_portal: true
`;

test('accepts the canonical public BFF catalog entry', () => {
  const catalog = parseCatalogText(validCatalog, 'fixture/contracts.yaml');

  assert.equal(catalog.contracts.length, 1);
  assert.equal(catalog.contracts[0]?.owner, 'kokoro-bff');
  assert.equal(
    catalog.contracts[0]?.source.path,
    'contract/openapi/v1/openapi.yaml',
  );
});

test('rejects internal owners from the public catalog', () => {
  const internalCatalog = validCatalog.replace(
    'owner: kokoro-bff',
    'owner: kokoro-agent',
  );

  assert.throws(
    () => parseCatalogText(internalCatalog, 'fixture/contracts.yaml'),
    /owner must be kokoro-bff/,
  );
});

test('rejects a source path outside the canonical BFF OpenAPI', () => {
  const copiedContract = validCatalog.replace(
    'path: contract/openapi/v1/openapi.yaml',
    'path: ../root/contracts/openapi.yaml',
  );

  assert.throws(
    () => parseCatalogText(copiedContract, 'fixture/contracts.yaml'),
    /source path must be contract\/openapi\/v1\/openapi.yaml/,
  );
});
