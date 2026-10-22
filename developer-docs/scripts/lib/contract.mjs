import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseDocument } from 'yaml';

import { verifyContractEntry } from './provenance.mjs';
import { assertPublicContract } from './reference-generator.mjs';
import { publicContractView } from './public-contract.mjs';

export function loadPinnedPublicContract(entry, options) {
  const provenance = verifyContractEntry(entry, options);
  const sourcePath = resolve(provenance.checkout, entry.source.path);
  const content = readFileSync(sourcePath);
  const digest = createHash('sha256').update(content).digest('hex');
  if (digest !== entry.digest.value) {
    throw new Error(
      `canonical contract changed during verification for ${entry.id}`,
    );
  }

  const document = parseDocument(content.toString('utf8'), { uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new Error(
      `canonical OpenAPI is invalid YAML: ${document.errors[0]?.message ?? 'unknown parse error'}`,
    );
  }
  const contract = publicContractView(document.toJS());
  assertPublicContract(contract, entry);
  return { contract, provenance };
}
