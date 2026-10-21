import { assertPublicationSafe } from './publication-policy.mjs';
import { ReferenceGenerationError } from './reference-errors.mjs';
import { publicContractView } from './public-contract.mjs';
import {
  escapeTable,
  firstExample,
  formatTableExample,
  isRecord,
  normalizeDescription,
  renderExample,
  renderSchemaTable,
  requireRecord,
  resolveReference,
  schemaConstraints,
  schemaDefault,
  schemaExample,
  schemaType,
  slugify,
} from './schema-renderer.mjs';
import {
  GENERATED_MARKER,
  writeManagedReferenceFiles,
} from './output-safety.mjs';

const HTTP_METHODS = new Set([
  'delete',
  'get',
  'head',
  'options',
  'patch',
  'post',
  'put',
  'trace',
]);
const STABILITY_VALUES = new Set(['stable', 'beta', 'experimental']);
const IDEMPOTENCY_VALUES = new Set(['none', 'required']);
const PERMISSION_PATTERN =
  /^(?:anonymous|[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*)$/u;

function requireString(record, key, label) {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ReferenceGenerationError(`${label}.${key} must be a string`);
  }
  return value;
}

function parameterIdentity(parameter) {
  return `${String(parameter.in).toLowerCase()}:${String(parameter.name).toLowerCase()}`;
}

function resolvedParameters(contract, parameters, label) {
  const result = [];
  const seen = new Set();
  parameters.forEach((parameter, index) => {
    const resolved = requireRecord(
      resolveReference(contract, parameter, `${label}[${index}]`),
      `${label}[${index}]`,
    );
    const name = requireString(resolved, 'name', `${label}[${index}]`);
    const location = requireString(resolved, 'in', `${label}[${index}]`);
    const key = `${location.toLowerCase()}:${name.toLowerCase()}`;
    if (seen.has(key)) {
      const existingIndex = result.findIndex(
        (candidate) => parameterIdentity(candidate) === key,
      );
      if (existingIndex >= 0) result.splice(existingIndex, 1);
    }
    seen.add(key);
    result.push(resolved);
  });
  return result;
}

function collectOperations(contract) {
  const paths = requireRecord(contract.paths, 'paths');
  const operations = [];
  for (const [path, pathValue] of Object.entries(paths)) {
    const pathItem = requireRecord(pathValue, `paths.${path}`);
    const pathParameters = Array.isArray(pathItem.parameters)
      ? pathItem.parameters
      : [];
    for (const [method, operationValue] of Object.entries(pathItem)) {
      const normalizedMethod = method.toLowerCase();
      if (!HTTP_METHODS.has(normalizedMethod)) continue;
      const operation = requireRecord(
        operationValue,
        `${method.toUpperCase()} ${path}`,
      );
      const operationParameters = Array.isArray(operation.parameters)
        ? operation.parameters
        : [];
      operations.push({
        method: method.toUpperCase(),
        operation,
        parameters: resolvedParameters(
          contract,
          [...pathParameters, ...operationParameters],
          `${method.toUpperCase()} ${path} parameters`,
        ),
        path,
      });
    }
  }
  return operations;
}

function assertSecurityReferences(contract, operation, operationId) {
  const security = 'security' in operation ? operation.security : contract.security;
  if (security === undefined) return;
  if (!Array.isArray(security)) {
    throw new ReferenceGenerationError(`${operationId} security must be an array`);
  }
  const schemes = isRecord(contract.components?.securitySchemes)
    ? contract.components.securitySchemes
    : {};
  security.forEach((requirement, index) => {
    if (!isRecord(requirement)) {
      throw new ReferenceGenerationError(
        `${operationId} security[${index}] must be an object`,
      );
    }
    for (const name of Object.keys(requirement)) {
      if (!(name in schemes)) {
        throw new ReferenceGenerationError(
          `${operationId} references unknown security scheme ${name}`,
        );
      }
    }
  });
}

export function assertPublicContract(contractValue, catalogEntry) {
  const contract = requireRecord(contractValue, 'OpenAPI document');
  assertPublicationSafe(contract, 'canonical public contract');
  if (catalogEntry.owner !== 'kokoro-bff') {
    throw new ReferenceGenerationError('catalog owner must be kokoro-bff');
  }
  if (catalogEntry.visibility !== 'public') {
    throw new ReferenceGenerationError('catalog visibility must be public');
  }
  const info = requireRecord(contract.info, 'info');
  const version = requireString(info, 'version', 'info');
  if (version !== catalogEntry.version) {
    throw new ReferenceGenerationError(
      `OpenAPI version ${version} does not match catalog ${catalogEntry.version}`,
    );
  }
  if (
    typeof contract.openapi !== 'string' ||
    !contract.openapi.startsWith('3.1.')
  ) {
    throw new ReferenceGenerationError('canonical contract must use OpenAPI 3.1');
  }
  if (isRecord(contract.webhooks) && Object.keys(contract.webhooks).length > 0) {
    throw new ReferenceGenerationError(
      'webhook publication requires an explicit portal generator update',
    );
  }

  const operations = collectOperations(contract);
  if (operations.length === 0) {
    throw new ReferenceGenerationError('canonical contract has no operations');
  }
  const operationIds = new Set();
  for (const { method, operation, parameters, path } of operations) {
    const label = `${method} ${path}`;
    const operationId = requireString(operation, 'operationId', label);
    if (operationIds.has(operationId)) {
      throw new ReferenceGenerationError(`duplicate operationId ${operationId}`);
    }
    operationIds.add(operationId);
    if (operation['x-kokoro-owner'] !== 'kokoro-bff') {
      throw new ReferenceGenerationError(`${operationId} must be owned by kokoro-bff`);
    }
    if (operation['x-kokoro-visibility'] !== 'public') {
      throw new ReferenceGenerationError(`${operationId} must have public visibility`);
    }
    const stability = requireString(operation, 'x-kokoro-stability', label);
    if (!STABILITY_VALUES.has(stability)) {
      throw new ReferenceGenerationError(
        `${operationId} has unsupported x-kokoro-stability ${stability}`,
      );
    }
    const idempotency = requireString(operation, 'x-kokoro-idempotency', label);
    if (!IDEMPOTENCY_VALUES.has(idempotency)) {
      throw new ReferenceGenerationError(
        `${operationId} has unsupported x-kokoro-idempotency ${idempotency}`,
      );
    }
    const permission = requireString(operation, 'x-kokoro-permission', label);
    if (!PERMISSION_PATTERN.test(permission)) {
      throw new ReferenceGenerationError(
        `${operationId} has invalid x-kokoro-permission ${permission}`,
      );
    }
    const idempotencyParameter = parameters.find(
      (parameter) =>
        String(parameter.in).toLowerCase() === 'header' &&
        String(parameter.name).toLowerCase() === 'idempotency-key',
    );
    if (idempotency === 'required' && idempotencyParameter === undefined) {
      throw new ReferenceGenerationError(
        `${operationId} must reference Idempotency-Key when idempotency is required`,
      );
    }
    if (idempotency === 'required' && idempotencyParameter.required !== true) {
      throw new ReferenceGenerationError(
        `${operationId} Idempotency-Key must be required`,
      );
    }
    if (idempotency === 'none' && idempotencyParameter !== undefined) {
      throw new ReferenceGenerationError(
        `${operationId} must not declare Idempotency-Key when idempotency is none`,
      );
    }
    if (
      !Array.isArray(operation.tags) ||
      operation.tags.length !== 1 ||
      typeof operation.tags[0] !== 'string'
    ) {
      throw new ReferenceGenerationError(
        `${operationId} must declare exactly one public tag`,
      );
    }
    if ('deprecated' in operation && typeof operation.deprecated !== 'boolean') {
      throw new ReferenceGenerationError(`${operationId}.deprecated must be boolean`);
    }
    assertSecurityReferences(contract, operation, operationId);
    if (
      !isRecord(operation.responses) ||
      Object.keys(operation.responses).length === 0
    ) {
      throw new ReferenceGenerationError(`${operationId} must declare responses`);
    }
  }
  return operations;
}

function parameterExample(contract, parameter) {
  if ('example' in parameter) return parameter.example;
  return schemaExample(contract, parameter.schema);
}

function renderParameters(contract, parameters) {
  if (parameters.length === 0) return '';
  const rows = parameters.map((parameter) => {
    const example = parameterExample(contract, parameter);
    return `| \`${escapeTable(parameter.name)}\` | \`${escapeTable(parameter.in)}\` | ${parameter.required === true ? 'yes' : 'no'} | ${escapeTable(schemaType(contract, parameter.schema))} | ${escapeTable(schemaConstraints(contract, parameter.schema))} | ${escapeTable(formatTableExample(schemaDefault(contract, parameter.schema)))} | ${escapeTable(formatTableExample(example))} | ${escapeTable(normalizeDescription(parameter.description))} |`;
  });
  return [
    '### Parameters（参数）',
    '',
    '| Name（名称） | Location（位置） | Required（必填） | Type（类型） | Constraints（约束） | Default（默认） | Example（示例） | Description（说明） |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

function securitySchemeDescription(contract, name) {
  const schemes = isRecord(contract.components?.securitySchemes)
    ? contract.components.securitySchemes
    : {};
  const scheme = isRecord(schemes[name]) ? schemes[name] : {};
  if (scheme.type === 'apiKey') {
    return `\`${name}\` · header \`${scheme.name ?? name}\``;
  }
  return `\`${name}\` · ${String(scheme.type ?? 'security scheme')}`;
}

function renderSecurity(contract, operation) {
  const hasSecurity = 'security' in operation || 'security' in contract;
  const security = 'security' in operation ? operation.security : contract.security;
  if (!hasSecurity) {
    return [
      '### Authentication（认证）',
      '',
      'This document does not declare a security requirement for this operation.',
      '',
    ].join('\n');
  }
  if (!Array.isArray(security) || security.length === 0) {
    return [
      '### Authentication（认证）',
      '',
      'This operation declares `security: []`; it is an anonymous health/readiness probe in the canonical contract.',
      '',
    ].join('\n');
  }
  const alternatives = security.map((requirement) =>
    Object.keys(requirement)
      .map((name) => securitySchemeDescription(contract, name))
      .join(' + '),
  );
  return [
    '### Authentication（认证）',
    '',
    `Required security context（所需安全上下文）: ${alternatives.map((value) => `(${value})`).join(' or ')}`,
    '',
    '具体 header 名称、是否必填和字段约束以本页的 canonical contract 元数据为准；门户不发布凭据值。',
    '',
  ].join('\n');
}

function renderRequestBody(contract, requestBody) {
  if (!isRecord(requestBody)) return '';
  const resolvedRequestBody = requireRecord(
    resolveReference(contract, requestBody, 'requestBody'),
    'requestBody',
  );
  const content = requireRecord(
    resolvedRequestBody.content,
    'requestBody.content',
  );
  const lines = ['### Request body（请求体）', ''];
  for (const [mediaName, mediaValue] of Object.entries(content)) {
    const media = requireRecord(mediaValue, `requestBody.content.${mediaName}`);
    lines.push(
      `- Content type（媒体类型）: \`${mediaName}\``,
      `- Required（必填）: ${resolvedRequestBody.required === true ? 'yes' : 'no'}`,
      `- Schema（Schema）: ${schemaType(contract, media.schema)}`,
      '',
    );
    const table = renderSchemaTable(contract, media.schema);
    if (table !== '') lines.push(table);
    const example = renderExample(firstExample(contract, media));
    if (example !== '') lines.push(example.trimEnd(), '');
  }
  return lines.join('\n');
}

function renderResponseHeaders(contract, headers) {
  if (!isRecord(headers) || Object.keys(headers).length === 0) return '';
  const rows = Object.entries(headers).map(([name, headerValue]) => {
    const header = requireRecord(
      resolveReference(contract, headerValue, `header ${name}`),
      `header ${name}`,
    );
    const example = 'example' in header
      ? header.example
      : schemaExample(contract, header.schema);
    return `| \`${escapeTable(name)}\` | ${header.required === true ? 'yes' : 'no'} | ${escapeTable(schemaType(contract, header.schema))} | ${escapeTable(schemaConstraints(contract, header.schema))} | ${escapeTable(formatTableExample(example))} | ${escapeTable(normalizeDescription(header.description))} |`;
  });
  return [
    '##### Headers（响应头）',
    '',
    '| Name（名称） | Required（必填） | Type（类型） | Constraints（约束） | Example（示例） | Description（说明） |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

function renderResponseDetails(contract, status, response) {
  const resolved = requireRecord(
    resolveReference(contract, response, `response ${status}`),
    `response ${status}`,
  );
  const lines = [
    `#### Response \`${status}\`（响应）`,
    '',
    normalizeDescription(resolved.description),
    '',
  ];
  const headers = renderResponseHeaders(contract, resolved.headers);
  if (headers !== '') lines.push(headers);
  const content = isRecord(resolved.content) ? resolved.content : {};
  for (const [mediaName, mediaValue] of Object.entries(content)) {
    const media = requireRecord(mediaValue, `response ${status}.${mediaName}`);
    lines.push(
      `##### Body \`${mediaName}\`（响应体）`,
      '',
      `Schema（Schema）: ${schemaType(contract, media.schema)}`,
      '',
    );
    const table = renderSchemaTable(contract, media.schema, 'Fields（字段）', 6);
    if (table !== '') lines.push(table);
    const example = renderExample(firstExample(contract, media));
    if (example !== '') lines.push(example.trimEnd(), '');
  }
  if (Object.keys(content).length === 0 && !isRecord(resolved.headers)) {
    lines.push('No response body or response headers are declared.', '');
  }
  return lines.join('\n');
}

function renderResponses(contract, responses) {
  const entries = Object.entries(responses).sort(([left], [right]) =>
    left.localeCompare(right, 'en', { numeric: true }),
  );
  const rows = entries.map(([status, response]) => {
    const resolved = requireRecord(
      resolveReference(contract, response, `response ${status}`),
      `response ${status}`,
    );
    const content = isRecord(resolved.content) ? resolved.content : {};
    const representations = Object.entries(content).map(([mediaName, mediaValue]) => {
      const media = requireRecord(mediaValue, `response ${status}.${mediaName}`);
      return `\`${mediaName}\` · ${schemaType(contract, media.schema)}`;
    });
    return `| \`${escapeTable(status)}\` | ${escapeTable(normalizeDescription(resolved.description))} | ${escapeTable(representations.join(', ') || 'No body')} |`;
  });
  return [
    '### Responses（响应）',
    '',
    '| Status（状态） | Description（说明） | Representation（表示） |',
    '| --- | --- | --- |',
    ...rows,
    '',
    ...entries.map(([status, response]) =>
      renderResponseDetails(contract, status, response),
    ),
  ].join('\n');
}

function renderOperation(contract, collectedOperation) {
  const { method, operation, parameters, path } = collectedOperation;
  const operationId = requireString(operation, 'operationId', `${method} ${path}`);
  const summary = normalizeDescription(operation.summary, operationId);
  const anchor = slugify(operationId);
  const description = normalizeDescription(operation.description, '');
  const metadata = [
    `| Operation ID（操作 ID） | \`${operationId}\` |`,
    `| Owner（所有者） | \`${operation['x-kokoro-owner']}\` |`,
    `| Visibility（可见性） | \`${operation['x-kokoro-visibility']}\` |`,
    `| Stability（稳定性） | \`${operation['x-kokoro-stability']}\` |`,
    `| Idempotency（幂等性） | \`${operation['x-kokoro-idempotency']}\` |`,
    `| Permission（权限） | \`${operation['x-kokoro-permission']}\` |`,
    ...(operation.deprecated === true
      ? ['| Deprecated（已弃用） | `true` |']
      : []),
  ];
  return [
    `## ${summary} {#${anchor}}`,
    '',
    `<span class="api-method api-method--${method.toLowerCase()}">${method}</span> \`${path}\``,
    '',
    ...(description === '' ? [] : [description, '']),
    '| Contract metadata（契约元数据） | Value（值） |',
    '| --- | --- |',
    ...metadata,
    '',
    renderSecurity(contract, operation),
    renderParameters(contract, parameters),
    renderRequestBody(contract, operation.requestBody),
    renderResponses(contract, operation.responses),
  ]
    .filter((part) => part !== '')
    .join('\n');
}

function renderTagPage(contract, tag, operations, entry) {
  const title = requireString(tag, 'name', 'tag');
  const description = normalizeDescription(tag.description, '');
  return [
    '---',
    `title: ${JSON.stringify(title)}`,
    'outline: [2, 3, 4, 5]',
    'editLink: false',
    '---',
    '<!-- Generated file. Do not edit. -->',
    '',
    `# ${title}`,
    '',
    '> 本页由固定版本的 BFF public contract 自动生成。Generated from the pinned canonical OpenAPI. 需要变更字段时先修改 owner contract，再重新生成。',
    '',
    ...(description === '' ? [] : [description, '']),
    `契约版本（Version）\`${entry.version}\` · owner \`${entry.owner}\` · visibility \`${entry.visibility}\` · source commit \`${entry.source.commit}\` · SHA-256 \`${entry.digest.value}\``,
    '',
    operations.map((operation) => renderOperation(contract, operation)).join('\n\n'),
    '',
  ].join('\n');
}

function renderSchemasPage(contract, entry, schemaNames) {
  const components = isRecord(contract.components) ? contract.components : {};
  const schemas = isRecord(components.schemas) ? components.schemas : {};
  const sections = Object.entries(schemas)
    .filter(([name]) => schemaNames.has(name))
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([name, schemaValue]) => {
      const schema = requireRecord(schemaValue, `schema ${name}`);
      const description = normalizeDescription(schema.description, '');
      const lines = [
        `## ${name} {#${slugify(name)}}`,
        '',
        ...(description === '' ? [] : [description, '']),
        `Type（类型）: ${schemaType(contract, schema)}`,
        '',
        `Constraints（约束）: ${schemaConstraints(contract, schema)}`,
        '',
      ];
      for (const composition of ['allOf', 'oneOf', 'anyOf']) {
        if (Array.isArray(schema[composition])) {
          lines.push(
            `${composition}（组合）: ${schema[composition].map((item) => schemaType(contract, item)).join(', ')}.`,
            '',
          );
        }
      }
      const table = renderSchemaTable(contract, schema);
      if (table !== '') lines.push(table);
      const example = renderExample(schema.example);
      if (example !== '') lines.push(example.trimEnd(), '');
      return lines.join('\n');
    });
  return [
    '---',
    'title: Schemas（数据结构）',
    'outline: [2, 3, 4, 5]',
    'editLink: false',
    '---',
    '<!-- Generated file. Do not edit. -->',
    '',
    '# Schemas（数据结构）',
    '',
    '> 这些是 public wire shape（公开线协议形状），不是 Domain Model、数据库行或内部 DTO。字段、必填性、组合和约束均从 owner contract 生成。',
    '',
    `契约版本（Version）\`${entry.version}\` · owner \`${entry.owner}\` · visibility \`${entry.visibility}\` · source commit \`${entry.source.commit}\` · SHA-256 \`${entry.digest.value}\``,
    '',
    ...sections,
    '',
  ].join('\n');
}

function tagDefinitions(contract, operations) {
  const configuredTags = Array.isArray(contract.tags) ? contract.tags : [];
  const byName = new Map();
  for (const tagValue of configuredTags) {
    const tag = requireRecord(tagValue, 'tag');
    byName.set(requireString(tag, 'name', 'tag'), tag);
  }
  for (const { operation } of operations) {
    const tagName = operation.tags[0];
    if (typeof tagName === 'string' && !byName.has(tagName)) {
      byName.set(tagName, { name: tagName });
    }
  }
  return [...byName.values()].filter((tag) =>
    operations.some(({ operation }) => operation.tags[0] === tag.name),
  );
}

function operationManifestEntry(collectedOperation) {
  const { method, operation, path } = collectedOperation;
  return {
    idempotency: operation['x-kokoro-idempotency'],
    method,
    operationId: operation.operationId,
    owner: operation['x-kokoro-owner'],
    path,
    permission: operation['x-kokoro-permission'],
    stability: operation['x-kokoro-stability'],
    tag: operation.tags[0],
    visibility: operation['x-kokoro-visibility'],
  };
}

export function generateReferenceFiles(contract, catalogEntry) {
  contract = publicContractView(contract);
  const operations = assertPublicContract(contract, catalogEntry);
  const schemaNames = new Set(Object.keys(contract.components?.schemas ?? {}));
  const tags = tagDefinitions(contract, operations);
  const files = new Map();
  const manifestItems = [];
  const indexRows = [];

  for (const tag of tags) {
    const tagName = requireString(tag, 'name', 'tag');
    const tagSlug = slugify(tagName);
    const tagOperations = operations.filter(
      ({ operation }) => operation.tags[0] === tagName,
    );
    files.set(
      `${tagSlug}.md`,
      renderTagPage(contract, tag, tagOperations, catalogEntry),
    );
    manifestItems.push({
      text: tagName,
      link: `/reference/v1/generated/${tagSlug}`,
    });
    for (const collectedOperation of tagOperations) {
      const { method, operation, path } = collectedOperation;
      const operationId = requireString(operation, 'operationId', path);
      indexRows.push(
      `| <span class="api-method api-method--${method.toLowerCase()}">${method}</span> | [${escapeTable(normalizeDescription(operation.summary, operationId))}](/reference/v1/generated/${tagSlug}#${slugify(operationId)}) | \`${escapeTable(path)}\` | \`${operation['x-kokoro-owner']}\` | \`${operation['x-kokoro-visibility']}\` | \`${operation['x-kokoro-stability']}\` | \`${operation['x-kokoro-idempotency']}\` |`,
      );
    }
  }

  manifestItems.push({
    text: 'Schemas',
    link: '/reference/v1/generated/schemas',
  });
  files.set('schemas.md', renderSchemasPage(contract, catalogEntry, schemaNames));
  files.set(
    'index-fragment.md',
    [
      '<!-- Generated file. Do not edit. -->',
      '',
      `契约版本（Version）\`${catalogEntry.version}\` · owner \`${catalogEntry.owner}\` · visibility \`${catalogEntry.visibility}\` · ${operations.length} operations · source \`${catalogEntry.source.commit}\``,
      '',
      '| Method | Operation | Path | Owner | Visibility | Stability | Idempotency |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      ...indexRows,
      '',
    ].join('\n'),
  );
  files.set(
    'manifest.json',
    `${JSON.stringify(
      {
        contract: catalogEntry.id,
        digest: catalogEntry.digest.value,
        generatedBy: GENERATED_MARKER,
        items: manifestItems,
        operationCount: operations.length,
        operations: operations.map(operationManifestEntry),
        owner: catalogEntry.owner,
        schemaCount: schemaNames.size,
        schemaNames: [...schemaNames].sort((left, right) => left.localeCompare(right, 'en')),
        sourceCommit: catalogEntry.source.commit,
        version: catalogEntry.version,
        visibility: catalogEntry.visibility,
      },
      null,
      2,
    )}\n`,
  );

  for (const [path, content] of files) {
    assertPublicationSafe(content, `generated reference ${path}`, {
      allowGeneratedMarkup: true,
    });
  }
  return files;
}

export function writeReferenceFiles(files, outputDirectory, options = {}) {
  return writeManagedReferenceFiles(files, outputDirectory, options);
}

export { ReferenceGenerationError };
