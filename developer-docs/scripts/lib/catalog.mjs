import { readFileSync } from 'node:fs';

import { parseDocument } from 'yaml';

const PUBLIC_CONTRACT = Object.freeze({
  owner: 'kokoro-bff',
  repository: 'https://github.com/LordFoxFairy/kokoro-bff.git',
  sourcePath: 'contract/openapi/v1/openapi.yaml',
});

function assertRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new CatalogError(`${label} must be a mapping`);
  }
  return value;
}

function assertKeys(record, allowedKeys, label) {
  const unknownKeys = Object.keys(record).filter(
    (key) => !allowedKeys.includes(key),
  );
  if (unknownKeys.length > 0) {
    throw new CatalogError(
      `${label} contains unknown keys: ${unknownKeys.sort().join(', ')}`,
    );
  }
}

function requiredString(record, key, label) {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CatalogError(`${label}.${key} must be a non-empty string`);
  }
  return value;
}

function parseSource(entry, label) {
  const sourceLabel = `${label}.source`;
  const source = assertRecord(entry.source, sourceLabel);
  assertKeys(source, ['repository', 'checkout', 'path', 'commit'], sourceLabel);
  const repository = requiredString(source, 'repository', sourceLabel);
  const checkout = requiredString(source, 'checkout', sourceLabel);
  const sourcePath = requiredString(source, 'path', sourceLabel);
  const commit = requiredString(source, 'commit', sourceLabel);
  if (repository !== PUBLIC_CONTRACT.repository) {
    throw new CatalogError(
      `${sourceLabel} repository must be ${PUBLIC_CONTRACT.repository}`,
    );
  }
  if (sourcePath !== PUBLIC_CONTRACT.sourcePath) {
    throw new CatalogError(
      `${sourceLabel} path must be ${PUBLIC_CONTRACT.sourcePath}`,
    );
  }
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new CatalogError(`${sourceLabel}.commit must be a full Git SHA`);
  }
  return { repository, checkout, path: sourcePath, commit };
}

function parseDigest(entry, label) {
  const digestLabel = `${label}.digest`;
  const digest = assertRecord(entry.digest, digestLabel);
  assertKeys(digest, ['algorithm', 'value'], digestLabel);
  const algorithm = requiredString(digest, 'algorithm', digestLabel);
  const value = requiredString(digest, 'value', digestLabel);
  if (algorithm !== 'sha256') {
    throw new CatalogError(`${digestLabel}.algorithm must be sha256`);
  }
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new CatalogError(
      `${digestLabel}.value must be a lowercase SHA-256 digest`,
    );
  }
  return { algorithm, value };
}

function parseGeneration(entry, label) {
  const generationLabel = `${label}.generation`;
  const generation = assertRecord(entry.generation, generationLabel);
  assertKeys(generation, ['command'], generationLabel);
  return { command: requiredString(generation, 'command', generationLabel) };
}

function parsePublication(entry, label) {
  const publicationLabel = `${label}.publication`;
  const publication = assertRecord(entry.publication, publicationLabel);
  assertKeys(
    publication,
    ['classification', 'include_in_portal'],
    publicationLabel,
  );
  const classification = requiredString(
    publication,
    'classification',
    publicationLabel,
  );
  if (classification !== 'public') {
    throw new CatalogError(`${publicationLabel}.classification must be public`);
  }
  if (publication.include_in_portal !== true) {
    throw new CatalogError(`${publicationLabel}.include_in_portal must be true`);
  }
  return { classification, include_in_portal: true };
}

function parseEntry(value, index) {
  const label = `contracts[${index}]`;
  const entry = assertRecord(value, label);
  assertKeys(
    entry,
    [
      'id',
      'owner',
      'visibility',
      'version',
      'source',
      'digest',
      'generation',
      'publication',
    ],
    label,
  );

  const id = requiredString(entry, 'id', label);
  const owner = requiredString(entry, 'owner', label);
  const visibility = requiredString(entry, 'visibility', label);
  const version = requiredString(entry, 'version', label);
  if (id !== 'kokoro-bff-public-v1') {
    throw new CatalogError(`${label}.id must be kokoro-bff-public-v1`);
  }
  if (owner !== PUBLIC_CONTRACT.owner) {
    throw new CatalogError(`${label}.owner must be kokoro-bff`);
  }
  if (visibility !== 'public') {
    throw new CatalogError(`${label}.visibility must be public`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new CatalogError(`${label}.version must be a semantic version`);
  }

  return {
    id,
    owner,
    visibility,
    version,
    source: parseSource(entry, label),
    digest: parseDigest(entry, label),
    generation: parseGeneration(entry, label),
    publication: parsePublication(entry, label),
  };
}

export class CatalogError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CatalogError';
  }
}

export function parseCatalogText(text, sourceLabel = 'contracts.yaml') {
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new CatalogError(
      `${sourceLabel} is invalid YAML: ${document.errors[0]?.message ?? 'unknown parse error'}`,
    );
  }

  const root = assertRecord(document.toJS(), sourceLabel);
  assertKeys(root, ['schema_version', 'contracts'], sourceLabel);
  if (root.schema_version !== 1) {
    throw new CatalogError(`${sourceLabel}.schema_version must be 1`);
  }
  if (!Array.isArray(root.contracts) || root.contracts.length !== 1) {
    throw new CatalogError(
      `${sourceLabel}.contracts must contain exactly one public BFF contract`,
    );
  }

  return {
    schemaVersion: 1,
    contracts: root.contracts.map((entry, index) => parseEntry(entry, index)),
  };
}

export function loadCatalog(catalogPath) {
  return parseCatalogText(readFileSync(catalogPath, 'utf8'), catalogPath);
}

export { PUBLIC_CONTRACT };
