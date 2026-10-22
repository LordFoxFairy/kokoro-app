import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { loadCatalog } from './lib/catalog.mjs';
import { loadPinnedPublicContract } from './lib/contract.mjs';
import {
  generateReferenceFiles,
  writeReferenceFiles,
} from './lib/reference-generator.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const portalRoot = resolve(scriptDirectory, '..');
const outputDirectory = process.env.KOKORO_REFERENCE_OUTPUT
  ? resolve(process.env.KOKORO_REFERENCE_OUTPUT)
  : join(portalRoot, 'docs/reference/v1/generated');
const catalog = loadCatalog(join(portalRoot, 'catalog/contracts.yaml'));
const entry = catalog.contracts[0];
if (entry === undefined) {
  throw new Error('public contract catalog is empty');
}

const { contract } = loadPinnedPublicContract(entry, {
  portalRoot,
  checkoutOverride: process.env.KOKORO_BFF_CHECKOUT,
});
const files = generateReferenceFiles(contract, entry);
writeReferenceFiles(files, outputDirectory, { portalRoot });
process.stdout.write(
  `generated ${files.size} reference files for ${entry.id} at ${outputDirectory}\n`,
);
