import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import YAML from "yaml";
it("fixes the entire formal Public28.2 blob and the independent naturally idempotent three-ref configuration", () => {
  const bytes = readFileSync("src/generated/bff-public-openapi.yaml");
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "48aa9638d133223c9f78655e9398ddbb44159963f92a2db891a09212f3aa2726",
  );
  const spec = YAML.parse(bytes.toString("utf8"));
  expect(spec.info.version).toBe("28.4.0");
  const route = spec.paths["/v1/projects/{projectId}/mcp-recommendations"];
  expect(route.put["x-kokoro-idempotency"]).toBe("natural");
  expect(
    spec.components.schemas.ProjectMcpRecommendationRef.oneOf,
  ).toHaveLength(3);
});

it("strict generated decoders bind canonical refs/CAS and the new inverse protects every old and new public byte", async () => {
  const {
    projectMcpRecommendationsRequestSchema: request,
    parseProjectMcpRecommendationsResponse: parse,
  } = await import("@/generated/bff-project-mcp-recommendations");
  const { restorePublic281ProjectMcpRecommendationsContract: restore } =
    await import("./bff-project-mcp-recommendations-parent");
  const raw = readFileSync("src/generated/bff-public-openapi.yaml", "utf8");
  expect(createHash("sha256").update(restore(raw)).digest("hex")).toBe(
    "07e98d803ac3c7342c2e322b507e8760d89e63bc5ecdab3cdf447b68bf3c904c",
  );
  for (const changed of [
    raw + "\n",
    raw.replace("version: 28.4.0", "version: 28.1.0"),
    raw.replace("kind: { const: custom_api }", "kind: { const: changed }"),
    raw.replace("listTeamMembers", "otherOperation"),
  ])
    expect(() => restore(changed)).toThrow(/drift/);
  const ref = { kind: "provider" as const, provider_key: "p" };
  for (const version of ["0", "01", "abc", "2147483648", 1, null])
    expect(
      request.safeParse({
        expected_state_version: version,
        recommendations: [],
      }).success,
    ).toBe(false);
  for (const recommendations of [
    [ref, ref],
    Array.from({ length: 17 }, (_, i) => ({
      kind: "provider",
      provider_key: `p${i}`,
    })),
    [{ ...ref, secret: "no" }],
    [{ kind: "custom_api", profile_id: "" }],
  ])
    expect(
      request.safeParse({ expected_state_version: "1", recommendations })
        .success,
    ).toBe(false);
  expect(() =>
    parse(
      {
        data: {
          project_id: "p",
          recommendations: [],
          state_version: "2147483647",
        },
      },
      "p",
      { expected_state_version: "2147483647", recommendations: [] },
    ),
  ).not.toThrow();
  expect(() =>
    parse(
      {
        data: {
          project_id: "p",
          recommendations: [ref],
          state_version: "2147483648",
        },
      },
      "p",
      { expected_state_version: "2147483647", recommendations: [ref] },
    ),
  ).toThrow();
});
