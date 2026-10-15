import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("redis", () => ({ createClient }));

import { inspectSession } from "@/lib/server/product-session-store";

const config = {
  redisUrl: "redis://127.0.0.1:6379/9",
  webOrigin: "http://product-session-singleflight.fixture",
  secret: "product-session-singleflight-test-key-at-least-32-bytes",
};

beforeEach(() => {
  createClient.mockReset();
});

describe("Product Session inspection", () => {
  it("coalesces simultaneous inspections of one session generation", async () => {
    let release: ((value: number) => void) | undefined;
    const evaluation = new Promise<number>((resolve) => {
      release = resolve;
    });
    const client = {
      on: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      eval: vi.fn().mockReturnValue(evaluation),
      destroy: vi.fn(),
    };
    createClient.mockReturnValue(client);

    const first = inspectSession(
      config,
      "11111111-1111-4111-8111-111111111111",
      0,
    );
    const second = inspectSession(
      config,
      "11111111-1111-4111-8111-111111111111",
      0,
    );

    expect(createClient).toHaveBeenCalledTimes(1);
    release?.(1);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });
});
