import { ReferenceGenerationError } from './reference-errors.mjs';
import { isRecord, requireRecord, resolveReference } from './schema-renderer.mjs';

const METHODS = new Set(['get', 'head', 'options', 'trace', 'post', 'put', 'patch', 'delete']);
const pointerPart = (value) => value.replaceAll('~', '~0').replaceAll('/', '~1');

/** Derive a publication view from the pinned owner artifact, never a second schema. */
export function publicContractView(value) {
  const source = requireRecord(value, 'OpenAPI document');
  const paths = [];
  const security = new Set();
  const tags = new Set();
  const rememberSecurity = (requirements) => {
    if (requirements === undefined) return;
    if (!Array.isArray(requirements)) throw new ReferenceGenerationError('security must be an array');
    for (const requirement of requirements) {
      for (const name of Object.keys(requireRecord(requirement, 'security requirement'))) security.add(name);
    }
  };
  rememberSecurity(source.security);
  for (const [path, rawItem] of Object.entries(requireRecord(source.paths, 'paths'))) {
    const item = requireRecord(rawItem, path);
    const operations = [];
    for (const [method, rawOperation] of Object.entries(item)) {
      if (!METHODS.has(method)) continue;
      const operation = requireRecord(rawOperation, `${method} ${path}`);
      if (operation['x-kokoro-owner'] !== 'kokoro-bff') throw new ReferenceGenerationError(`${method} ${path} must be owned by kokoro-bff`);
      const visibility = operation['x-kokoro-visibility'];
      if (visibility !== 'public' && visibility !== 'browser-private') throw new ReferenceGenerationError(`${method} ${path} has unknown visibility`);
      if (visibility === 'browser-private') continue;
      operations.push([method, operation]);
      rememberSecurity(operation.security);
      for (const tag of operation.tags ?? []) tags.add(tag);
    }
    if (operations.length > 0) paths.push([path, Object.fromEntries([
      ...Object.entries(item).filter(([key]) => !METHODS.has(key)), ...operations,
    ])]);
  }
  if (paths.length === 0) throw new ReferenceGenerationError('canonical contract has no public operations');
  const result = { ...source, paths: Object.fromEntries(paths) };
  if (Array.isArray(source.tags)) result.tags = source.tags.filter((tag) => tags.has(tag.name));
  const pending = [...security].map((name) => `#/components/securitySchemes/${pointerPart(name)}`);
  const scan = (node) => {
    if (!isRecord(node) && !Array.isArray(node)) return;
    if (typeof node.$ref === 'string') pending.push(node.$ref);
    for (const child of Object.values(node)) scan(child);
  };
  scan(result.paths);
  const seen = new Set();
  const groups = new Map();
  for (let index = 0; index < pending.length; index += 1) {
    const ref = pending[index];
    if (seen.has(ref)) continue;
    seen.add(ref);
    resolveReference(source, { $ref: ref }, 'public component');
    const parts = ref.slice(2).split('/').map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
    if (!ref.startsWith('#/components/') || parts.length < 3) throw new ReferenceGenerationError(`unsupported public reference ${ref}`);
    const [, group, name] = parts;
    if (!groups.has(group)) groups.set(group, new Map());
    const entries = groups.get(group);
    if (entries.has(name)) continue;
    const component = resolveReference(source, { $ref: `#/components/${pointerPart(group)}/${pointerPart(name)}` }, 'public component');
    entries.set(name, component);
    scan(component);
  }
  result.components = Object.fromEntries([...groups].map(([group, entries]) => [group, Object.fromEntries(entries)]));
  return structuredClone(result);
}
