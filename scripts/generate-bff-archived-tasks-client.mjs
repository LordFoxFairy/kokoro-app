import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(root, "src/generated/bff-public-openapi.yaml");
const outputPath = join(root, "src/generated/bff-archived-tasks");
const configPath = join(root, "openapi-ts.bff-archived-tasks.config.ts");
const expectedDigest =
  "f4caf11f3cd9255d2cd9daf69b74ff9988505d640e31c686ce495e6d8a578b2c";
const operations = [["GET", "/v1/account/archived-tasks"], ["GET", "/v1/sessions/{session_id}/archive"], ["POST", "/v1/sessions/{session_id}/archive"], ["POST", "/v1/sessions/{session_id}/restore"]];

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function narrowedArchivedTasksSpec(spec) {
  const paths = {};
  for (const [method, path] of operations) {
    const operation = spec.paths?.[path]?.[method.toLowerCase()];
    assert.ok(
      operation,
      `missing BFF Archived tasks operation: ${method} ${path}`,
    );
    paths[path] ??= {};
    paths[path][method.toLowerCase()] = operation;
  }

  const components = {
    securitySchemes: spec.components?.securitySchemes ?? {},
  };
  const refs = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (key === "$ref" && typeof item === "string") refs.add(item);
      else visit(item);
    }
  };
  visit(paths);
  const visited = new Set();
  while (refs.size > 0) {
    const ref = refs.values().next().value;
    refs.delete(ref);
    if (visited.has(ref)) continue;
    visited.add(ref);
    const match = /^#\/components\/([^/]+)\/([^/]+)$/u.exec(ref);
    assert.ok(match, `unsupported BFF Archived tasks component ref: ${ref}`);
    const [, group, name] = match;
    const component = spec.components?.[group]?.[name];
    assert.ok(component, `missing BFF Archived tasks component: ${ref}`);
    components[group] ??= {};
    components[group][name] = component;
    visit(component);
  }
  return {
    openapi: spec.openapi,
    info: spec.info,
    servers: spec.servers,
    security: spec.security,
    paths,
    components,
  };
}

async function files(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(join(directory, prefix), {
    withFileTypes: true,
  })) {
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...(await files(directory, relative)));
    else result.push(relative);
  }
  return result.sort();
}

async function normalizeGenerated(directory, relative, replacements) {
  const target = join(directory, relative);
  let source = await readFile(target, "utf8");
  for (const [from, to, count] of replacements) {
    assert.equal(
      source.split(from).length - 1,
      count,
      `unexpected @hey-api 0.99.0 output in ${relative}`,
    );
    source = source.replaceAll(from, to);
  }
  await writeFile(target, source);
}

async function normalizeExactOptionalProperties(directory) {
  await normalizeGenerated(directory, "client/client.gen.ts", [
    [
      `    const resolvedOpts = opts as typeof opts &
      ResolvedRequestOptions<TResponseStyle, ThrowOnError, Url>;`,
      `    const { serializedBody, ...requestOptions } = opts
    const resolvedOpts = {
      ...requestOptions,
      ...(serializedBody === undefined ? {} : { serializedBody }),
    } as ResolvedRequestOptions<TResponseStyle, ThrowOnError, Url>`,
      1,
    ],
    [
      `    const { opts, url } = await beforeRequest(options);
    return createSseClient({
      ...opts,
      body: opts.body as BodyInit | null | undefined,`,
      `    const { opts, url } = await beforeRequest(options)
    const { body, ...sseOptions } = opts
    return createSseClient({
      ...sseOptions,
      ...(body === undefined ? {} : { body: body as BodyInit | null }),`,
      1,
    ],
  ]);
  await normalizeGenerated(directory, "client/utils.gen.ts", [
    [
      "            allowReserved: options.allowReserved,",
      "            ...(options.allowReserved === undefined ? {} : { allowReserved: options.allowReserved }),",
      3,
    ],
    [
      "    path: options.path,",
      "    ...(options.path === undefined ? {} : { path: options.path }),",
      1,
    ],
    [
      "    query: options.query,",
      "    ...(options.query === undefined ? {} : { query: options.query }),",
      1,
    ],
  ]);
  await normalizeGenerated(directory, "core/params.gen.ts", [
    [
      `        map.set(config.key, {
          in: config.in,
          map: config.map,
        });`,
      `        map.set(config.key, {
          in: config.in,
          ...(config.map === undefined ? {} : { map: config.map }),
        });`,
      1,
    ],
  ]);
  await normalizeGenerated(directory, "core/pathSerializer.gen.ts", [
    [
      `        allowReserved,
        name,`,
      `        ...(allowReserved === undefined ? {} : { allowReserved }),
        name,`,
      1,
    ],
    [
      `        allowReserved,
        name:`,
      `        ...(allowReserved === undefined ? {} : { allowReserved }),
        name:`,
      1,
    ],
  ]);
  await normalizeGenerated(directory, "core/serverSentEvents.gen.ts", [
    [
      "          body: options.serializedBody,",
      "          ...(options.serializedBody === undefined ? {} : { body: options.serializedBody }),",
      1,
    ],
    [
      "                event: eventName,",
      "                ...(eventName === undefined ? {} : { event: eventName }),",
      1,
    ],
    [
      "                id: lastEventId,",
      "                ...(lastEventId === undefined ? {} : { id: lastEventId }),",
      1,
    ],
  ]);
}

async function main() {
  const mode = process.argv[2];
  assert.ok(
    mode === "--write" || mode === "--check",
    "expected --write or --check",
  );
  const source = await readFile(sourcePath);
  assert.equal(
    digest(source),
    expectedDigest,
    "BFF public OpenAPI owner digest drift",
  );
  const spec = narrowedArchivedTasksSpec(YAML.parse(source.toString("utf8")));
  const temporary = await mkdtemp(
    join(tmpdir(), "kokoro-bff-archived-tasks-client-"),
  );
  try {
    const input = join(temporary, "team.openapi.json");
    const output = join(temporary, "generated");
    await writeFile(input, `${JSON.stringify(spec, null, 2)}\n`);
    const run = spawnSync(
      process.execPath,
      [
        join(root, "node_modules/@hey-api/openapi-ts/bin/run.js"),
        "-f",
        configPath,
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          BFF_ARCHIVED_TASKS_CLIENT_INPUT: input,
          BFF_ARCHIVED_TASKS_CLIENT_OUTPUT: output,
        },
        encoding: "utf8",
      },
    );
    assert.equal(
      run.status,
      0,
      `Archived tasks OpenAPI generation failed:\n${run.stdout}\n${run.stderr}`,
    );
    await normalizeExactOptionalProperties(output);
    const generated = await files(output);
    assert.ok(
      generated.includes("types.gen.ts") && generated.includes("sdk.gen.ts"),
      "missing generated Archived tasks types or SDK",
    );
    if (mode === "--write") {
      await rm(outputPath, { recursive: true, force: true });
      await cp(output, outputPath, { recursive: true });
    } else {
      assert.deepEqual(
        await files(outputPath),
        generated,
        "generated Archived tasks file list drift",
      );
      for (const relative of generated) {
        assert.deepEqual(
          await readFile(join(outputPath, relative)),
          await readFile(join(output, relative)),
          `generated Archived tasks drift: ${relative}`,
        );
      }
    }
    process.stdout.write(
      `BFF Archived tasks generated client ${mode.slice(2)} passed (${generated.length} files, owner SHA-256 ${expectedDigest})\n`,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

await main();
