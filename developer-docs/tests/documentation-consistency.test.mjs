import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { loadCatalog } from '../scripts/lib/catalog.mjs';
import { loadPinnedPublicContract } from '../scripts/lib/contract.mjs';
import { generateReferenceFiles } from '../scripts/lib/reference-generator.mjs';
import { collectSchemaRows } from '../scripts/lib/schema-renderer.mjs';

const portalRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const docsRoot = join(portalRoot, 'docs');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function authoredMarkdown(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '.vitepress' && entry.name !== 'generated') {
        files.push(...authoredMarkdown(path));
      }
    } else if (entry.isFile() && path.endsWith('.md')) {
      files.push(path);
    }
  }
  return files;
}

test('authored portal pages are Chinese and the required reading route exists', () => {
  const files = authoredMarkdown(docsRoot);
  assert.ok(files.length > 0);
  for (const path of files) {
    assert.match(
      readFileSync(path, 'utf8'),
      /[\u3400-\u9fff]/u,
      `${path} must contain Chinese editorial text`,
    );
  }

  const config = readFileSync(join(docsRoot, '.vitepress/config.mts'), 'utf8');
  for (const route of [
    '/introduction',
    '/quickstart',
    '/authentication',
    '/reference/v1/',
    '/platform/responses-errors',
    '/platform/idempotency',
    '/concepts/ag-ui',
    '/guides/cursor-pagination',
    '/changelog',
    '/provenance',
  ]) {
    assert.match(config, new RegExp(`link: '${route.replaceAll('/', '\\/')}`));
  }
  assert.match(config, /lang: 'zh-CN'/u);
});

test('the generated reference is the metadata inventory for the pinned BFF contract', () => {
  const catalog = loadCatalog(join(portalRoot, 'catalog/contracts.yaml'));
  const entry = catalog.contracts[0];
  assert.ok(entry);
  const { contract } = loadPinnedPublicContract(entry, { portalRoot });
  const files = generateReferenceFiles(contract, entry);
  const manifest = JSON.parse(files.get('manifest.json'));

  assert.equal(manifest.owner, entry.owner);
  assert.equal(manifest.visibility, entry.visibility);
  assert.equal(manifest.version, entry.version);
  assert.equal(manifest.operationCount, manifest.operations.length);
  assert.equal(manifest.schemaCount, manifest.schemaNames.length);
  assert.ok(manifest.operations.every((operation) =>
    operation.owner === entry.owner
      && operation.visibility === entry.visibility
      && ['stable', 'beta', 'experimental'].includes(operation.stability)
      && ['none', 'required'].includes(operation.idempotency),
  ));

  const referenceText = [...files.values()].join('\n');
  for (const term of ['Owner', 'Visibility', 'Stability', 'Idempotency']) {
    assert.match(referenceText, new RegExp(term));
  }

  const sourceOperations = [];
  for (const [path, pathItem] of Object.entries(contract.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!['get', 'head', 'options', 'trace', 'post', 'put', 'patch', 'delete'].includes(method)) {
        continue;
      }
      sourceOperations.push({
        method: method.toUpperCase(),
        operationId: operation.operationId,
        path,
      });
    }
  }
  assert.deepEqual(
    manifest.operations.map(({ method, operationId, path }) => ({ method, operationId, path })),
    sourceOperations,
  );

  const schemas = contract.components?.schemas ?? {};
  const schemaText = files.get('schemas.md');
  assert.ok(schemaText);
  for (const schema of Object.values(schemas)) {
    for (const row of collectSchemaRows(contract, schema)) {
      assert.match(
        schemaText,
        new RegExp('`' + escapeRegExp(row.path) + '`', 'u'),
      );
    }
  }

  const responseHeaderNames = [];
  for (const pathItem of Object.values(contract.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!['get', 'head', 'options', 'trace', 'post', 'put', 'patch', 'delete'].includes(method)) {
        continue;
      }
      for (const response of Object.values(operation.responses ?? {})) {
        for (const name of Object.keys(response.headers ?? {})) {
          responseHeaderNames.push(name);
        }
      }
    }
  }
  for (const name of new Set(responseHeaderNames)) {
    assert.match(referenceText, new RegExp('`' + escapeRegExp(name) + '`'));
  }
});

test('authored policy pages distinguish contract facts from non-contract guidance', () => {
  const pages = [
    'authentication.md',
    'platform/responses-errors.md',
    'platform/rate-limits-retries.md',
    'platform/versioning.md',
    'concepts/ag-ui.md',
  ].map((path) => readFileSync(join(docsRoot, path), 'utf8')).join('\n');

  assert.match(pages, /唯一字段事实源|唯一.*事实源/u);
  assert.match(pages, /不属于.*契约|未发布|当前.*未/u);
  assert.doesNotMatch(pages, /x-kokoro-request-id.*可选|可携带.*x-kokoro-request-id/u);
  assert.match(pages, /readyz|就绪/u);
});

test('authored protocol pages cite only observable BFF facts', () => {
  const catalog = loadCatalog(join(portalRoot, 'catalog/contracts.yaml'));
  const entry = catalog.contracts[0];
  assert.ok(entry);
  const { contract } = loadPinnedPublicContract(entry, { portalRoot });
  const authentication = readFileSync(join(docsRoot, 'authentication.md'), 'utf8');
  const requestIds = readFileSync(join(docsRoot, 'platform/request-ids.md'), 'utf8');
  const errors = readFileSync(join(docsRoot, 'platform/responses-errors.md'), 'utf8');
  const rateLimits = readFileSync(join(docsRoot, 'platform/rate-limits-retries.md'), 'utf8');
  const time = readFileSync(join(docsRoot, 'platform/time.md'), 'utf8');
  const projects = readFileSync(join(docsRoot, 'concepts/projects.md'), 'utf8');

  const schemes = contract.components?.securitySchemes ?? {};
  for (const scheme of Object.values(schemes)) {
    if (scheme.type === 'apiKey' && typeof scheme.name === 'string') {
      assert.match(authentication, new RegExp('`' + escapeRegExp(scheme.name) + '`'));
    }
  }

  const streamResponse = contract.paths['/v1/sessions/{id}/events']?.get?.responses?.['200'];
  const streamHeader = streamResponse?.headers?.['X-Kokoro-Request-Id'];
  assert.ok(streamHeader);
  assert.match(requestIds, /X-Kokoro-Request-Id/u);
  assert.match(errors, /X-Kokoro-Request-Id/u);

  const readyResponses = contract.paths['/readyz']?.get?.responses ?? {};
  assert.equal(readyResponses['503']?.content?.['application/json']?.schema?.$ref,
    '#/components/schemas/HealthResponse');
  assert.match(errors, /readyz.*503|503.*HealthResponse/u);
  const limited = Object.values(contract.paths).flatMap((item) => Object.values(item))
    .filter((operation) => operation?.responses?.['429']?.headers?.['Retry-After']);
  assert.ok(limited.length > 0);
  assert.match(rateLimits, /429/u);
  assert.match(rateLimits, /Retry-After/u);

  const revision = contract.components?.schemas?.ProjectInstructionRevision;
  assert.ok(revision);
  assert.ok(revision.properties?.updated_at);
  assert.ok(revision.properties?.actor_name);
  assert.match(time, /updated_at/u);
  assert.match(time, /actor_name/u);
  assert.match(time, /原始 wire shape|不要从字段名猜测/u);
  assert.match(projects, /updated_at/u);
  assert.match(projects, /actor_name/u);
  assert.doesNotMatch(time, /updatedAt|actorName/u);
  assert.doesNotMatch(projects, /updatedAt|actorName/u);
});
