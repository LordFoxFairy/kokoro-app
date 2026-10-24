import { restorePublic153 } from "./bff-archived-tasks-parent";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import YAML from "yaml";
import { expect, it } from "vitest";
import * as sdk from "@/generated/bff-shared-tasks/sdk.gen";
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, stable(v)]),
    );
  return value;
}
it("pins formal15.3 bytes and restores complete15.2 canonical contract after only the new list is removed", async () => {
  const bytes = await readFile("src/generated/bff-public-openapi.yaml");
  expect(hash(bytes)).toBe(
    "f4caf11f3cd9255d2cd9daf69b74ff9988505d640e31c686ce495e6d8a578b2c",
  );
  let spec = YAML.parse(bytes.toString());
  expect(spec.info.version).toBe("24.0.0");
  expect(spec.paths["/v1/account/shared-tasks"].get.operationId).toBe(
    "listOwnedSharedTasks",
  );
  expect(
    Object.values(spec.paths).flatMap((p) =>
      Object.keys(p as object).filter((k) =>
        ["get", "post", "put", "delete", "patch", "head", "options"].includes(
          k,
        ),
      ),
    ),
  ).toHaveLength(186);
  spec = YAML.parse(restorePublic153(bytes).toString());
  delete spec.paths["/v1/account/shared-tasks"];
  for (const key of [
    "SharedTaskItem",
    "SharedTasksResponse",
    "SharedTasksError400",
    "SharedTasksError401",
    "SharedTasksError403",
    "SharedTasksError429",
    "SharedTasksError503",
  ])
    delete spec.components.schemas[key];
  spec.info.version = "15.2.0";
  expect(hash(JSON.stringify(stable(spec)))).toBe(
    "2f19f8bdd35db0861009362be62727ed98a5e8147f3174897305d6005fa696f5",
  );
  expect(Object.keys(sdk).sort()).toEqual([
    "createShare",
    "listOwnedSharedTasks",
    "revokeShare",
  ]);
});
