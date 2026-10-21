import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

const SITE_ORIGIN = 'https://developer.kokoro.invalid';
const SKIPPED_PROTOCOLS = new Set([
  'mailto:',
  'tel:',
]);
const BLOCKED_PROTOCOLS = new Set([
  'data:',
  'file:',
  'javascript:',
  'vbscript:',
]);

function webPath(root, path) {
  return `/${relative(root, path).split(sep).join('/')}`;
}

function walkFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files.sort((left, right) => left.localeCompare(right, 'en'));
}

function routeAliases(pathname) {
  const aliases = new Set([pathname]);
  if (!pathname.endsWith('.html')) {
    return aliases;
  }

  if (pathname === '/index.html') {
    aliases.add('/');
    aliases.add('/index');
    return aliases;
  }

  if (pathname.endsWith('/index.html')) {
    const directoryRoute = pathname.slice(0, -'index.html'.length);
    aliases.add(directoryRoute);
    aliases.add(directoryRoute.slice(0, -1));
    return aliases;
  }

  aliases.add(pathname.slice(0, -'.html'.length));
  return aliases;
}

function extractIds(content) {
  const ids = new Set();
  const pattern = /\b(?:id|name)=(['"])(.*?)\1/giu;
  for (const match of content.matchAll(pattern)) {
    if (match[2] !== undefined) {
      ids.add(match[2]);
    }
  }
  return ids;
}

function extractLinks(content) {
  const links = [];
  const pattern = /\b(?:href|src)=(['"])(.*?)\1/giu;
  for (const match of content.matchAll(pattern)) {
    if (match[2] !== undefined && match[2] !== '') {
      links.push(match[2]);
    }
  }
  return links;
}

function decodeFragment(fragment) {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

export class BuiltSiteLinkError extends Error {
  constructor(violations) {
    const details = violations
      .map(({ source, target, message }) => `${source}: ${message} ${target}`)
      .join('\n');
    super(`built site link violations:\n${details}`);
    this.name = 'BuiltSiteLinkError';
    this.violations = violations;
  }
}

export function checkBuiltSiteLinks(distRoot) {
  const files = walkFiles(distRoot);
  const targets = new Map();
  const htmlDocuments = [];

  for (const path of files) {
    const pathname = webPath(distRoot, path);
    const target = { path, ids: new Set(), isHtml: extname(path) === '.html' };
    if (target.isHtml) {
      const content = readFileSync(path, 'utf8');
      target.ids = extractIds(content);
      htmlDocuments.push({ path, pathname, content });
      for (const alias of routeAliases(pathname)) {
        targets.set(alias, target);
      }
    } else {
      targets.set(pathname, target);
    }
  }

  const violations = [];
  let linksChecked = 0;
  for (const document of htmlDocuments) {
    const source = relative(distRoot, document.path).split(sep).join('/');
    for (const rawTarget of extractLinks(document.content)) {
      if (rawTarget.startsWith('//')) {
        continue;
      }
      let url;
      try {
        url = new URL(rawTarget, `${SITE_ORIGIN}${document.pathname}`);
      } catch {
        violations.push({
          source,
          target: rawTarget,
          message: 'invalid internal URL',
        });
        continue;
      }
      if (BLOCKED_PROTOCOLS.has(url.protocol)) {
        violations.push({
          source,
          target: rawTarget,
          message: `blocked URL scheme ${url.protocol}`,
        });
        continue;
      }
      if (url.origin !== SITE_ORIGIN || SKIPPED_PROTOCOLS.has(url.protocol)) {
        continue;
      }

      linksChecked += 1;
      const target = targets.get(url.pathname);
      if (target === undefined) {
        violations.push({
          source,
          target: url.pathname,
          message: 'missing target',
        });
        continue;
      }
      if (url.hash !== '' && target.isHtml) {
        const fragment = decodeFragment(url.hash.slice(1));
        if (fragment !== '' && !target.ids.has(fragment)) {
          violations.push({
            source,
            target: `${url.pathname}${url.hash}`,
            message: `missing fragment #${fragment} in`,
          });
        }
      }
    }
  }

  return {
    htmlFiles: htmlDocuments.length,
    linksChecked,
    violations: violations.sort(
      (left, right) =>
        left.source.localeCompare(right.source, 'en') ||
        left.target.localeCompare(right.target, 'en'),
    ),
  };
}

export function assertBuiltSiteLinks(distRoot) {
  const result = checkBuiltSiteLinks(distRoot);
  if (result.violations.length > 0) {
    throw new BuiltSiteLinkError(result.violations);
  }
  return result;
}
