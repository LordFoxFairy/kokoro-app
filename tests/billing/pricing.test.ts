// PAY-2 价格/购买客户端：目录 Zod 校验、checkout 诚实态映射（501→unavailable / 401→unauthenticated）。
import { afterEach, describe, expect, it, vi } from "vitest"

import { createPricingClient, PricingClientError } from "@/billing/pricing"

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("PricingClient.plans", () => {
  it("过 Zod 校验返回目录", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          plans: [
            { id: "p1", key: "studio", name: "Studio", currency: "USD", amount_minor: "4900", credit_micros: "1000000", billing_interval: "month" },
          ],
        }),
      ),
    )
    const catalog = await createPricingClient().plans()
    expect(catalog.plans[0]).toMatchObject({ id: "p1", amount_minor: "4900", billing_interval: "month" })
  })

  it("payment 未配置（503）→ not_configured 错误（展示层据此显示未开通态）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(503, { error: "payment_not_configured" })))
    await expect(createPricingClient().plans()).rejects.toMatchObject({ reason: "not_configured" })
  })

  it("形状不符 → parse 错误（零静默降级）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { plans: [{ id: "p1" }] })))
    await expect(createPricingClient().plans()).rejects.toBeInstanceOf(PricingClientError)
  })
})

describe("PricingClient.checkout（诚实态）", () => {
  it("501 → unavailable（支付渠道未开通，禁用购买）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(501, { error: "checkout_unavailable" })))
    expect(await createPricingClient().checkout("p1")).toEqual({ status: "unavailable" })
  })

  it("401 → unauthenticated（购买要求登录）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { error: "unauthenticated" })))
    expect(await createPricingClient().checkout("p1")).toEqual({ status: "unauthenticated" })
  })

  it("200 → ok + checkout_url（provider 已配置的跳转）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { checkout_url: "https://pay.example/session/xyz" })))
    expect(await createPricingClient().checkout("p1")).toEqual({ status: "ok", checkout_url: "https://pay.example/session/xyz" })
  })

  it("提交 body 只带 plan_id（身份轴不由浏览器携带）", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(501, { error: "checkout_unavailable" }))
    vi.stubGlobal("fetch", fetchMock)
    await createPricingClient().checkout("p1")
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ plan_id: "p1" })
  })
})

describe("SET26 formal plans absolute deadline", () => {
  it.each(["fetch", "body"])("noncooperative %s settles at10s and aborts its owned request", async (phase) => {
    let signal: AbortSignal | undefined;
    const bodyCancel = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn().mockImplementation((_input: unknown, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      if (phase === "fetch") return new Promise(() => {});
      return Promise.resolve(new Response(new ReadableStream({
        pull() { return new Promise<void>(() => {}); }, cancel: bodyCancel,
      }), { status: 200 }));
    });
    try {
      vi.useFakeTimers();
      vi.stubGlobal("fetch", fetcher);
      let result: unknown = "pending";
      void createPricingClient().plans().then(() => { result = "success"; }, (error) => { result = error; });
      await vi.advanceTimersByTimeAsync(9_999);
      expect(result).toBe("pending");
      await vi.advanceTimersByTimeAsync(1);
      expect(result).toBeInstanceOf(PricingClientError);
      expect(result).toMatchObject({ reason: "timeout" });
      expect(signal?.aborted).toBe(true);
      if (phase === "body") expect(bodyCancel).toHaveBeenCalledOnce();
      expect(fetcher).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
});

it("SET26 pre-aborted plans make no fetch and preserve a typed aborted outcome", async () => {
  const controller = new AbortController();
  controller.abort();
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const plans = createPricingClient().plans as (signal: AbortSignal) => ReturnType<ReturnType<typeof createPricingClient>["plans"]>;
  await expect(plans(controller.signal)).rejects.toMatchObject({ reason: "aborted" });
  expect(fetcher).not.toHaveBeenCalled();
});

it("SET26 a deadline discovered before delayed timer aborts and releases an available response body", async () => {
  let clock = 0;
  const time = vi.spyOn(performance, "now").mockImplementation(() => clock);
  const cancel = vi.fn().mockResolvedValue(undefined);
  let signal: AbortSignal | undefined;
  const fetcher = vi.fn().mockImplementation((_input, init?: RequestInit) => {
    signal = init?.signal ?? undefined;
    clock = 10_000;
    return Promise.resolve(new Response(new ReadableStream({ cancel }), { status: 200 }));
  });
  try {
    vi.stubGlobal("fetch", fetcher);
    await expect(createPricingClient().plans()).rejects.toMatchObject({ reason: "timeout" });
    expect(signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
  } finally { time.mockRestore(); }
});

it("SET26 unavailable early response releases body without attempting JSON", async () => {
  const cancel = vi.fn().mockResolvedValue(undefined);
  const response = new Response(new ReadableStream({ cancel }), { status: 503 });
  const json = vi.spyOn(response, "json");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  await expect(createPricingClient().plans()).rejects.toMatchObject({ reason: "not_configured" });
  expect(cancel).toHaveBeenCalledOnce();
  expect(json).not.toHaveBeenCalled();
});

it("SET26 late noncooperative fetch response is cancelled after the timeout settled", async () => {
  let finish!: (value: Response) => void;
  const cancel = vi.fn().mockResolvedValue(undefined);
  const response = new Response(new ReadableStream({ cancel }), { status: 200 });
  const json = vi.spyOn(response, "json");
  try {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; })));
    let failure: unknown;
    void createPricingClient().plans().catch((error) => { failure = error; });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(failure).toMatchObject({ reason: "timeout" });
    finish(response);
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledOnce();
    expect(json).not.toHaveBeenCalled();
    expect(failure).toMatchObject({ reason: "timeout" });
  } finally { vi.useRealTimers(); }
});

// SET26 real locked-body cleanup RED, not a synthetic response.json stub.
describe("SET26 actual stalled response stream cleanup", () => {
  it.each(["timeout", "parent-abort"])("%s cancels the owned real body reader and releases its lock", async (mode) => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"plans":')); },
      pull() { return new Promise<void>(() => {}); },
      cancel,
    });
    const response = new Response(stream, { status: 200 });
    const parent = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const fetcher = vi.fn().mockImplementation((_input: unknown, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      // A deliberately uncooperative fetch: its real Response ignores the signal.
      return Promise.resolve(response);
    });
    try {
      vi.useFakeTimers();
      vi.stubGlobal("fetch", fetcher);
      let failure: unknown;
      const pending = createPricingClient().plans(parent.signal).catch((error) => { failure = error; });
      await vi.advanceTimersByTimeAsync(0);
      expect(response.body?.locked).toBe(true);
      if (mode === "timeout") await vi.advanceTimersByTimeAsync(10_000);
      else { parent.abort(); await vi.advanceTimersByTimeAsync(0); }
      await pending;
      expect(failure).toMatchObject({ reason: mode === "timeout" ? "timeout" : "aborted" });
      expect(requestSignal?.aborted).toBe(true);
      expect(cancel).toHaveBeenCalledOnce();
      expect(response.body?.locked).toBe(false);
      expect(fetcher).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
});

it.each([true, false])("SET26 terminal schema valid=%s releases a real body lock", async (valid) => {
  const response = jsonResponse(200, valid ? { plans: [] } : { plans: [{ id: "incomplete" }] });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  if (valid) expect(await createPricingClient().plans()).toEqual({ plans: [] });
  else await expect(createPricingClient().plans()).rejects.toMatchObject({ reason: "parse" });
  expect(response.body?.locked).toBe(false);
});

it("SET26 headers and body share one absolute budget without a phase reset", async () => {
  let headers!: (value: Response) => void;
  const cancel = vi.fn().mockResolvedValue(undefined);
  const response = new Response(new ReadableStream({ pull: () => new Promise<void>(() => {}), cancel }));
  try {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise((resolve) => { headers = resolve; })));
    let failure: unknown = "pending";
    const pending = createPricingClient().plans().catch((error) => { failure = error; });
    await vi.advanceTimersByTimeAsync(6_000);
    headers(response);
    await vi.advanceTimersByTimeAsync(3_999);
    expect(failure).toBe("pending");
    expect(response.body?.locked).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(failure).toMatchObject({ reason: "timeout" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  } finally { vi.useRealTimers(); }
});

it("SET26 a noncooperative cancel promise does not delay timeout or lock release", async () => {
  const cancel = vi.fn().mockImplementation(() => new Promise<void>(() => {}));
  const response = new Response(new ReadableStream({ pull: () => new Promise<void>(() => {}), cancel }));
  try {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    let failure: unknown;
    const pending = createPricingClient().plans().catch((error) => { failure = error; });
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
    expect(failure).toMatchObject({ reason: "timeout" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  } finally { vi.useRealTimers(); }
});

it("SET26 keeps Response.json UTF8 replacement and leading BOM semantics", async () => {
  const prefix = new TextEncoder().encode('{"plans":[{"id":"p1","key":"k","name":"');
  const suffix = new TextEncoder().encode('","currency":"USD","amount_minor":"1","credit_micros":"1","billing_interval":"once"}]}');
  const response = new Response(new Uint8Array([0xef, 0xbb, 0xbf, ...prefix, 0xff, ...suffix]));
  const standard = await response.clone().json();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  expect(await createPricingClient().plans()).toEqual(standard);
  expect(response.body?.locked).toBe(false);
});
