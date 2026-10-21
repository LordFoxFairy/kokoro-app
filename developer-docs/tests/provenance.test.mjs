import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { verifyContractEntry } from '../scripts/lib/provenance.mjs';

const canonicalContract = `openapi: 3.1.0
info:
  title: Fixture API
  version: 1.0.0
paths: {}
`;

function git(directory, ...args) {
  return execFileSync('git', args, {
    cwd: directory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function createFixtureRepository() {
  const directory = mkdtempSync(join(tmpdir(), 'kokoro-docs-provenance-'));
  const contractPath = join(directory, 'contract/openapi/v1/openapi.yaml');
  mkdirSync(join(directory, 'contract/openapi/v1'), { recursive: true });
  writeFileSync(contractPath, canonicalContract);
  git(directory, 'init', '-q');
  git(directory, 'config', 'user.name', 'Fixture');
  git(directory, 'config', 'user.email', 'fixture@example.test');
  git(
    directory,
    'remote',
    'add',
    'origin',
    'https://github.com/LordFoxFairy/kokoro-bff.git',
  );
  git(directory, 'add', 'contract/openapi/v1/openapi.yaml');
  git(directory, 'commit', '-qm', 'fixture contract');
  return { contractPath, directory };
}

function fixtureEntry(directory) {
  const content = readFileSync(
    join(directory, 'contract/openapi/v1/openapi.yaml'),
  );
  return {
    id: 'kokoro-bff-public-v1',
    owner: 'kokoro-bff',
    visibility: 'public',
    version: '1.0.0',
    source: {
      repository: 'https://github.com/LordFoxFairy/kokoro-bff.git',
      checkout: directory,
      path: 'contract/openapi/v1/openapi.yaml',
      commit: git(directory, 'rev-parse', 'HEAD'),
    },
    digest: {
      algorithm: 'sha256',
      value: createHash('sha256').update(content).digest('hex'),
    },
    generation: { command: 'corepack pnpm reference:generate' },
    publication: { classification: 'public', include_in_portal: true },
  };
}

test('verifies the worktree file and immutable Git blob', () => {
  const fixture = createFixtureRepository();
  try {
    const result = verifyContractEntry(fixtureEntry(fixture.directory), {
      portalRoot: fixture.directory,
    });

    assert.equal(result.contractSourceState, 'clean');
    assert.equal(result.repositoryWorktreeState, 'clean');
    assert.equal(result.version, '1.0.0');
  } finally {
    rmSync(fixture.directory, { force: true, recursive: true });
  }
});

test('fails when the canonical source has an uncommitted change', () => {
  const fixture = createFixtureRepository();
  try {
    const entry = fixtureEntry(fixture.directory);
    writeFileSync(fixture.contractPath, canonicalContract.replace('paths: {}', 'paths:\n  /changed: {}'));

    assert.throws(
      () => verifyContractEntry(entry, { portalRoot: fixture.directory }),
      /worktree digest does not match catalog/,
    );
  } finally {
    rmSync(fixture.directory, { force: true, recursive: true });
  }
});

test('reports unrelated repository changes without rejecting the artifact', () => {
  const fixture = createFixtureRepository();
  try {
    const entry = fixtureEntry(fixture.directory);
    writeFileSync(join(fixture.directory, 'notes.md'), 'uncommitted note\n');

    const result = verifyContractEntry(entry, {
      portalRoot: fixture.directory,
    });

    assert.equal(result.contractSourceState, 'clean');
    assert.equal(result.repositoryWorktreeState, 'dirty');
  } finally {
    rmSync(fixture.directory, { force: true, recursive: true });
  }
});
