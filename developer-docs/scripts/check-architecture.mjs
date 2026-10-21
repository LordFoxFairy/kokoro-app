import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertGeneratedReferencePublication,
  assertPortalArchitecture,
} from './lib/architecture.mjs';
import { loadCatalog } from './lib/catalog.mjs';
import { loadPinnedPublicContract } from './lib/contract.mjs';

function operationCount(contract) {
  return Object.values(contract.paths ?? {}).reduce(
    (count, pathItem) =>
      count +
      Object.keys(pathItem ?? {}).filter((key) =>
        ['delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace'].includes(
          key.toLowerCase(),
        ),
      ).length,
    0,
  );
}

function trackedGeneratedFiles(portalRoot) {
  return execFileSync(
    'git',
    [
      '-C',
      portalRoot,
      'ls-files',
      '--',
      'docs/reference/v1/generated',
    ],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean);
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const portalRoot = resolve(scriptDirectory, '..');
const sourceAudit = assertPortalArchitecture(portalRoot);
const generatedAudit = assertGeneratedReferencePublication(portalRoot);
const catalog = loadCatalog(join(portalRoot, 'catalog/contracts.yaml'));
let operations = 0;

for (const entry of catalog.contracts) {
  const { contract } = loadPinnedPublicContract(entry, {
    portalRoot,
    checkoutOverride: process.env.KOKORO_BFF_CHECKOUT,
  });
  operations += operationCount(contract);
}

const trackedGenerated = trackedGeneratedFiles(portalRoot);
if (trackedGenerated.length > 0) {
  throw new Error(
    `generated reference output must stay untracked: ${trackedGenerated.join(', ')}`,
  );
}

process.stdout.write(
  `architecture ok: publication_files=${sourceAudit.filesScanned} generated_files=${generatedAudit.filesScanned} public_contracts=${catalog.contracts.length} operations=${operations} tracked_generated_files=0\n`,
);
