// Browser-only Team Product transport; generated operations remain the sole public URL graph.
import { createClient } from "@/generated/bff-team/client/client.gen";
import {
  cancelTeamInvitation,
  createTeamInvitation,
  leaveTeam,
  listTeamInvitations,
  listTeamMembers,
  listTeamRoles,
  removeTeamMember,
  replaceTeamMemberRoles,
  resendTeamInvitation,
} from "@/generated/bff-team/sdk.gen";
import type {
  TeamInvitation,
  TeamMember,
  TeamRole,
} from "@/generated/bff-team/types.gen";
import { parseTeamJson } from "./json";
import {
  teamCreateInvitationRequestSchema,
  teamReplaceRolesRequestSchema,
  teamErrorResponseSchema,
  teamErrorStatuses,
  teamResponseSchema,
  teamSessionProjectionSchema,
} from "./schema";
export type {
  TeamInvitation,
  TeamMember,
  TeamRole,
} from "@/generated/bff-team/types.gen";
export type TeamPage<T> = Readonly<{
  items: T[];
  nextCursor: string | null;
  requestId: string;
}>;
export type TeamReadOptions = Readonly<{
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
}>;
export class TeamClientError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly status: number | null,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = "TeamClientError";
  }
}
type Result = { data?: unknown; error?: unknown; response?: Response };
export type TeamClient = Readonly<{
  currentUserId: (signal?: AbortSignal) => Promise<string>;
  listMembers: (options?: TeamReadOptions) => Promise<TeamPage<TeamMember>>;
  listInvitations: (
    options?: TeamReadOptions,
  ) => Promise<TeamPage<TeamInvitation>>;
  listRoles: (options?: TeamReadOptions) => Promise<TeamPage<TeamRole>>;
  createInvitation: (
    email: string,
    roles: string[],
    signal?: AbortSignal,
  ) => Promise<void>;
  resendInvitation: (id: string, signal?: AbortSignal) => Promise<void>;
  cancelInvitation: (id: string, signal?: AbortSignal) => Promise<void>;
  replaceMemberRoles: (
    id: string,
    roles: string[],
    signal?: AbortSignal,
  ) => Promise<void>;
  removeMember: (id: string, signal?: AbortSignal) => Promise<void>;
  leave: (expectedMemberId?: string, signal?: AbortSignal) => Promise<void>;
}>;

export function createTeamClient(): TeamClient {
  const origin = window.location.origin;
  async function call<T>(
    signal: AbortSignal | undefined,
    dispatch: (
      client: ReturnType<typeof createClient>,
      signal: AbortSignal,
    ) => Promise<unknown>,
    expected?: { id: string; roles?: readonly string[] },
    session = false,
  ): Promise<T> {
    const deadline = performance.now() + 10_000;
    const controller = new AbortController();
    let retired = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let upstream: Response | undefined;
    let reject!: (error: unknown) => void;
    const cancellation = new Promise<never>((_, fail) => {
      reject = fail;
    });
    const bad = () =>
      new TeamClientError(
        "Invalid Team response",
        "bff_bad_response",
        upstream?.status ?? null,
        null,
      );
    const stop = () => {
      controller.abort();
      void reader?.cancel().catch(() => undefined);
      if (upstream?.body && !upstream.body.locked)
        void upstream.body.cancel().catch(() => undefined);
    };
    const abort = () => {
      stop();
      reject(
        new TeamClientError(
          "Team request retired",
          "team_network_error",
          null,
          null,
        ),
      );
    };
    const timer = setTimeout(abort, 10_000);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const check = () => {
      if (retired || controller.signal.aborted || performance.now() >= deadline)
        throw new TeamClientError(
          "Team request retired",
          "team_network_error",
          null,
          null,
        );
    };
    const transport: typeof fetch = async (input, init) => {
      check();
      const generated =
        input instanceof Request ? input : new Request(input, init);
      const url = new URL(generated.url);
      if (
        url.origin !== origin ||
        (!session && !url.pathname.startsWith("/v1/team/"))
      )
        throw bad();
      const path = url.pathname.slice("/v1/team/".length);
      const target = session ? url : new URL(`/api/team/${path}`, origin);
      target.search = url.search;
      const body =
        generated.body === null ? undefined : await generated.arrayBuffer();
      check();
      upstream = await fetch(
        new Request(target, {
          method: generated.method,
          headers: generated.headers,
          ...(body === undefined ? {} : { body }),
          signal: controller.signal,
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
        }),
      );
      if (retired || controller.signal.aborted) {
        stop();
        check();
      }
      check();
      if (
        !/^application\/json(?:\s*;|$)/iu.test(
          upstream.headers.get("content-type") ?? "",
        ) ||
        !/(?:^|,)\s*no-store\s*(?:,|$)/iu.test(
          upstream.headers.get("cache-control") ?? "",
        ) ||
        upstream.headers.has("location") ||
        upstream.headers.has("set-cookie")
      )
        throw bad();
      if (!session && generated.method === "GET" && upstream.status === 409)
        throw bad();
      const retry = upstream.headers.get("retry-after");
      if (
        retry !== null &&
        (upstream.status !== 429 || !/^[1-9][0-9]{0,4}$/u.test(retry))
      )
        throw bad();
      let bytes = 0;
      upstream.headers.forEach((value, key) => {
        bytes += new TextEncoder().encode(`${key}: ${value}\r\n`).byteLength;
      });
      if (bytes > 2 * 1024 * 1024) throw bad();
      let text = "";
      const decoder = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      });
      if (upstream.body) {
        reader = upstream.body.getReader();
        try {
          for (;;) {
            const part = await reader.read();
            check();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > 2 * 1024 * 1024) throw bad();
            text += decoder.decode(part.value, { stream: true });
          }
          text += decoder.decode();
        } catch {
          check();
          throw bad();
        } finally {
          void reader.cancel().catch(() => undefined);
          reader.releaseLock();
          reader = undefined;
        }
      }
      check();
      let raw: unknown;
      try {
        raw = parseTeamJson(text);
      } catch {
        throw bad();
      }
      if (session) {
        const value = teamSessionProjectionSchema.safeParse(raw);
        if (
          upstream.status !== 200 ||
          !value.success ||
          value.data.expires_at <= Date.now()
        )
          throw bad();
      } else {
        const value =
          upstream.status === 200
            ? teamResponseSchema(generated.method, path).safeParse(raw)
            : teamErrorStatuses.has(upstream.status)
              ? teamErrorResponseSchema.safeParse(raw)
              : null;
        if (
          !value?.success ||
          (value.data as { meta: { request_id: string } }).meta.request_id !==
            upstream.headers.get("x-request-id")
        )
          throw bad();
        if (upstream.status === 200 && expected) {
          const data = (
            value.data as {
              data: {
                invitation_id?: string;
                member_id?: string;
                roles?: string[];
              };
            }
          ).data;
          if ((data.invitation_id ?? data.member_id) !== expected.id)
            throw bad();
          if (
            expected.roles &&
            (!data.roles ||
              data.roles.length !== expected.roles.length ||
              new Set(data.roles).size !== data.roles.length ||
              !data.roles.every((role) => expected.roles!.includes(role)))
          )
            throw bad();
        }
        if (upstream.status !== 200) {
          const error = teamErrorResponseSchema.parse(raw);
          raw = {
            ...error,
            error: { code: error.error.code, message: error.error.code },
          };
        }
      }
      return Response.json(raw, {
        status: upstream.status,
        headers: upstream.headers,
      });
    };
    const client = createClient({
      baseUrl: origin,
      fetch: transport,
      responseStyle: "fields",
      throwOnError: false,
    });
    try {
      const operation = async () => {
        const outcome = (await dispatch(client, controller.signal)) as Result;
        check();
        if (outcome.error !== undefined) {
          if (outcome.error instanceof TeamClientError) throw outcome.error;
          const error = teamErrorResponseSchema.safeParse(outcome.error);
          if (error.success)
            throw new TeamClientError(
              error.data.error.code,
              error.data.error.code,
              outcome.response?.status ?? null,
              error.data.meta.request_id,
            );
          throw bad();
        }
        if (!outcome.response || outcome.response.status !== 200) throw bad();
        return outcome.data as T;
      };
      return await Promise.race([cancellation, operation()]);
    } catch (error) {
      if (error instanceof TeamClientError) throw error;
      throw new TeamClientError(
        "Team request unavailable",
        "team_network_error",
        null,
        null,
      );
    } finally {
      retired = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      stop();
    }
  }
  const query = (options?: TeamReadOptions) => ({
    ...(options?.limit === undefined ? {} : { limit: options.limit }),
    ...(options?.cursor === undefined ? {} : { cursor: options.cursor }),
  });
  const page = async <T>(
    value: Promise<{
      data: T[];
      meta: { next_cursor: string | null; request_id: string };
    }>,
  ): Promise<TeamPage<T>> => {
    const result = await value;
    return {
      items: result.data,
      nextCursor: result.meta.next_cursor,
      requestId: result.meta.request_id,
    };
  };
  return {
    currentUserId: async (signal) => {
      const result = await call<{
        authenticated: true;
        subject: string;
        expires_at: number;
      }>(
        signal,
        (client, signal) => client.get({ url: "/api/auth/session", signal }),
        undefined,
        true,
      );
      return result.subject;
    },
    listMembers: (options) =>
      page(
        call(options?.signal, (client, signal) =>
          listTeamMembers({ client, query: query(options), signal }),
        ),
      ),
    listInvitations: (options) =>
      page(
        call(options?.signal, (client, signal) =>
          listTeamInvitations({ client, query: query(options), signal }),
        ),
      ),
    listRoles: (options) =>
      page(
        call(options?.signal, (client, signal) =>
          listTeamRoles({ client, query: query(options), signal }),
        ),
      ),
    createInvitation: async (email, roles, signal) => {
      const body = teamCreateInvitationRequestSchema.parse({ email, roles });
      await call(signal, (client, signal) =>
        createTeamInvitation({ client, body, signal }),
      );
    },
    resendInvitation: async (id, signal) => {
      await call(
        signal,
        (client, signal) =>
          resendTeamInvitation({ client, path: { invitation_id: id }, signal }),
        { id },
      );
    },
    cancelInvitation: async (id, signal) => {
      await call(
        signal,
        (client, signal) =>
          cancelTeamInvitation({ client, path: { invitation_id: id }, signal }),
        { id },
      );
    },
    removeMember: async (id, signal) => {
      await call(
        signal,
        (client, signal) =>
          removeTeamMember({ client, path: { member_id: id }, signal }),
        { id },
      );
    },
    replaceMemberRoles: async (id, roles, signal) => {
      const body = teamReplaceRolesRequestSchema.parse({ roles });
      await call(
        signal,
        (client, signal) =>
          replaceTeamMemberRoles({
            client,
            path: { member_id: id },
            body,
            signal,
          }),
        { id, roles },
      );
    },
    leave: async (id, signal) => {
      if (!id)
        throw new TeamClientError(
          "Missing actor",
          "invalid_team_actor",
          null,
          null,
        );
      await call(signal, (client, signal) => leaveTeam({ client, signal }), {
        id,
      });
    },
  };
}
