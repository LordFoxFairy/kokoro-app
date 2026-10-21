import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { assertBuiltSiteLinks } from '../scripts/lib/link-checker.mjs';

function builtSiteFixture() {
  const root = mkdtempSync(join(tmpdir(), 'kokoro-built-site-'));
  mkdirSync(join(root, 'guides'), { recursive: true });
  mkdirSync(join(root, 'assets'), { recursive: true });
  writeFileSync(
    join(root, 'index.html'),
    '<a href="./guides/create-run.html#request">Create</a>',
  );
  writeFileSync(
    join(root, 'guides/create-run.html'),
    '<h1 id="request">Request</h1><script src="/assets/app.js"></script>',
  );
  writeFileSync(join(root, 'assets/app.js'), 'export {};\n');
  return root;
}

test('accepts built routes, fragments, and static assets', () => {
  const result = assertBuiltSiteLinks(builtSiteFixture());

  assert.equal(result.htmlFiles, 2);
  assert.equal(result.linksChecked, 2);
  assert.equal(result.violations.length, 0);
});

test('reports missing routes and fragments with their source page', () => {
  const root = builtSiteFixture();
  writeFileSync(
    join(root, 'index.html'),
    '<a href="/missing">Missing</a><a href="/guides/create-run#absent">Fragment</a>',
  );

  assert.throws(
    () => assertBuiltSiteLinks(root),
    (error) => {
      assert.match(error.message, /index\.html/);
      assert.match(error.message, /missing target \/missing/);
      assert.match(error.message, /missing fragment #absent/);
      return true;
    },
  );
});

test('resolves extensionless and directory-style routes', () => {
  const root = builtSiteFixture();
  mkdirSync(join(root, 'reference/v1'), { recursive: true });
  writeFileSync(join(root, 'reference/v1/index.html'), '<h1>Reference</h1>');
  writeFileSync(
    join(root, 'index.html'),
    '<a href="/guides/create-run">Guide</a><a href="/reference/v1/">Reference</a>',
  );

  const result = assertBuiltSiteLinks(root);

  assert.equal(result.linksChecked, 3);
});

test('rejects executable and local-file URL schemes', () => {
  const root = builtSiteFixture();
  writeFileSync(
    join(root, 'index.html'),
    '<a href="javascript:alert(1)">run</a><img src="file:///tmp/secret">',
  );

  assert.throws(
    () => assertBuiltSiteLinks(root),
    (error) => {
      assert.match(error.message, /blocked URL scheme/);
      assert.match(error.message, /javascript:|file:/);
      return true;
    },
  );
});
