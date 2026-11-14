import { expect, expectTypeOf, it, vi } from "vitest";
import { createClient } from "@/generated/bff-shared-tasks/client";
import { getSessionShareMetadata, createShare, revokeShare } from "@/generated/bff-shared-tasks/sdk.gen";
import type { GetSessionShareMetadataData, CreateShareData, RevokeShareData } from "@/generated/bff-shared-tasks/types.gen";

it.each(["GET", "POST", "DELETE"] as const)("the inherited required SessionId replaces the actual %s Share SDK URL segment", async method => {
  expectTypeOf<GetSessionShareMetadataData["path"]>().toEqualTypeOf<{ id: string }>();
  expectTypeOf<CreateShareData["path"]>().toEqualTypeOf<{ id: string }>();
  expectTypeOf<RevokeShareData["path"]>().toEqualTypeOf<{ id: string }>();
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ data: { share: null }, meta: { request_id: "qa-read" } }), { headers: { "content-type": "application/json" } }));
  const client = createClient({ baseUrl: "https://bff.example.test", fetch });
  const id = "session/space 雪";
  const result = method === "GET" ? await getSessionShareMetadata({ client, path: { id }, query: { scope: "direct" } })
    : method === "POST" ? await createShare({ client, path: { id }, headers: { "Idempotency-Key": "original" }, query: { scope: "direct" } })
    : await revokeShare({ client, path: { id }, headers: { "Idempotency-Key": "original" }, query: { scope: "direct" } });
  expect(result.data).toHaveProperty("data.share", null);
  expect(fetch).toHaveBeenCalledOnce();
  const request = fetch.mock.calls[0]![0];
  if (!(request instanceof Request)) throw Error("SDK must issue a Request");
  expect(request.url).toBe(`https://bff.example.test/v1/sessions/${encodeURIComponent(id)}/share?scope=direct`);
  expect(request.method).toBe(method); expect(request.headers.get("Idempotency-Key")).toBe(method === "GET" ? null : "original");
});
