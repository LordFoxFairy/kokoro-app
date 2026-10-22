import { ReferenceGenerationError } from './reference-errors.mjs';

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
  /\bBearer\s+[A-Za-z0-9._~-]{24,}\b/iu,
]);

const DANGEROUS_SCHEME_PATTERN =
  /(?:^|[\s"'(=])(?:javascript|vbscript|file):(?=[a-z0-9_/$.'(])/iu;
const DANGEROUS_DATA_URL_PATTERN =
  /(?:^|[\s"'(=])data:[^,\s"'`]*,/iu;
const RAW_HTML_PATTERN = /<\/?[a-z][^>]*>/iu;
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/u;
const INTERNAL_OWNER_PATH =
  /(?:^|[/(\\])(?:\.\.?[/\\])*(kokoro-(?:agent|billing|capability|iam|model|scheduler|storage|system))(?:[/\\]|$)/iu;
const GENERATED_MARKUP_PATTERN =
  /<!-- Generated file\. Do not edit\. -->|<span class="api-method api-method--(?:delete|get|head|options|patch|post|put|trace)">|<\/span>/gu;

function addViolation(violations, path, message) {
  violations.push(`${path}: ${message}`);
}

// Identifier templates are literal prose, not HTML. Escape them before both
// publication inspection and rendering; arbitrary markup remains rejected.
export function escapeContractTemplates(value) {
  return value.replace(/(\b[A-Za-z][\w.:-]*[_:])<([A-Za-z][A-Za-z0-9_]*)>/gu,
    (_, prefix, name) => `${prefix}&lt;${name}&gt;`);
}

function inspectString(value, path, violations, options) {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(value)) {
      addViolation(violations, path, 'credential-shaped literal is not publishable');
      break;
    }
  }
  if (DANGEROUS_SCHEME_PATTERN.test(value) || DANGEROUS_DATA_URL_PATTERN.test(value)) {
    addViolation(violations, path, 'dangerous URL scheme is not publishable');
  }
  const markupCandidate = options.allowGeneratedMarkup
    ? value.replace(GENERATED_MARKUP_PATTERN, '')
    : value;
  const inspectedMarkup = !options.allowGeneratedMarkup && path.endsWith('.description')
    ? escapeContractTemplates(markupCandidate)
    : markupCandidate;
  if (RAW_HTML_PATTERN.test(inspectedMarkup) || HTML_COMMENT_PATTERN.test(markupCandidate)) {
    addViolation(violations, path, 'raw HTML or comments are not publishable');
  }
  const internalPath = INTERNAL_OWNER_PATH.exec(value);
  if (internalPath !== null) {
    addViolation(
      violations,
      path,
      `internal owner checkout path ${internalPath[1]} is not publishable`,
    );
  }
  const headerPattern = /\b(x-kokoro-[a-z0-9-]+)\s*:/giu;
  for (const match of value.matchAll(headerPattern)) {
    const header = match[1]?.toLowerCase();
    if (header !== undefined && !PUBLIC_KOKORO_NAMES.has(header)) {
      addViolation(violations, path, `unknown Kokoro header ${header}`);
    }
  }
}

function inspectValue(value, path, violations, seen, options) {
  if (typeof value === 'string') {
    inspectString(value, path, violations, options);
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      inspectValue(item, `${path}[${index}]`, violations, seen, options),
    );
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = path === '' ? key : `${path}.${key}`;
    if (
      key.toLowerCase().startsWith('x-kokoro-') &&
      !PUBLIC_KOKORO_NAMES.has(key.toLowerCase())
    ) {
      addViolation(violations, childPath, `unknown Kokoro extension ${key}`);
    }
    inspectValue(child, childPath, violations, seen, options);
  }
}

export class PublicationPolicyError extends ReferenceGenerationError {
  constructor(label, violations) {
    super(`${label} failed publication policy:\n${violations.join('\n')}`);
    this.name = 'PublicationPolicyError';
    this.violations = violations;
  }
}

export function assertPublicationSafe(
  value,
  label = 'publication input',
  options = {},
) {
  const violations = [];
  inspectValue(value, label, violations, new Set(), options);
  if (violations.length > 0) {
    throw new PublicationPolicyError(label, violations);
  }
  return value;
}
