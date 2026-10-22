import { nextFixtureEnvironment } from "./fixtures/next-fixture-environment"
import { spawn, type ChildProcess } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
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

async function linkFixtureDependencies(
  project: string,
  root: string,
): Promise<void> {
  const installed = path.join(project, "node_modules");
  const destination = path.join(root, "node_modules");
  await mkdir(destination);
  for (const entry of await readdir(installed, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const source = path.join(installed, entry.name);
    const target = path.join(destination, entry.name);
    if (entry.name.startsWith("@")) {
      await mkdir(target);
      for (const scoped of await readdir(source)) {
        if (scoped.startsWith(".")) continue;
        await symlink(
          await realpath(path.join(source, scoped)),
          path.join(target, scoped),
          "dir",
        );
      }
    } else {
      await symlink(await realpath(source), target, "dir");
    }
  }
  const nextPackage = await realpath(path.join(installed, "next"));
  const helpers = await realpath(
    path.join(path.dirname(nextPackage), "@swc/helpers"),
  );
  await mkdir(path.join(destination, "@swc"), { recursive: true });
  await symlink(helpers, path.join(destination, "@swc/helpers"), "dir");
}

describe("Product BFF real Next HTTP admission", () => {
  let child: ChildProcess;
  let root = "";
  let nextPort = 0;
  let bff: Server;
  let bffCalls = 0;
  const publicSkillCalls: Array<{ url: string; headers: Record<string, string | string[] | undefined> }> = [];
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
    await linkFixtureDependencies(project, root);
    bff = createServer((_request, response) => {
      bffCalls += 1;
      if (_request.url?.startsWith("/v1/skill.list")) {
        publicSkillCalls.push({url:_request.url,headers:_request.headers});
        const id=String(_request.headers["x-kokoro-request-id"]);
        const body=JSON.stringify({ok:true,request_id:id,data:[]});
        response.writeHead(200,{"content-type":"application/json","cache-control":"no-store","x-request-id":id,"content-length":Buffer.byteLength(body)});
        response.end(body);return;
      }
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
        env: await nextFixtureEnvironment(root, {
          ...process.env,
          NODE_ENV: "test",
          KOKORO_BFF_BASE_URL: `http://127.0.0.1:${bffPort}`,
          KOKORO_DOMAIN: "localhost",
          KOKORO_INTERNAL_SECRET_WEB_BFF: "public-skill-next-service-secret",
          KOKORO_WEB_ORIGIN: `http://localhost:${nextPort}`,
          KOKORO_WEB_AUTH_SECRET: secret,
          KOKORO_WEB_REDIS_URL: `redis://127.0.0.1:${deadRedisPort}/9`,
        }),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout?.on("data", () => undefined);
    child.stderr?.on("data", () => undefined);
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      try {
        if ((await get(nextPort)).status === 401) return;
      } catch {
        /* wait */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Next fixture did not reach anonymous session 401");
  }, 30_000);

  afterAll(async () => {
    if (child) await stop(child);
    if (bff) await new Promise<void>((resolve) => bff.close(() => resolve()));
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("name PATCH uses real Next raw body and canonical Origin before any BFF call", async () => {
    const patch = (body: string, origin = `http://localhost:${nextPort}`) =>
      new Promise<{
        status: number;
        headers: Record<string, string | string[] | undefined>;
        body: string;
      }>((resolve, reject) => {
        const request = httpRequest(
          {
            hostname: "127.0.0.1",
            port: nextPort,
            path: "/api/account/profile",
            method: "PATCH",
            headers: {
              host: `localhost:${nextPort}`,
              origin,
              "content-type": "application/json",
            },
          },
          (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (chunk: Buffer) => chunks.push(chunk));
            response.once("end", () =>
              resolve({
                status: response.statusCode ?? 0,
                headers: response.headers,
                body: Buffer.concat(chunks).toString("utf8"),
              }),
            );
          },
        );
        request.once("error", reject);
        request.end(body);
      });
    const before = bffCalls;
    const anonymous = await patch(
      JSON.stringify({ name: "New", expected_name: "\ud800 Original " }),
    );
    expect(anonymous.status).toBe(401);
    expect(JSON.parse(anonymous.body)).toMatchObject({
      error: { code: "session_invalid" },
    });
    expect(anonymous.headers["cache-control"]).toContain("no-store");
    expect(anonymous.headers["x-request-id"]).toBeTruthy();
    const duplicate = await patch(
      '{"name":"A","name":"B","expected_name":"Old"}',
    );
    expect(duplicate.status).toBe(400);
    const foreign = await patch(
      JSON.stringify({ name: "New", expected_name: "Old" }),
      `https://localhost:${nextPort}`,
    );
    expect(foreign.status).toBe(403);
    expect(bffCalls).toBe(before);
  }, 30_000);

  it("Team mutation uses real Next EOF and exact explicit Origin before owner admission", async () => {
    const remove = (origin: string | undefined, body?: string) => new Promise<{ status: number; headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
      const request = httpRequest({ hostname: "127.0.0.1", port: nextPort, path: "/api/team/members/member-1", method: "DELETE", headers: {
        host: `localhost:${nextPort}`, ...(origin === undefined ? {} : { origin }), ...(body === undefined ? {} : { "content-length": Buffer.byteLength(body) }),
      } }, (response) => {
        response.resume()
        response.once("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers }))
      })
      request.once("error", reject)
      request.end(body)
    })
    const before = bffCalls
    const eof = await remove(`http://localhost:${nextPort}`)
    expect(eof.status).toBe(401)
    expect(eof.headers["cache-control"]).toContain("no-store")
    expect(eof.headers["x-request-id"]).toBeTruthy()
    const missing = await remove(undefined)
    expect(missing.status).toBe(403)
    const scheme = await remove(`https://localhost:${nextPort}`)
    expect(scheme.status).toBe(403)
    const nonempty = await remove(`http://localhost:${nextPort}`, "x")
    expect(nonempty.status).toBe(400)
    expect(bffCalls).toBe(before)
  }, 30_000)

  it("returns 401 without a Product Session and never connects to BFF", async () => {
    const response = await get(nextPort);
    expect(response.status).toBe(401);
    expect(response.headers["cache-control"]).toBe("private, no-store, max-age=0");
    expect(bffCalls).toBe(0);
  });

  it("sets no-referrer only for the exact personal content GET at the real Next HTTP boundary", async () => {
    const personal = await get(nextPort, undefined, "/api/hub/library/files/asset-1/content");
    const encodedAsset = await get(nextPort, undefined, `/api/hub/library/files/asset%3A${"a".repeat(64)}/content`);
    const ordinary = await get(nextPort, undefined, "/api/hub/library?kind=file");
    const queried = await get(nextPort, undefined, "/api/hub/library/files/asset-1/content?download=1");
    const aliased = await get(nextPort, undefined, "/api/hub/self/library/files/asset-1/content");
    const encodedSlash = await get(nextPort, undefined, "/api/hub/library/files/asset%2Fprivate/content");
    const doubleEncoded = await get(nextPort, undefined, `/api/hub/library/files/asset%253A${"a".repeat(64)}/content`);
    const artifact = await get(nextPort, undefined, "/api/hub/library/artifacts/conversation-1/artifact-1/content");
    const encodedArtifact = await get(nextPort, undefined, `/api/hub/library/artifacts/conversation-1/artifact%3A${"a".repeat(64)}/content`);
    const encodedBothIds = await get(nextPort, undefined, `/api/hub/library/artifacts/conversation%3Aone/artifact%3A${"a".repeat(64)}/content`);
    const artifactQuery = await get(nextPort, undefined, "/api/hub/library/artifacts/conversation-1/artifact-1/content?download=1");
    const encodedArtifactQuery = await get(nextPort, undefined, `/api/hub/library/artifacts/conversation-1/artifact%3A${"a".repeat(64)}/content?download=1`);
    const artifactAlias = await get(nextPort, undefined, "/api/hub/self/library/artifacts/conversation-1/artifact-1/content");
    const encodedArtifactSlash = await get(nextPort, undefined, "/api/hub/library/artifacts/conversation-1/artifact%2Fprivate/content");
    const doubleEncodedArtifact = await get(nextPort, undefined, `/api/hub/library/artifacts/conversation-1/artifact%253A${"a".repeat(64)}/content`);
    expect(personal.headers["referrer-policy"]).toBe("no-referrer");
    expect(encodedAsset.headers["referrer-policy"]).toBe("no-referrer");
    expect(ordinary.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(queried.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(aliased.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(encodedSlash.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(doubleEncoded.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(artifact.headers["referrer-policy"]).toBe("no-referrer");
    expect(encodedArtifact.headers["referrer-policy"]).toBe("no-referrer");
    expect(encodedBothIds.headers["referrer-policy"]).toBe("no-referrer");
    expect(artifactQuery.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(encodedArtifactQuery.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(artifactAlias.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(encodedArtifactSlash.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(doubleEncodedArtifact.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
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
  it("admits the external bearer only through the exact public Skill list Next HTTP entry, without a Product Session",async()=>{
    const call=(target:string)=>new Promise<{status:number;body:string;headers:Record<string,string|string[]|undefined>}>((resolve,reject)=>{
      const request=httpRequest({hostname:"127.0.0.1",port:nextPort,path:target,method:"GET",headers:{
        host:`localhost:${nextPort}`,authorization:"Bearer external-native-token",cookie:"untrusted-cookie=value",
        "x-kokoro-service":"forged-service","x-kokoro-internal-secret":"forged-secret","x-kokoro-tenant-id":"forged-tenant",forwarded:"host=foreign.invalid",
      }},response=>{const chunks:Buffer[]=[];response.on("data",chunk=>chunks.push(Buffer.from(chunk)));response.on("end",()=>resolve({status:response.statusCode??0,body:Buffer.concat(chunks).toString("utf8"),headers:response.headers}))});request.on("error",reject);request.end()
    })
    const before=bffCalls
    const hub=await call("/api/hub/skill.list")
    expect(hub.status).toBe(401);expect(bffCalls).toBe(before)
    const publicList=await call("/v1/skill.list?project_id=project-1")
    expect(publicList.status).toBe(200)
    expect(JSON.parse(publicList.body)).toMatchObject({ok:true,data:[]})
    expect(publicList.headers["cache-control"]).toContain("no-store")
    expect(publicList.headers["set-cookie"]).toBeUndefined()
    const forwarded=publicSkillCalls.at(-1)!
    expect(forwarded.url).toBe("/v1/skill.list?project_id=project-1")
    expect(forwarded.headers.authorization).toBe("Bearer external-native-token")
    expect(forwarded.headers["x-kokoro-service"]).toBe("web-bff")
    expect(forwarded.headers["x-kokoro-internal-secret"]).toBe("public-skill-next-service-secret")
    expect(forwarded.headers.forwarded).toBe("host=localhost")
    expect(forwarded.headers["x-kokoro-tenant-id"]).toBeUndefined()
    expect(forwarded.headers.cookie).toBeUndefined()
  },30_000)

});

// Separate from the original dead-Redis failclosed fixture: Root alone runs this
// stored Product-session protocol fixture against its isolated test Redis.
describe("SET21 stored Product session real Next HTTP", () => {
  let root: string,
    child: ChildProcess,
    bff: Server,
    nextPort: number,
    origin: string,
    cookie: string;
  let badAck = false;
  const sessionId = crypto.randomUUID(),
    secret = "set21-owned-next-session-fixture-secret-32";
  const redisUrl = process.env.KOKORO_TEST_REDIS_URL;
  const calls: string[] = [];
  beforeAll(async () => {
    if (!redisUrl)
      throw Error("KOKORO_TEST_REDIS_URL required for stored-session fixture");
    const project = process.cwd();
    root = await mkdtemp(path.join(tmpdir(), "kokoro-shared-tasks-next-"));
    await cp(path.join(project, "src"), path.join(root, "src"), {
      recursive: true,
    });
    await cp(path.join(project, "public"), path.join(root, "public"), {
      recursive: true,
    });
    for (const file of [
      "package.json",
      "tsconfig.json",
      "next.config.ts",
      "next-env.d.ts",
      "postcss.config.mjs",
    ])
      await cp(path.join(project, file), path.join(root, file));
    await linkFixtureDependencies(project, root);
    const fixture = path.join(
      root,
      "src/app/api/set21-owned-session-fixture/route.ts",
    );
    await mkdir(path.dirname(fixture), { recursive: true });
    await writeFile(
      fixture,
      `import { createSession } from "@/lib/server/product-session-store"
import { productSessionCookie } from "@/lib/server/product-session"
export async function GET(){const config={redisUrl:process.env.KOKORO_WEB_REDIS_URL!,webOrigin:process.env.KOKORO_WEB_ORIGIN!,secret:process.env.KOKORO_WEB_AUTH_SECRET!};const now=Date.now();const candidate=await createSession(config,"fixture-refresh",{id:process.env.SET21_OWNED_SESSION_ID!,expiresAt:now+600000});const cookie=await productSessionCookie({id:candidate.id,generation:0,subject:"fixture-subject",access:"fixture-access",accessExpiresAt:now+600000,expiresAt:candidate.expiresAt},config.secret,config.webOrigin);return new Response(null,{status:204,headers:{"set-cookie":cookie}})}`,
    );
    bff = createServer((request, response) => {
      calls.push(request.url ?? "");
      const requestId = request.headers["x-kokoro-request-id"];
      response.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-request-id": String(requestId),
      });
      response.end(
        JSON.stringify(
          request.url?.startsWith("/v1/account/shared-tasks")
            ? {
                data: {
                  items: [
                    {
                      session_id: "opaque:old",
                      title: "Real owner fixture",
                      shared_at: "2026-10-15T00:00:00.000Z",
                      expires_at: null,
                    },
                  ],
                  next_cursor: null,
                },
              }
            : badAck
              ? { data: { ok: true }, meta: { request_id: requestId } }
              : {
                  data: { share_id: "shr_fixture" },
                  meta: { request_id: requestId },
                },
        ),
      );
    });
    const bffPort = await listen(bff);
    nextPort = await unusedPort();
    origin = `http://localhost:${nextPort}`;
    child = spawn(
      process.execPath,
      [
        path.join(project, "node_modules/next/dist/bin/next"),
        "dev",
        "--webpack",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(nextPort),
      ],
      {
        cwd: root,
        env: await nextFixtureEnvironment(root, {
          ...process.env,
          NODE_ENV: "test",
          KOKORO_BFF_BASE_URL: `http://127.0.0.1:${bffPort}`,
          KOKORO_DOMAIN: "localhost",
          KOKORO_WEB_ORIGIN: origin,
          NEXTAUTH_URL: `${origin}/api/auth`,
          KOKORO_WEB_AUTH_SECRET: secret,
          KOKORO_INTERNAL_SECRET_WEB_BFF: "fixture-internal",
          KOKORO_WEB_REDIS_URL: redisUrl,
          KOKORO_OIDC_CLIENT_ID: "fixture-product",
          KOKORO_OIDC_CLIENT_SECRET: "fixture-client-secret",
          KOKORO_TENANT_ID: "fixture-tenant",
          SET21_OWNED_SESSION_ID: sessionId,
        }),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout?.on("data", () => undefined);
    child.stderr?.on("data", () => undefined);
    const deadline = Date.now() + 45000;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        if (
          (
            await get(
              nextPort,
              undefined,
              "/api/account/shared-tasks?limit=100",
            )
          ).status === 401
        ) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!ready) throw Error("strict shared-tasks401 readiness missing");
    const issued = await get(
      nextPort,
      undefined,
      "/api/set21-owned-session-fixture",
    );
    expect(issued.status).toBe(204);
    const raw = issued.headers["set-cookie"];
    if (!Array.isArray(raw) || !raw[0]) throw Error("fixture cookie missing");
    cookie = raw[0].split(";", 1)[0]!;
  }, 60000);
  afterAll(async () => {
    if (child) await stop(child);
    if (bff) await new Promise<void>((resolve) => bff.close(() => resolve()));
    if (origin && redisUrl) {
      const { createClient } = await import("redis");
      const { createHash } = await import("node:crypto");
      const redis = createClient({
        url: redisUrl,
        socket: { reconnectStrategy: false, connectTimeout: 1000 },
      });
      redis.on("error", () => undefined);
      try {
        await redis.connect();
        const key = `kokoro:web:product-session:${createHash("sha256").update(origin).digest("hex")}:${sessionId}`;
        await redis.del([key, `${key}:tombstone`]);
        expect(await redis.exists(key)).toBe(0);
        expect(await redis.exists(`${key}:tombstone`)).toBe(0);
      } finally {
        redis.destroy();
      }
    }
    if (root) await rm(root, { recursive: true, force: true });
  }, 15000);
  const write = (method: "POST" | "DELETE") =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port: nextPort,
          path: "/api/session/sessions/opaque%3Aold/share",
          method,
          headers: {
            host: `localhost:${nextPort}`,
            origin,
            cookie,
            "idempotency-key": `session-mutation:${crypto.randomUUID()}`,
            ...(method === "POST"
              ? { "content-type": "application/json" }
              : {}),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.once("end", () =>
            resolve({
              status: response.statusCode ?? 0,
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        },
      );
      req.once("error", reject);
      req.end(method === "POST" ? "{}" : undefined);
    });
  it("real Next GET returns safe four-field list and POST/EOF DELETE unwrap formal share ACK", async () => {
    const page = await get(
      nextPort,
      cookie,
      "/api/account/shared-tasks?limit=100",
    );
    expect(page.status).toBe(200);
    expect(JSON.parse(page.body)).toEqual({
      data: {
        items: [
          {
            session_id: "opaque:old",
            title: "Real owner fixture",
            shared_at: "2026-10-15T00:00:00.000Z",
            expires_at: null,
          },
        ],
        next_cursor: null,
      },
    });
    for (const method of ["POST", "DELETE"] as const) {
      const response = await write(method);
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ share_id: "shr_fixture" });
    }
    expect(calls).toContain("/v1/account/shared-tasks?limit=100");
  }, 30000);
  it("real Next rejects owner legacy ok:true ACK instead of reporting success", async () => {
    badAck = true;
    try {
      const response = await write("DELETE");
      expect(response.status).toBe(502);
    } finally {
      badAck = false;
    }
  }, 30000);
});
