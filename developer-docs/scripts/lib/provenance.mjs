import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import { parse } from 'yaml';

function runGit(checkout, args, options = {}) {
  try {
    return execFileSync('git', ['-C', checkout, ...args], {
      encoding: options.encoding ?? 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail =
      error && typeof error === 'object' && 'stderr' in error
        ? String(error.stderr).trim()
        : String(error);
    throw new ProvenanceError(
      `git ${args.join(' ')} failed for ${checkout}: ${detail}`,
    );
  }
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function normalizeRemote(remote) {
  return remote
    .trim()
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '')
    .toLowerCase();
}

function resolveCheckout(entry, portalRoot, checkoutOverride) {
  const configured = checkoutOverride ?? entry.source.checkout;
  const candidate = isAbsolute(configured)
    ? configured
    : resolve(portalRoot, configured);
  try {
    return realpathSync(candidate);
  } catch {
    throw new ProvenanceError(
      `source checkout does not exist: ${candidate}; set KOKORO_BFF_CHECKOUT`,
    );
  }
}

function resolveSourcePath(checkout, sourcePath) {
  const candidate = resolve(checkout, sourcePath);
  const pathFromCheckout = relative(checkout, candidate);
  if (
    pathFromCheckout === '' ||
    pathFromCheckout === '..' ||
    pathFromCheckout.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
    isAbsolute(pathFromCheckout)
  ) {
    throw new ProvenanceError('contract source path escapes its checkout');
  }
  return candidate;
}

function readVersion(content) {
  const contract = parse(content.toString('utf8'));
  const version = contract?.info?.version;
  if (typeof version !== 'string' || version.length === 0) {
    throw new ProvenanceError('canonical OpenAPI has no info.version');
  }
  return version;
}

export class ProvenanceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProvenanceError';
  }
}

export function verifyContractEntry(entry, options) {
  const checkout = resolveCheckout(
    entry,
    options.portalRoot,
    options.checkoutOverride,
  );
  const sourcePath = resolveSourcePath(checkout, entry.source.path);
  const worktreeContent = readFileSync(sourcePath);
  const worktreeDigest = sha256(worktreeContent);
  if (worktreeDigest !== entry.digest.value) {
    throw new ProvenanceError(
      `worktree digest does not match catalog for ${entry.id}: expected ${entry.digest.value}, received ${worktreeDigest}`,
    );
  }

  const commitContent = runGit(
    checkout,
    ['show', `${entry.source.commit}:${entry.source.path}`],
    { encoding: 'buffer' },
  );
  const commitDigest = sha256(commitContent);
  if (commitDigest !== entry.digest.value) {
    throw new ProvenanceError(
      `Git blob digest does not match catalog for ${entry.id}: expected ${entry.digest.value}, received ${commitDigest}`,
    );
  }

  const configuredRemote = normalizeRemote(entry.source.repository);
  const actualRemote = normalizeRemote(
    runGit(checkout, ['remote', 'get-url', 'origin']),
  );
  if (actualRemote !== configuredRemote) {
    throw new ProvenanceError(
      `origin mismatch for ${entry.id}: expected ${configuredRemote}, received ${actualRemote}`,
    );
  }

  const contractStatus = runGit(checkout, [
    'status',
    '--porcelain=v1',
    '--',
    entry.source.path,
  ]).trim();
  if (contractStatus !== '') {
    throw new ProvenanceError(
      `canonical source has uncommitted changes for ${entry.id}`,
    );
  }

  const repositoryStatus = runGit(checkout, [
    'status',
    '--porcelain=v1',
  ]).trim();
  const version = readVersion(commitContent);
  if (version !== entry.version) {
    throw new ProvenanceError(
      `OpenAPI version mismatch for ${entry.id}: expected ${entry.version}, received ${version}`,
    );
  }

  return {
    checkout,
    commit: entry.source.commit,
    contractSourceState: 'clean',
    digest: commitDigest,
    id: entry.id,
    repositoryWorktreeState: repositoryStatus === '' ? 'clean' : 'dirty',
    version,
  };
}
