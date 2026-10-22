import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';

import { assertPublicationSafe } from './publication-policy.mjs';

const GENERATED_MARKER = 'kokoro-developer-docs/reference-v1';

function isWithin(parent, child) {
  const relativePath = relative(resolve(parent), resolve(child));
  return relativePath === '' ||
    (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !isAbsolute(relativePath));
}

function existingAncestor(path) {
  let current = resolve(path);
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

function realPathWithMissingSegments(path) {
  const target = resolve(path);
  const ancestor = existingAncestor(target);
  const suffix = relative(ancestor, target);
  return resolve(realpathSync(ancestor), suffix);
}

function isRealPathWithin(parent, child) {
  return isWithin(realpathSync(parent), realPathWithMissingSegments(child));
}

function readDirectoryEntry(directory, name) {
  try {
    return lstatSync(join(directory, name));
  } catch {
    return undefined;
  }
}

function readManagedMarker(directory) {
  const manifestPath = join(directory, 'manifest.json');
  const manifestStat = readDirectoryEntry(directory, 'manifest.json');
  if (manifestStat === undefined || !manifestStat.isFile() || manifestStat.isSymbolicLink()) {
    return false;
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return manifest?.generatedBy === GENERATED_MARKER;
  } catch {
    return false;
  }
}

function assertOutputPath(outputDirectory, options) {
  const target = resolve(outputDirectory);
  const temporaryRoot = resolve(tmpdir());
  const home = resolve(homedir());
  const targetRealPath = realPathWithMissingSegments(target);
  if (
    target === '/' ||
    target === home ||
    target === temporaryRoot ||
    targetRealPath === '/' ||
    targetRealPath === realpathSync(home) ||
    targetRealPath === realpathSync(temporaryRoot)
  ) {
    throw new Error(`reference output path is too broad: ${target}`);
  }

  let canonicalTarget;
  if (options.portalRoot !== undefined) {
    canonicalTarget = resolve(options.portalRoot, 'docs/reference/v1/generated');
    const portalRoot = resolve(options.portalRoot);
    const isCanonical = target === canonicalTarget;
    const isTemporary = isRealPathWithin(temporaryRoot, target);
    if (
      (!isCanonical && !isTemporary) ||
      (isCanonical && !isRealPathWithin(portalRoot, target))
    ) {
      throw new Error(
        `reference output must be the managed generated directory or a temporary directory: ${target}`,
      );
    }
  } else if (!isRealPathWithin(temporaryRoot, target)) {
    throw new Error(`reference test output must be inside ${temporaryRoot}: ${target}`);
  }

  const stat = readDirectoryEntry(dirname(target), basename(target));
  if (stat !== undefined) {
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`reference output must be a real directory: ${target}`);
    }
    if (
      target !== canonicalTarget &&
      readdirSync(target).length > 0 &&
      !readManagedMarker(target)
    ) {
      throw new Error(
        `refusing to replace an unmanaged temporary directory: ${target}`,
      );
    }
  }
  return target;
}

function assertRelativeOutputPath(relativePath) {
  const virtualRoot = '/__kokoro_generated_root__';
  const resolvedPath = resolve(virtualRoot, relativePath);
  if (
    relativePath === '' ||
    isAbsolute(relativePath) ||
    !isWithin(virtualRoot, resolvedPath)
  ) {
    throw new Error(`generated file path escapes output directory: ${relativePath}`);
  }
}

export function writeManagedReferenceFiles(files, outputDirectory, options = {}) {
  const target = assertOutputPath(outputDirectory, options);
  const parent = dirname(target);
  mkdirSync(parent, { recursive: true });
  const temporaryDirectory = mkdtempSync(join(parent, '.reference-generate-'));
  let backupDirectory;
  try {
    for (const [relativePath, content] of files) {
      assertRelativeOutputPath(relativePath);
      if (typeof content !== 'string') {
        throw new Error(`generated file content must be text: ${relativePath}`);
      }
      assertPublicationSafe(content, `generated reference ${relativePath}`, {
        allowGeneratedMarkup: true,
      });
      const destination = join(temporaryDirectory, relativePath);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, content);
    }

    if (existsSync(target)) {
      backupDirectory = mkdtempSync(join(parent, '.reference-backup-'));
      rmSync(backupDirectory, { force: true, recursive: true });
      renameSync(target, backupDirectory);
    }
    renameSync(temporaryDirectory, target);
    if (backupDirectory !== undefined) {
      rmSync(backupDirectory, { force: true, recursive: true });
    }
  } catch (error) {
    rmSync(temporaryDirectory, { force: true, recursive: true });
    if (backupDirectory !== undefined && !existsSync(target)) {
      renameSync(backupDirectory, target);
    }
    throw error;
  }
}

export { GENERATED_MARKER };
