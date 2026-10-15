import { z } from "zod";

const fieldsSchema = z
  .object({
    nickname: z.string(),
    occupation: z.string(),
    about: z.string(),
    instructions: z.string(),
  })
  .strict();

const snapshotSchema = z
  .object({
    personalization: fieldsSchema.nullable(),
    revision: z.number().int().nonnegative(),
  })
  .strict();

const responseSchema = z.object({ data: snapshotSchema }).strict();
const saveResponseSchema = z
  .object({
    data: snapshotSchema.refine(
      (snapshot) => snapshot.personalization !== null && snapshot.revision > 0,
    ),
  })
  .strict();
const errorSchema = z
  .object({
    error: z.object({ code: z.string(), message: z.string() }).passthrough(),
  })
  .passthrough();

export type PersonalizationFields = z.infer<typeof fieldsSchema>;
export type PersonalizationSnapshot = z.infer<typeof snapshotSchema>;

export class PersonalizationClientError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "PersonalizationClientError";
    this.status = status;
    this.code = code;
  }
}

const endpoint = "/api/hub/preferences/personalization";

// Settings panels intentionally unmount when users switch sections. Keep a
// per-subject snapshot for the lifetime of the browser document so returning
// to Personalization does not flash an empty, disabled form before issuing the
// same private read again. The cache is never shared across subjects.
const snapshots = new Map<string, PersonalizationSnapshot>();
const reads = new Map<string, Promise<PersonalizationSnapshot>>();

async function parseError(
  response: Response,
): Promise<PersonalizationClientError> {
  const parsed = errorSchema.safeParse(await response.json().catch(() => null));
  return new PersonalizationClientError(
    parsed.success
      ? parsed.data.error.message
      : "Personalization request failed",
    response.status,
    parsed.success ? parsed.data.error.code : null,
  );
}

/** Browser-private adapter for the BFF-owned personalization projection. */
export function cachedPersonalization(
  subject: string,
): PersonalizationSnapshot | undefined {
  return snapshots.get(subject);
}

export async function readPersonalization(
  subject: string,
): Promise<PersonalizationSnapshot> {
  const cached = snapshots.get(subject);
  if (cached !== undefined) return cached;
  const pending = reads.get(subject);
  if (pending !== undefined) return pending;

  const request = fetch(endpoint, { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw await parseError(response);
      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new PersonalizationClientError(
          "Personalization response is invalid",
          response.status,
        );
      }
      snapshots.set(subject, parsed.data.data);
      return parsed.data.data;
    })
    .finally(() => {
      reads.delete(subject);
    });
  reads.set(subject, request);
  return request;
}

export async function replacePersonalization(
  subject: string,
  fields: PersonalizationFields,
  expectedRevision: number,
): Promise<PersonalizationSnapshot> {
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      expected_revision: expectedRevision,
      ...fields,
    }),
  });
  if (!response.ok) throw await parseError(response);
  const parsed = saveResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new PersonalizationClientError(
      "Personalization response is invalid",
      response.status,
    );
  }
  snapshots.set(subject, parsed.data.data);
  return parsed.data.data;
}
