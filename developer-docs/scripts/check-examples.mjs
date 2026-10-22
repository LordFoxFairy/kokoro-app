import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCatalog } from './lib/catalog.mjs';
import { loadPinnedPublicContract } from './lib/contract.mjs';
import { runExecutableExamples } from './lib/example-runner.mjs';
import { loadExampleManifest } from './lib/example-validation.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const portalRoot = resolve(scriptDirectory, '..');
const catalog = loadCatalog(join(portalRoot, 'catalog/contracts.yaml'));
const entry = catalog.contracts[0];
if (entry === undefined) throw new Error('public contract catalog is empty');
const { contract } = loadPinnedPublicContract(entry, {
  portalRoot,
  checkoutOverride: process.env.KOKORO_BFF_CHECKOUT,
});
const manifest = loadExampleManifest(
  join(portalRoot, 'examples/manifest.yaml'),
  contract,
  { portalRoot },
);
const results = await runExecutableExamples(manifest, { portalRoot });
for (const result of results) {
  process.stdout.write(
    `example ok: ${result.id} output=${JSON.stringify(result.stdout.trim())}\n`,
  );
}
process.stdout.write(
  `examples ok: files=${results.length} operation_calls=${manifest.operationCount}\n`,
);
