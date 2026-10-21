import { ReferenceGenerationError } from './reference-errors.mjs';
import { escapeContractTemplates } from './publication-policy.mjs';

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function requireRecord(value, label) {
  if (!isRecord(value)) {
    throw new ReferenceGenerationError(`${label} must be an object`);
  }
  return value;
}

export function escapeTable(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function normalizeDescription(value, fallback = '—') {
  if (typeof value !== 'string' || value.trim() === '') {
    return fallback;
  }
  return escapeContractTemplates(value.trim().replace(/\s+/g, ' '));
}

export function slugify(value) {
  const slug = value
    .normalize('NFKD')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'reference';
}

function referenceName(reference) {
  return reference.split('/').at(-1) ?? reference;
}

export function resolveReference(contract, value, label) {
  if (!isRecord(value) || typeof value.$ref !== 'string') {
    return value;
  }
  if (!value.$ref.startsWith('#/')) {
    throw new ReferenceGenerationError(
      `${label} uses unsupported external reference ${value.$ref}`,
    );
  }
  let current = contract;
  for (const rawPart of value.$ref.slice(2).split('/')) {
    const part = rawPart.replaceAll('~1', '/').replaceAll('~0', '~');
    if (!isRecord(current) || !(part in current)) {
      throw new ReferenceGenerationError(
        `${label} has unresolved reference ${value.$ref}`,
      );
    }
    current = current[part];
  }
  return current;
}

function dereference(contract, schema, label, references = new Set()) {
  let current = schema;
  while (isRecord(current) && typeof current.$ref === 'string') {
    if (references.has(current.$ref)) {
      return current;
    }
    references.add(current.$ref);
    current = resolveReference(contract, current, label);
  }
  return current;
}

export function schemaType(contract, schema) {
  if (!isRecord(schema)) {
    return 'unknown';
  }
  if (typeof schema.$ref === 'string') {
    if (!schema.$ref.startsWith('#/')) {
      throw new ReferenceGenerationError(
        `schema uses unsupported external reference ${schema.$ref}`,
      );
    }
    resolveReference(contract, schema, 'schema');
    const name = referenceName(schema.$ref);
    return `[${name}](./schemas#${slugify(name)})`;
  }
  if (Array.isArray(schema.oneOf)) {
    return `one of: ${schema.oneOf.map((item) => schemaType(contract, item)).join(' or ')}`;
  }
  if (Array.isArray(schema.anyOf)) {
    return `any of: ${schema.anyOf.map((item) => schemaType(contract, item)).join(' or ')}`;
  }
  if (Array.isArray(schema.allOf)) {
    return `all of: ${schema.allOf.map((item) => schemaType(contract, item)).join(' + ')}`;
  }
  if (schema.type === 'array') {
    return `array of ${schemaType(contract, schema.items)}`;
  }
  const rawType = Array.isArray(schema.type)
    ? schema.type.join(' or ')
    : typeof schema.type === 'string'
      ? schema.type
      : 'object';
  return typeof schema.format === 'string'
    ? `${rawType} (${schema.format})`
    : rawType;
}

export function schemaConstraints(contract, schema) {
  if (!isRecord(schema)) {
    return '—';
  }
  const resolved = dereference(contract, schema, 'schema');
  const constraints = [];
  if ('const' in resolved) {
    constraints.push(`Const: ${JSON.stringify(resolved.const)}`);
  }
  if (Array.isArray(resolved.enum)) {
    constraints.push(`Enum: ${resolved.enum.map((item) => JSON.stringify(item)).join(', ')}`);
  }
  for (const [key, label] of [
    ['multipleOf', 'Multiple of'],
    ['minimum', 'Minimum'],
    ['maximum', 'Maximum'],
    ['exclusiveMinimum', 'Exclusive minimum'],
    ['exclusiveMaximum', 'Exclusive maximum'],
    ['minLength', 'Min length'],
    ['maxLength', 'Max length'],
    ['minItems', 'Min items'],
    ['maxItems', 'Max items'],
    ['minProperties', 'Min properties'],
    ['maxProperties', 'Max properties'],
  ]) {
    if (typeof resolved[key] === 'number' || typeof resolved[key] === 'boolean') {
      constraints.push(`${label}: ${resolved[key]}`);
    }
  }
  if (typeof resolved.pattern === 'string') {
    constraints.push(`Pattern: ${formatTableExample(resolved.pattern)}`);
  }
  if (resolved.uniqueItems === true) {
    constraints.push('Unique items');
  }
  for (const [key, label] of [
    ['readOnly', 'Read-only'],
    ['writeOnly', 'Write-only'],
  ]) {
    if (resolved[key] === true) constraints.push(label);
  }
  if (resolved.additionalProperties === false) {
    constraints.push('Closed object');
  } else if (resolved.additionalProperties === true) {
    constraints.push('Additional properties allowed');
  }
  return constraints.length === 0 ? '—' : constraints.join('; ');
}

export function schemaExample(contract, schema) {
  if (!isRecord(schema)) {
    return undefined;
  }
  if ('example' in schema) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length > 0) {
    return schema.examples[0];
  }
  if ('default' in schema) return schema.default;
  if ('const' in schema) return schema.const;
  const resolved = dereference(contract, schema, 'schema');
  if (resolved !== schema) {
    return schemaExample(contract, resolved);
  }
  return undefined;
}

export function schemaDefault(contract, schema) {
  if (!isRecord(schema)) return undefined;
  if ('default' in schema) return schema.default;
  const resolved = dereference(contract, schema, 'schema');
  if (resolved !== schema) return schemaDefault(contract, resolved);
  return undefined;
}

export function formatExample(value) {
  if (value === undefined) return '—';
  return JSON.stringify(value);
}

export function formatTableExample(value) {
  if (value === undefined) return '—';
  const text = typeof value === 'string' ? value : formatExample(value);
  const runs = [...text.matchAll(/`+/gu)].map((match) => match[0].length);
  const fence = '`'.repeat(Math.max(0, ...runs) + 1);
  const padding = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  // Escape table separators only at the final row boundary, not in code spans.
  return `${fence}${padding}${text}${padding}${fence}`;
}

export function renderExample(example) {
  if (example === undefined) {
    return '';
  }
  const serialized = JSON.stringify(example, null, 2) ?? 'null';
  let longestBacktickRun = 0;
  let currentBacktickRun = 0;
  for (const character of serialized) {
    if (character === '`') {
      currentBacktickRun += 1;
      longestBacktickRun = Math.max(longestBacktickRun, currentBacktickRun);
    } else {
      currentBacktickRun = 0;
    }
  }
  const fence = '`'.repeat(Math.max(3, longestBacktickRun + 1));
  return `\n\n**Example（示例）**\n\n${fence}json\n${serialized}\n${fence}\n`;
}

export function firstExample(contract, mediaType) {
  if (!isRecord(mediaType)) {
    return undefined;
  }
  if (typeof mediaType.$ref === 'string') {
    return firstExample(contract, resolveReference(contract, mediaType, 'media type'));
  }
  if ('example' in mediaType) {
    return mediaType.example;
  }
  if (isRecord(mediaType.examples)) {
    for (const candidate of Object.values(mediaType.examples)) {
      const resolved = isRecord(candidate) && typeof candidate.$ref === 'string'
        ? resolveReference(contract, candidate, 'media example')
        : candidate;
      if (isRecord(resolved) && 'value' in resolved) {
        return resolved.value;
      }
    }
  }
  return undefined;
}

function schemaKind(schema) {
  if (!isRecord(schema)) return 'unknown';
  if (schema.type === 'array') return 'array';
  if (schema.type === 'object' || isRecord(schema.properties)) return 'object';
  if (Array.isArray(schema.allOf) || Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)) {
    return 'composition';
  }
  return 'scalar';
}

function fieldRow(contract, path, required, schema) {
  return {
    constraints: schemaConstraints(contract, schema),
    description: normalizeDescription(schema.description),
    example: schemaExample(contract, schema),
    path,
    required,
    schema,
    type: schemaType(contract, schema),
  };
}

function renderRequired(value) {
  return value === undefined ? '—' : value ? 'yes' : 'no';
}

export function collectSchemaRows(contract, schema) {
  const rows = [];
  const rowKeys = new Set();

  function addRow(path, required, value) {
    const row = fieldRow(contract, path, required, value);
    const key = `${row.path}\u0000${row.type}\u0000${renderRequired(row.required)}\u0000${row.constraints}`;
    if (!rowKeys.has(key)) {
      rowKeys.add(key);
      rows.push(row);
    }
  }

  function visit(rawSchema, path, required, references, includeSelf) {
    if (!isRecord(rawSchema)) return;
    if (includeSelf && path !== '') {
      addRow(path, required, rawSchema);
    }

    if (typeof rawSchema.$ref === 'string') {
      if (references.has(rawSchema.$ref)) return;
      const nextReferences = new Set(references);
      nextReferences.add(rawSchema.$ref);
      visit(
        resolveReference(contract, rawSchema, `schema field ${path || '$'}`),
        path,
        required,
        nextReferences,
        false,
      );
      return;
    }

    const compositions = ['allOf', 'oneOf', 'anyOf'];
    for (const composition of compositions) {
      if (Array.isArray(rawSchema[composition])) {
        for (const branch of rawSchema[composition]) {
          visit(branch, path, required, references, false);
        }
      }
    }

    const kind = schemaKind(rawSchema);
    if (kind === 'object' || kind === 'composition') {
      const properties = isRecord(rawSchema.properties) ? rawSchema.properties : {};
      const requiredProperties = new Set(
        Array.isArray(rawSchema.required) ? rawSchema.required : [],
      );
      for (const [propertyName, propertySchema] of Object.entries(properties)) {
        visit(
          propertySchema,
          path === '' ? propertyName : `${path}.${propertyName}`,
          requiredProperties.has(propertyName),
          references,
          true,
        );
      }
      return;
    }

    if (kind === 'array' && 'items' in rawSchema) {
      visit(rawSchema.items, `${path}[]`, undefined, references, true);
    }
  }

  visit(schema, '', undefined, new Set(), false);
  return rows;
}

export function renderSchemaTable(
  contract,
  schema,
  heading = 'Fields（字段）',
  headingLevel = 4,
) {
  const rows = collectSchemaRows(contract, schema);
  if (rows.length === 0) return '';
  return [
    `${'#'.repeat(headingLevel)} ${heading}`,
    '',
    '| Field（字段） | Required（必填） | Type（类型） | Constraints（约束） | Default（默认） | Example（示例） | Description（说明） |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| \`${escapeTable(row.path)}\` | ${renderRequired(row.required)} | ${escapeTable(row.type)} | ${escapeTable(row.constraints)} | ${escapeTable(formatTableExample(schemaDefault(contract, row.schema)))} | ${escapeTable(formatTableExample(row.example))} | ${escapeTable(row.description)} |`,
    ),
    '',
  ].join('\n');
}
