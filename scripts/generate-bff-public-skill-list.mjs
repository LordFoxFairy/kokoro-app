import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
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
const destination = join(root, "src/generated/bff-public-skill-list");
const ownerCommit = "51e049df72c1fb2fe82b9114135c2fdc1a3450d9";
const expectedDigest =
  "b438a749c919d24c4e0f1dadfdbcbbb11e0ac755f5785c543a661336c2cbb354";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const mode = process.argv[2];
assert.ok(
  mode === "--write" || mode === "--check",
  "expected --write or --check",
);
const bytes = await readFile(sourcePath);
assert.equal(hash(bytes), expectedDigest, "BFF canonical owner digest drift");
const spec = YAML.parse(bytes.toString("utf8"));
const operation = spec.paths?.["/v1/skill.list"]?.get;
assert.equal(
  operation?.operationId,
  "listSkills",
  "public Skill list operation drift",
);
const paths = { "/v1/skill.list": { get: operation } };
const components = { securitySchemes: spec.components?.securitySchemes ?? {} };
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
while (refs.size) {
  const ref = refs.values().next().value;
  refs.delete(ref);
  if (visited.has(ref)) continue;
  visited.add(ref);
  const match = /^#\/components\/([^/]+)\/([^/]+)$/u.exec(ref);
  assert.ok(match, `unsupported component ${ref}`);
  const [, group, name] = match,
    component = spec.components?.[group]?.[name];
  assert.ok(component, `missing component ${ref}`);
  components[group] ??= {};
  components[group][name] = component;
  visit(component);
}
const temporary = await mkdtemp(
  join(tmpdir(), "kokoro-bff-public-skill-list-"),
);
try {
  const input = join(temporary, "openapi.yaml"),
    output = join(temporary, "generated");
  await writeFile(
    input,
    YAML.stringify({
      openapi: spec.openapi,
      info: spec.info,
      servers: spec.servers,
      security: spec.security,
      paths,
      components,
    }),
  );
  const generated = spawnSync(
    process.execPath,
    [
      join(root, "node_modules/@hey-api/openapi-ts/bin/run.js"),
      "-f",
      join(root, "openapi-ts.bff-public-skill-list.config.ts"),
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        BFF_PUBLIC_SKILL_LIST_INPUT: input,
        BFF_PUBLIC_SKILL_LIST_OUTPUT: output,
      },
      encoding: "utf8",
    },
  );
  assert.equal(generated.status, 0, `${generated.stdout}\n${generated.stderr}`);
  await writeFile(
    join(output, "provenance.ts"),
    `// Generated from the fixed BFF canonical artifact. Do not edit.\nexport const publicSkillListProvenance = ${JSON.stringify({ ownerCommit, sourceSha256: expectedDigest, version: spec.info.version, operationId: operation.operationId, method: "GET", path: "/v1/skill.list", statuses: Object.keys(operation.responses).map(Number) }, null, 2)} as const\n`,
  );
  const files = (await readdir(output)).sort();
  assert.deepEqual(files, ["provenance.ts", "types.gen.ts", "zod.gen.ts"]);
  if (mode === "--write") {
    await rm(destination, { recursive: true, force: true });
    await cp(output, destination, { recursive: true });
  } else {
    assert.deepEqual(
      (await readdir(destination)).sort(),
      files,
      "generated inventory drift",
    );
    for (const file of files)
      assert.equal(
        await readFile(join(destination, file), "utf8"),
        await readFile(join(output, file), "utf8"),
        `generated drift: ${file}`,
      );
  }
  process.stdout.write(
    `BFF public Skill list ${mode.slice(2)} passed (${files.length} files; ${expectedDigest})\n`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
