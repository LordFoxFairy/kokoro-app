import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import YAML from "yaml";
import * as sdk from "@/generated/bff-account-profile/sdk.gen";
import {
  accountProfileUpdateSchema,
  accountProfileUpdateAckSchema,
  parseAccountProfileJson,
} from "@/lib/account-profile-update.schema";
it("pins formal15.2 and exactly one narrow name SDK operation", async () => {
  const bytes = await readFile("src/generated/bff-public-openapi.yaml");
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "c77e4921ccce98cfd91d77fc6897cf327599f237ed13438117323b6a3f8555eb",
  );
  expect(YAML.parse(bytes.toString()).info.version).toBe("22.5.0");
  expect(Object.keys(sdk)).toEqual(["updateAccountProfile"]);
});
it("keeps UTF16/closed and escaped original rules exact", () => {
  expect(
    accountProfileUpdateSchema.parse({
      name: "😀".repeat(50),
      expected_name: "\ud800\u0000 ",
    }),
  ).toBeTruthy();
  for (const name of ["😀".repeat(51), "\ud800", "\u0085", " A", "A "])
    expect(
      accountProfileUpdateSchema.safeParse({ name, expected_name: "" }).success,
    ).toBe(false);
  expect(() =>
    parseAccountProfileJson('{"name":"A","na\\u006de":"B"}'),
  ).toThrow();
  expect(
    accountProfileUpdateAckSchema.safeParse({
      data: { subject: "alice", name: "A", token: "no" },
    }).success,
  ).toBe(false);
});
