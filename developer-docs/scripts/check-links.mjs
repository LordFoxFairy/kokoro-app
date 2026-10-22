import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertBuiltSiteLinks } from './lib/link-checker.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const portalRoot = resolve(scriptDirectory, '..');
const result = assertBuiltSiteLinks(join(portalRoot, 'docs/.vitepress/dist'));

process.stdout.write(
  `links ok: html_files=${result.htmlFiles} internal_links=${result.linksChecked}\n`,
);
