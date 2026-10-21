import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import YAML from "yaml";
import { describe, expect, it } from "vitest";
import {
  knowledgeFieldsSchema,
  knowledgeReplaceSchema,
  knowledgeDeleteSchema,
  knowledgeUsageInputSchema,
  parseKnowledgeJson,
} from "@/contract/personal-knowledge";

describe("fixed personal knowledge contract consumption", () => {
  it("binds six operations and limits to the immutable producer blob", async () => {
    const bytes = await readFile("src/generated/bff-public-openapi.yaml");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "2c56fd63faa5ed7759133046dfda147bf1d360ddfb32f7570e55df38e487f786",
    );
    const spec = YAML.parse(bytes.toString("utf8"));
    for (const [path, method, name] of [
      ["/v1/preferences/knowledge", "get", "listSelfKnowledge"],
      ["/v1/preferences/knowledge/{knowledge_id}", "get", "getSelfKnowledge"],
      [
        "/v1/preferences/knowledge/{knowledge_id}",
        "put",
        "replaceSelfKnowledge",
      ],
      [
        "/v1/preferences/knowledge/{knowledge_id}",
        "delete",
        "deleteSelfKnowledge",
      ],
      ["/v1/preferences/knowledge-usage", "get", "getSelfKnowledgeUsage"],
      ["/v1/preferences/knowledge-usage", "put", "replaceSelfKnowledgeUsage"],
    ])
      expect(spec.paths[path!][method!]).toMatchObject({
        operationId: name,
        "x-kokoro-idempotency": "none",
      });
    const fields = { name: "a", when_to_use: "b", content: "c" };
    for (const [key, prop] of Object.entries(
      spec.components.schemas.PersonalKnowledgeItem.properties,
    ) as [string, { maxLength?: number }][]) {
      if (prop.maxLength === undefined) continue;
      expect(
        knowledgeFieldsSchema.safeParse({
          ...fields,
          [key]: "🌱".repeat(prop.maxLength),
        }).success,
      ).toBe(true);
      expect(
        knowledgeFieldsSchema.safeParse({
          ...fields,
          [key]: "🌱".repeat(prop.maxLength + 1),
        }).success,
      ).toBe(false);
    }
    expect(
      knowledgeReplaceSchema.safeParse({
        ...fields,
        expected_revision: Number.MAX_SAFE_INTEGER,
      }).success,
    ).toBe(true);
    expect(
      knowledgeReplaceSchema.safeParse({
        ...fields,
        expected_revision: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
    expect(
      knowledgeDeleteSchema.safeParse({ expected_revision: 0 }).success,
    ).toBe(false);
    expect(
      knowledgeUsageInputSchema.safeParse({
        expected_revision: 0,
        enabled: true,
        tenant: "spoof",
      }).success,
    ).toBe(false);
  });
  it("does not collapse escaped duplicate command keys or nested values", () => {
    expect(() => parseKnowledgeJson('{"name":"a","na\\u006de":"b"}')).toThrow();
    expect(() => parseKnowledgeJson('{"name":{"nested":true}}')).toThrow();
    expect(
      parseKnowledgeJson(
        '{"name":"x\\\":x,\\\"name\\\":y","when_to_use":"b","content":"c","expected_revision":0}',
      ),
    ).toEqual({
      name: 'x":x,"name":y',
      when_to_use: "b",
      content: "c",
      expected_revision: 0,
    });
  });
});
