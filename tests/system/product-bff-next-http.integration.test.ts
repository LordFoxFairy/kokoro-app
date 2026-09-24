import { spawn, type ChildProcess } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, request as httpRequest, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("fixture server did not bind");
  return address.port;
}

async function unusedPort(): Promise<number> {
  const server = createServer();
  const port = await listen(server);
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

function get(
  port: number,
  cookie?: string,
  target = "/api/session/sessions",
): Promise<{
  status: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: target,
        method: "GET",
        headers: { host: `localhost:${port}`, ...(cookie ? { cookie } : {}) },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.once("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: response.headers,
          }),
        );
      },
    );
    request.once("error", reject);
    request.end();
  });
}

describe("Product BFF real Next HTTP admission", () => {
  let child: ChildProcess;
  let root = "";
  let nextPort = 0;
  let bff: Server;
  let bffCalls = 0;
  const secret = "product-session-next-http-secret-32-bytes";

  beforeAll(async () => {
    const project = process.cwd();
    root = await mkdtemp(path.join(tmpdir(), "kokoro-product-bff-next-"));
    await cp(path.join(project, "src"), path.join(root, "src"), {
      recursive: true,
    });
    await cp(path.join(project, "public"), path.join(root, "public"), {
      recursive: true,
    });
    const cookieRoute = path.join(
      root,
      "src",
      "app",
      "api",
      "product-cookie-fixture",
      "route.ts",
    );
    await mkdir(path.dirname(cookieRoute), { recursive: true });
    await writeFile(
      cookieRoute,
      `import { productSessionCookie } from "@/lib/server/product-session"
export async function GET(): Promise<Response> {
  const now=Date.now(); const origin=process.env.KOKORO_WEB_ORIGIN!; const secret=process.env.KOKORO_WEB_AUTH_SECRET!
  const cookie=await productSessionCookie({ id:"123e4567-e89b-12d3-a456-426614174000", generation:0, access:"product-access", accessExpiresAt:now+60000, expiresAt:now+60000, subject:"user-1" }, secret, origin)
  return new Response(null,{status:204,headers:{"set-cookie":cookie}})
}`,
    );
    for (const file of [
      "package.json",
      "tsconfig.json",
      "next.config.ts",
      "next-env.d.ts",
      "postcss.config.mjs",
    ]) {
      await cp(path.join(project, file), path.join(root, file));
    }
    await symlink(
      path.join(project, "node_modules"),
      path.join(root, "node_modules"),
      "dir",
    );
    bff = createServer((_request, response) => {
      bffCalls += 1;
      response.writeHead(500);
      response.end();
    });
    const bffPort = await listen(bff);
    nextPort = await unusedPort();
    const deadRedisPort = await unusedPort();
    child = spawn(
      process.execPath,
      [
        path.join(project, "node_modules", "next", "dist", "bin", "next"),
        "dev",
        "--webpack",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(nextPort),
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          NODE_ENV: "test",
          KOKORO_BFF_BASE_URL: `http://127.0.0.1:${bffPort}`,
          KOKORO_DOMAIN: "localhost",
          KOKORO_WEB_ORIGIN: `http://localhost:${nextPort}`,
          KOKORO_WEB_AUTH_SECRET: secret,
          KOKORO_WEB_REDIS_URL: `redis://127.0.0.1:${deadRedisPort}/9`,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      try {
        if ((await get(nextPort)).status > 0) return;
      } catch {
        /* wait */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Next fixture did not become ready");
  }, 30_000);

  afterAll(async () => {
    if (child) await stop(child);
    if (bff) await new Promise<void>((resolve) => bff.close(() => resolve()));
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("returns 401 without a Product Session and never connects to BFF", async () => {
    const response = await get(nextPort);
    expect(response.status).toBe(401);
    expect(response.headers["cache-control"]).toBe("private, no-store, max-age=0");
    expect(bffCalls).toBe(0);
  });

  it("returns controlled 503 when online inspection is unavailable and never connects to BFF", async () => {
    const issued = await get(
      nextPort,
      undefined,
      "/api/product-cookie-fixture",
    );
    const rawCookie = Array.isArray(issued.headers["set-cookie"])
      ? issued.headers["set-cookie"][0]
      : issued.headers["set-cookie"];
    expect(rawCookie).toBeTruthy();
    const response = await get(nextPort, rawCookie!.split(";", 1)[0]);
    expect(response.status).toBe(503);
    expect(response.body).toContain("session_unavailable");
    expect(bffCalls).toBe(0);
  });
});
