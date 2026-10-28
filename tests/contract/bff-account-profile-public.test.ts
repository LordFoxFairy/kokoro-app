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
    "921be666a3bd570eb984503528d9ee713e3739cc8525e2e1c2f46c96fa161a05",
  );
  expect(YAML.parse(bytes.toString()).info.version).toBe("28.14.0");
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
