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
  target = "/api/auth/session",
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
  let nativeSessionActive = true;
  const bffRequests: Array<{ method: string; url: string; headers: Record<string, string | string[] | undefined> }> = [];
  const publicSkillCalls: Array<{ url: string; headers: Record<string, string | string[] | undefined> }> = [];
  const fixtureSecret = "native-session-next-http-secret-32-bytes";

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
      `export async function GET(): Promise<Response> {
  return new Response(null,{status:204,headers:{"set-cookie":"kokoro-issuer.session_token=fixture-native-session; Path=/; HttpOnly; SameSite=Lax"}})
}`,
    );
    const rscPage = path.join(root, "src", "app", "product-rsc-fixture", "page.tsx");
    await mkdir(path.dirname(rscPage), { recursive: true });
    await writeFile(rscPage, `import { headers } from "next/headers"
import { nativeProductBffConfig } from "@/lib/server/product-bff"
import { readBrowserAuthSession } from "@/lib/server/browser-auth-session"
export const dynamic = "force-dynamic"
export default async function Page() {
  const incoming = await headers()
  const state = await readBrowserAuthSession(new Request(process.env.KOKORO_WEB_ORIGIN!, { headers: incoming }), nativeProductBffConfig()!, "rsc-fixture")
  return <output>{JSON.stringify(state)}</output>
}`);
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
    // A declared BFF HTTP peer, not an IAM/OAuth implementation or Web principal.
    bff = createServer((request, response) => {
      bffCalls += 1;
      bffRequests.push({ method: request.method ?? "", url: request.url ?? "", headers: request.headers });
      const id = String(request.headers["x-kokoro-request-id"] ?? request.headers["x-request-id"] ?? "fixture-request");
      const send = (status: number, body: unknown, extra: Record<string, string | string[]> = {}) => {
        const bytes = JSON.stringify(body);
        response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-request-id": id, "content-length": Buffer.byteLength(bytes), ...extra });
        response.end(bytes);
      };
      const authenticated = nativeSessionActive && /(?:^|; )kokoro-issuer\.session_token=fixture-native-(?:session|rolled)(?:;|$)/u.test(request.headers.cookie ?? "");
      if (["/browser/v1/auth/session?refresh=true", "/browser/v1/auth/session?refresh=false"].includes(request.url ?? "")) {
        send(200, { data: authenticated ? { authenticated: true, subject: "native-subject", tenant_id: "tenant", expires_at: "2030-01-01T00:00:00.000Z" } : { authenticated: false } }, authenticated && request.url?.endsWith("refresh=true") ? {
          "set-cookie": ["kokoro-issuer.session_token=fixture-native-rolled; Path=/; HttpOnly; Expires=Tue, 01 Jan 2030 00:00:00 GMT", "kokoro-issuer.session_data=; Path=/; HttpOnly; Max-Age=0"],
          "set-auth-jwt": "never-browser-visible",
        } : {});
        return;
      }
      if (request.method === "POST" && request.url === "/iam/sign-out") {
        nativeSessionActive = false;
        send(200, { success: true }, { "set-cookie": "kokoro-issuer.session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" });
        return;
      }
      if (request.url?.startsWith("/v1/skill.list") && request.headers.authorization === "Bearer external-native-token") {
        publicSkillCalls.push({ url: request.url, headers: request.headers });
        send(200, { ok: true, request_id: id, data: [] });
        return;
      }
      if (!authenticated) {
        const error = { code: "session_invalid", message: "session_invalid" };
        send(401, request.url === "/v1/account/profile" ? { error: { ...error, retryable: false } } : { error, meta: { request_id: id } });
        return;
      }
      if (request.url === "/v1/sessions") {
        send(200, { data: { sessions: [] }, meta: { request_id: id } });
        return;
      }
      send(404, { error: { code: "not_found", message: "not_found" }, meta: { request_id: id } });
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
          KOKORO_WEB_AUTH_SECRET: fixtureSecret,
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
        const ready = await get(nextPort);
        if (ready.status === 200 && ready.body === JSON.stringify({ data: { authenticated: false } })) {
          // Warm the existing copied Next process, within the original setup budget.
          const rsc = await get(nextPort, undefined, "/product-rsc-fixture");
          if (rsc.status === 200) return;
        }
      } catch {
        /* wait */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Next fixture did not reach strict anonymous status200 and read-only RSC");
  }, 30_000);

  afterAll(async () => {
    if (child) await stop(child);
    if (bff) {
      bff.closeAllConnections();
      await new Promise<void>((resolve) => bff.close(() => resolve()));
    }
    if (root) await rm(root, { recursive: true, force: true });
    if (child) expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    if (bff) expect(bff.listening).toBe(false);
    if (nextPort) await expect(get(nextPort)).rejects.toThrow();
  });

  it("name PATCH validates real raw JSON and Origin before its single BFF admission", async () => {
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
    expect(bffCalls).toBe(before + 1);
    expect(bffRequests.slice(before).map(entry => [entry.method, entry.url])).toEqual([["PATCH", "/v1/account/profile"]]);
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
    expect(bffCalls).toBe(before + 1)
    expect(bffRequests.slice(before).map(entry => [entry.method, entry.url])).toEqual([["DELETE", "/v1/team/members/member-1"]])
  }, 30_000)

  it("returns strict anonymous status200 and lets the BFF reject a private business request once", async () => {
    const before = bffCalls;
    const response = await get(nextPort);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ data: { authenticated: false } });
    expect(response.headers["cache-control"]).toContain("no-store");
    const privateRead = await get(nextPort, undefined, "/api/session/sessions");
    expect(privateRead.status).toBe(401);
    expect(privateRead.headers["cache-control"]).toContain("no-store");
    expect(bffRequests.slice(before).map(entry => entry.url)).toEqual(["/browser/v1/auth/session?refresh=true", "/v1/sessions"]);
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

  it("keeps rolling, read-only RSC, one business hop and native logout on the BFF boundary without Redis", async () => {
    const issued = await get(
      nextPort,
      undefined,
      "/api/product-cookie-fixture",
    );
    const rawCookie = Array.isArray(issued.headers["set-cookie"])
      ? issued.headers["set-cookie"][0]
      : issued.headers["set-cookie"];
    expect(rawCookie).toBeTruthy();
    const cookie = rawCookie!.split(";", 1)[0];
    const before = bffCalls;
    const response = await get(nextPort, cookie);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ data: { authenticated: true, subject: "native-subject", tenant_id: "tenant", expires_at: "2030-01-01T00:00:00.000Z" } });
    expect(response.headers["set-cookie"]).toEqual([
      "kokoro-issuer.session_token=fixture-native-rolled; Path=/; HttpOnly; Expires=Tue, 01 Jan 2030 00:00:00 GMT",
      "kokoro-issuer.session_data=; Path=/; HttpOnly; Max-Age=0",
    ]);
    expect(response.headers["set-auth-jwt"]).toBeUndefined();
    const readOnly = await get(nextPort, cookie, "/product-rsc-fixture");
    expect(readOnly.status).toBe(200);
    expect(readOnly.body).toContain("native-subject");
    expect(readOnly.headers["set-cookie"]).toBeUndefined();
    const business = await get(nextPort, cookie, "/api/session/sessions");
    expect(business.status).toBe(200);
    expect(JSON.parse(business.body)).toEqual({ sessions: [] });
    expect(bffRequests.slice(before).map(entry => entry.url)).toEqual([
      "/browser/v1/auth/session?refresh=true", "/browser/v1/auth/session?refresh=false", "/v1/sessions",
    ]);
    for (const entry of bffRequests.slice(before)) {
      expect(entry.headers.cookie).toBe(cookie);
      expect(entry.headers.origin).toBe(`http://localhost:${nextPort}`);
      expect(entry.headers.authorization).toBeUndefined();
    }
    const loggedOut = await new Promise<{ status: number; cookies: string[] | undefined }>((resolve, reject) => {
      const request = httpRequest({ hostname: "127.0.0.1", port: nextPort, path: "/iam/sign-out", method: "POST", headers: {
        host: `localhost:${nextPort}`, origin: `http://localhost:${nextPort}`, cookie, "content-length": "0",
      } }, result => { result.resume(); result.once("end", () => resolve({ status: result.statusCode ?? 0, cookies: result.headers["set-cookie"] })); });
      request.once("error", reject); request.end();
    });
    expect(loggedOut.status).toBe(200);
    expect(loggedOut.cookies).toEqual(["kokoro-issuer.session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"]);
    const retired = await get(nextPort, cookie);
    expect(retired.status).toBe(200);
    expect(JSON.parse(retired.body)).toEqual({ data: { authenticated: false } });
    const rejected = await get(nextPort, cookie, "/api/session/sessions");
    expect(rejected.status).toBe(401);
    expect(bffRequests.slice(before + 3).map(entry => entry.url)).toEqual([
      "/iam/sign-out", "/browser/v1/auth/session?refresh=true", "/v1/sessions",
    ]);
  });
  it("admits the external bearer only through the exact public Skill list Next HTTP entry, without a native session",async()=>{
    const call=(target:string)=>new Promise<{status:number;body:string;headers:Record<string,string|string[]|undefined>}>((resolve,reject)=>{
      const request=httpRequest({hostname:"127.0.0.1",port:nextPort,path:target,method:"GET",headers:{
        host:`localhost:${nextPort}`,authorization:"Bearer external-native-token",cookie:"untrusted-cookie=value",
        "x-kokoro-service":"forged-service","x-kokoro-internal-secret":"forged-secret","x-kokoro-tenant-id":"forged-tenant",forwarded:"host=foreign.invalid",
      }},response=>{const chunks:Buffer[]=[];response.on("data",chunk=>chunks.push(Buffer.from(chunk)));response.on("end",()=>resolve({status:response.statusCode??0,body:Buffer.concat(chunks).toString("utf8"),headers:response.headers}))});request.on("error",reject);request.end()
    })
    const before=bffCalls
    const hub=await call("/api/hub/skill.list")
    expect(hub.status).toBe(401);expect(bffCalls).toBe(before + 1)
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
