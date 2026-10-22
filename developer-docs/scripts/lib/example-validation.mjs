import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parseDocument } from 'yaml';

const RUNTIMES = new Set(['bash', 'python', 'tsx']);
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

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value, label) {
  if (!isRecord(value)) {
    throw new ExampleValidationError(`${label} must be a mapping`);
  }
  return value;
}

function requireString(record, key, label) {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ExampleValidationError(`${label}.${key} must be a string`);
  }
  return value;
}

function resolvePointer(contract, reference) {
  if (!reference.startsWith('#/')) {
    throw new ExampleValidationError(
      `example schema uses external reference ${reference}`,
    );
  }
  let current = contract;
  for (const rawPart of reference.slice(2).split('/')) {
    const part = rawPart.replaceAll('~1', '/').replaceAll('~0', '~');
    if (!isRecord(current) || !(part in current)) {
      throw new ExampleValidationError(`unresolved schema reference ${reference}`);
    }
    current = current[part];
  }
  return current;
}

function dereferenceSchema(contract, value, references = new Set()) {
  if (Array.isArray(value)) {
    return value.map((item) => dereferenceSchema(contract, item, references));
  }
  if (!isRecord(value)) {
    return value;
  }
  if (typeof value.$ref === 'string') {
    if (references.has(value.$ref)) {
      throw new ExampleValidationError(
        `recursive example schema is unsupported: ${value.$ref}`,
      );
    }
    const nextReferences = new Set(references);
    nextReferences.add(value.$ref);
    return dereferenceSchema(
      contract,
      resolvePointer(contract, value.$ref),
      nextReferences,
    );
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      dereferenceSchema(contract, item, references),
    ]),
  );
}

function operationIndex(contract) {
  const paths = requireRecord(contract.paths, 'OpenAPI paths');
  const index = new Map();
  for (const [path, pathValue] of Object.entries(paths)) {
    const pathItem = requireRecord(pathValue, `OpenAPI path ${path}`);
    for (const [method, operationValue] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      const operation = requireRecord(
        operationValue,
        `${method.toUpperCase()} ${path}`,
      );
      const operationId = requireString(
        operation,
        'operationId',
        `${method.toUpperCase()} ${path}`,
      );
      if (
        operation['x-kokoro-owner'] === 'kokoro-bff' &&
        operation['x-kokoro-visibility'] === 'public'
      ) {
        index.set(operationId, {
          method: method.toUpperCase(),
          operation,
          path,
        });
      }
    }
  }
  return index;
}

function assertExamplePath(file, portalRoot, checkFiles) {
  if (isAbsolute(file) || !file.startsWith('examples/')) {
    throw new ExampleValidationError(
      `example file ${file} must stay under examples/`,
    );
  }
  const absolutePath = resolve(portalRoot, file);
  const examplesRoot = resolve(portalRoot, 'examples');
  const relativePath = relative(examplesRoot, absolutePath);
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new ExampleValidationError(
      `example file ${file} must stay under examples/`,
    );
  }
  if (checkFiles && !existsSync(absolutePath)) {
    throw new ExampleValidationError(`example file does not exist: ${file}`);
  }
  return absolutePath;
}

function validateRequestBody(contract, operationEntry, exampleOperation, label) {
  if (!('request_body' in exampleOperation)) return;
  const operation = operationEntry.operation;
  const requestBody = requireRecord(
    operation.requestBody,
    `${label} OpenAPI requestBody`,
  );
  const content = requireRecord(
    requestBody.content,
    `${label} OpenAPI requestBody.content`,
  );
  const contentType = requireString(exampleOperation, 'content_type', label);
  const mediaType = requireRecord(
    content[contentType],
    `${label} OpenAPI content type ${contentType}`,
  );
  const schema = dereferenceSchema(contract, mediaType.schema);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addFormat('binary', true);
  const validate = ajv.compile(schema);
  if (!validate(exampleOperation.request_body)) {
    const details = (validate.errors ?? [])
      .map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`)
      .join('; ');
    throw new ExampleValidationError(
      `${label} request body is invalid: ${details}`,
    );
  }
}

export class ExampleValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExampleValidationError';
  }
}

export function validateExampleManifest(manifestValue, contract, options) {
  const manifest = requireRecord(manifestValue, 'example manifest');
  if (manifest.schema_version !== 1) {
    throw new ExampleValidationError('example manifest schema_version must be 1');
  }
  if (!Array.isArray(manifest.examples) || manifest.examples.length === 0) {
    throw new ExampleValidationError(
      'example manifest examples must be a non-empty list',
    );
  }
  const operations = operationIndex(contract);
  const ids = new Set();
  let operationCount = 0;
  const examples = manifest.examples.map((exampleValue, exampleIndex) => {
    const label = `examples[${exampleIndex}]`;
    const example = requireRecord(exampleValue, label);
    const id = requireString(example, 'id', label);
    if (ids.has(id)) {
      throw new ExampleValidationError(`duplicate example id ${id}`);
    }
    ids.add(id);
    const file = requireString(example, 'file', label);
    const absolutePath = assertExamplePath(
      file,
      options.portalRoot,
      options.checkFiles !== false,
    );
    const runtime = requireString(example, 'runtime', label);
    if (!RUNTIMES.has(runtime)) {
      throw new ExampleValidationError(`${label}.runtime is unsupported: ${runtime}`);
    }
    if (!Array.isArray(example.operations) || example.operations.length === 0) {
      throw new ExampleValidationError(`${label}.operations must not be empty`);
    }
    const declaredOperations = example.operations.map(
      (operationValue, operationIndexValue) => {
        const operationLabel = `${id} operations[${operationIndexValue}]`;
        const exampleOperation = requireRecord(
          operationValue,
          operationLabel,
        );
        const operationId = requireString(
          exampleOperation,
          'operation_id',
          operationLabel,
        );
        const operationEntry = operations.get(operationId);
        if (operationEntry === undefined) {
          throw new ExampleValidationError(
            `${id} references unknown public operation ${operationId}`,
          );
        }
        validateRequestBody(
          contract,
          operationEntry,
          exampleOperation,
          id,
        );
        operationCount += 1;
        return {
          contentType:
            typeof exampleOperation.content_type === 'string'
              ? exampleOperation.content_type
              : undefined,
          method: operationEntry.method,
          operationId,
          path: operationEntry.path,
          requestBody: exampleOperation.request_body,
        };
      },
    );
    return { absolutePath, file, id, operations: declaredOperations, runtime };
  });
  return { examples, operationCount };
}

export function loadExampleManifest(manifestPath, contract, options) {
  const document = parseDocument(readFileSync(manifestPath, 'utf8'), {
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    throw new ExampleValidationError(
      `example manifest is invalid YAML: ${document.errors[0]?.message ?? 'unknown parse error'}`,
    );
  }
  return validateExampleManifest(document.toJS(), contract, options);
}
