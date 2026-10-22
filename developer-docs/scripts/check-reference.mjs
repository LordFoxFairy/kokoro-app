import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCatalog } from './lib/catalog.mjs';
import { loadPinnedPublicContract } from './lib/contract.mjs';
import {
  generateReferenceFiles,
  writeReferenceFiles,
} from './lib/reference-generator.mjs';

function walkFiles(directory) {
  const paths = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      paths.push(fullPath);
    }
  }
  return paths.sort((left, right) => left.localeCompare(right, 'en'));
}

function directoryDigest(directory) {
  const hash = createHash('sha256');
  for (const path of walkFiles(directory)) {
    hash.update(relative(directory, path));
    hash.update('\0');
    hash.update(readFileSync(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const portalRoot = resolve(scriptDirectory, '..');
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
const first = mkdtempSync(join(tmpdir(), 'kokoro-reference-a-'));
const second = mkdtempSync(join(tmpdir(), 'kokoro-reference-b-'));

try {
  writeReferenceFiles(files, first);
  writeReferenceFiles(generateReferenceFiles(contract, entry), second);
  const firstDigest = directoryDigest(first);
  const secondDigest = directoryDigest(second);
  if (firstDigest !== secondDigest) {
    throw new Error(
      `reference generation is nondeterministic: ${firstDigest} != ${secondDigest}`,
    );
  }
  const outputDirectory = join(portalRoot, 'docs/reference/v1/generated');
  writeReferenceFiles(files, outputDirectory, { portalRoot });
  const manifest = JSON.parse(
    readFileSync(join(outputDirectory, 'manifest.json'), 'utf8'),
  );
  process.stdout.write(
    `reference ok: operations=${manifest.operationCount} files=${files.size} digest=${firstDigest}\n`,
  );
} finally {
  rmSync(first, { force: true, recursive: true });
  rmSync(second, { force: true, recursive: true });
}
