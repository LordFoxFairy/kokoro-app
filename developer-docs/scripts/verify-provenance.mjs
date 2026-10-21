import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { loadCatalog } from './lib/catalog.mjs';
import { verifyContractEntry } from './lib/provenance.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const portalRoot = resolve(scriptDirectory, '..');
const catalog = loadCatalog(join(portalRoot, 'catalog/contracts.yaml'));

for (const entry of catalog.contracts) {
  const result = verifyContractEntry(entry, {
    portalRoot,
    checkoutOverride: process.env.KOKORO_BFF_CHECKOUT,
  });
  process.stdout.write(
    `provenance ok: ${result.id} version=${result.version} commit=${result.commit} digest=${result.digest} contract_source=${result.contractSourceState} repository_worktree=${result.repositoryWorktreeState}\n`,
  );
}
