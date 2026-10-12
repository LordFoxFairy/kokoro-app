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
export async function readPersonalization(): Promise<PersonalizationSnapshot> {
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw await parseError(response);
  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new PersonalizationClientError(
      "Personalization response is invalid",
      response.status,
    );
  }
  return parsed.data.data;
}

export async function replacePersonalization(
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
  return parsed.data.data;
}
