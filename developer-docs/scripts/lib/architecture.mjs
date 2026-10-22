import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

import { assertPublicationSafe } from './publication-policy.mjs';
import { GENERATED_MARKER } from './output-safety.mjs';

const PUBLICATION_ROOTS = Object.freeze([
  'docs',
  'examples',
  'catalog',
  'scripts',
  'tests',
]);
const GOVERNANCE_FILES = Object.freeze([
  '.markdownlint-cli2.mjs',
  '.gitignore',
  '.npmrc',
  'INDEX.md',
  'README.md',
  'eslint.config.mjs',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
]);
const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.mts',
  '.py',
  '.sh',
  '.sql',
  '.toml',
  '.ts',
  '.txt',
  '.yaml',
  '.yml',
]);
const EXCLUDED_DIRECTORIES = Object.freeze([
  'docs/.vitepress/cache',
  'docs/.vitepress/dist',
  'docs/reference/v1/generated',
]);
const PUBLIC_KOKORO_NAMES = new Set([
  'x-kokoro-idempotency',
  'x-kokoro-json-byte-limit',
  'x-kokoro-custom-event-values',
  'x-kokoro-fixed-visibility',
  'x-kokoro-internal-secret',
  'x-kokoro-namespace',
  'x-kokoro-owner',
  'x-kokoro-permission',
  'x-kokoro-principal-id',
  'x-kokoro-request-id',
  'x-kokoro-service',
  'x-kokoro-stability',
  'x-kokoro-visibility',
]);
const SECRET_PATTERNS = Object.freeze([
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/u,
  /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/u,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}\b/u,
]);
const INTERNAL_OWNER_PATH = /(?:^|[/(\\])(?:\.\.?[/\\])*(kokoro-(?:agent|billing|capability|iam|model|scheduler|storage|system))(?:[/\\]|\b)/iu;

function toPortalPath(portalRoot, path) {
  return relative(portalRoot, path).split(sep).join('/');
}

function isExcluded(relativePath) {
  return EXCLUDED_DIRECTORIES.some(
    (excluded) =>
      relativePath === excluded || relativePath.startsWith(`${excluded}/`),
  );
}

function walkFiles(portalRoot, directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const portalPath = toPortalPath(portalRoot, path);
    if (isExcluded(portalPath)) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...walkFiles(portalRoot, path));
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(path))) {
      files.push(path);
    }
  }
  return files;
}

function publicationFiles(portalRoot) {
  const files = PUBLICATION_ROOTS.flatMap((directory) =>
    walkFiles(portalRoot, join(portalRoot, directory)),
  );
  for (const filename of GOVERNANCE_FILES) {
    const path = join(portalRoot, filename);
    if (existsSync(path)) {
      files.push(path);
    }
  }
  return files.sort((left, right) => left.localeCompare(right, 'en'));
}

function lineNumber(content, index) {
  return content.slice(0, index).split('\n').length;
}

function addViolation(violations, rule, file, message, line) {
  if (
    violations.some(
      (violation) => violation.rule === rule && violation.file === file,
    )
  ) {
    return;
  }
  violations.push({ rule, file, line, message });
}

function inspectPath(path, portalPath, violations) {
  const basename = portalPath.split('/').at(-1) ?? '';
  if (/^openapi\.(?:json|ya?ml)$/iu.test(basename)) {
    addViolation(
      violations,
      'canonical-source-only',
      portalPath,
      'OpenAPI copies are forbidden; use the catalog-pinned BFF source',
    );
  }
  if (/\.sql$/iu.test(path) || /(?:^|\/)schema\.prisma$/iu.test(portalPath)) {
    addViolation(
      violations,
      'no-database-schema',
      portalPath,
      'database schemas are not publication inputs',
    );
  }
  if (
    /(?:^|\/)generated(?:\/|$)/u.test(portalPath) &&
    !portalPath.startsWith('docs/reference/v1/generated/')
  ) {
    addViolation(
      violations,
      'no-internal-generated-dto',
      portalPath,
      'generated DTO trees are not publication inputs',
    );
  }
}

function inspectContent(content, portalPath, violations) {
  const openApiMarker = /^(?:\s*\{\s*)?["']?openapi["']?\s*:/mu.exec(content);
  if (openApiMarker !== null && !/^openapi\.(?:json|ya?ml)$/iu.test(portalPath)) {
    addViolation(
      violations,
      'canonical-source-only',
      portalPath,
      'embedded OpenAPI documents are forbidden',
      lineNumber(content, openApiMarker.index),
    );
  }

  for (const pattern of SECRET_PATTERNS) {
    const match = pattern.exec(content);
    if (match !== null) {
      addViolation(
        violations,
        'no-secret-literals',
        portalPath,
        'credential-shaped literal found',
        lineNumber(content, match.index),
      );
      break;
    }
  }

  const headerPattern = /\b(x-kokoro-[a-z0-9-]+)\s*:/giu;
  for (const match of content.matchAll(headerPattern)) {
    const header = match[1]?.toLowerCase();
    if (header !== undefined && !PUBLIC_KOKORO_NAMES.has(header)) {
      addViolation(
        violations,
        'public-header-allowlist',
        portalPath,
        `non-public Kokoro header ${header} found`,
        lineNumber(content, match.index ?? 0),
      );
    }
  }

  const internalPath = INTERNAL_OWNER_PATH.exec(content);
  if (internalPath !== null) {
    addViolation(
      violations,
      'no-internal-owner-paths',
      portalPath,
      `internal owner checkout path ${internalPath[1]} found`,
      lineNumber(content, internalPath.index),
    );
  }
}

export class PortalArchitectureError extends Error {
  constructor(violations) {
    const details = violations
      .map(
        ({ rule, file, line, message }) =>
          `${rule}: ${file}${line === undefined ? '' : `:${line}`} ${message}`,
      )
      .join('\n');
    super(`developer portal architecture violations:\n${details}`);
    this.name = 'PortalArchitectureError';
    this.violations = violations;
  }
}

export function auditPortalArchitecture(portalRoot) {
  const normalizedRoot = resolve(portalRoot);
  const files = publicationFiles(normalizedRoot);
  const violations = [];

  for (const path of files) {
    const portalPath = toPortalPath(normalizedRoot, path);
    inspectPath(path, portalPath, violations);
    inspectContent(readFileSync(path, 'utf8'), portalPath, violations);
  }

  return {
    filesScanned: files.length,
    violations: violations.sort(
      (left, right) =>
        left.file.localeCompare(right.file, 'en') ||
        left.rule.localeCompare(right.rule, 'en'),
    ),
  };
}

export function assertPortalArchitecture(portalRoot) {
  const result = auditPortalArchitecture(portalRoot);
  if (result.violations.length > 0) {
    throw new PortalArchitectureError(result.violations);
  }
  return result;
}

function generatedReferenceFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`generated reference must not contain symlinks: ${path}`);
    }
    if (entry.isDirectory()) {
      files.push(...generatedReferenceFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

export function assertGeneratedReferencePublication(portalRoot) {
  const root = resolve(portalRoot);
  const directory = join(root, 'docs/reference/v1/generated');
  const files = generatedReferenceFiles(directory);
  if (files.length === 0) return { filesScanned: 0 };
  const manifestPath = join(directory, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error('generated reference is missing manifest.json');
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new Error('generated reference manifest is not valid JSON');
  }
  if (manifest?.generatedBy !== GENERATED_MARKER) {
    throw new Error('generated reference manifest has an unknown generator marker');
  }
  for (const path of files) {
    assertPublicationSafe(
      readFileSync(path, 'utf8'),
      `generated reference ${relative(root, path).split(sep).join('/')}`,
      { allowGeneratedMarkup: true },
    );
  }
  return { filesScanned: files.length };
}
