import { PersonalizationClientError } from "./personalization-error";
import { requestPersonalization } from "./personalization-request";
import {
  personalizationErrorSchema,
  personalizationResponseSchema,
  personalizationSaveResponseSchema,
  type PersonalizationFields,
  type PersonalizationSnapshot,
} from "./personalization-schema";

export { PersonalizationClientError } from "./personalization-error";
export type {
  PersonalizationFields,
  PersonalizationSnapshot,
} from "./personalization-schema";

function parseError(
  status: number,
  value: unknown,
): PersonalizationClientError {
  const parsed = personalizationErrorSchema.safeParse(value);
  return new PersonalizationClientError(
    parsed.success
      ? parsed.data.error.message
      : "Personalization request failed",
    status,
    parsed.success ? parsed.data.error.code : null,
  );
}

/** Browser-private adapter for the BFF-owned personalization projection. */
export async function readPersonalization(
  signal?: AbortSignal,
): Promise<PersonalizationSnapshot> {
  const response = await requestPersonalization({ cache: "no-store" }, signal);
  if (!response.ok) throw parseError(response.status, response.value);
  const parsed = personalizationResponseSchema.safeParse(response.value);
  if (!parsed.success)
    throw new PersonalizationClientError(
      "Personalization response is invalid",
      response.status,
    );
  return parsed.data.data;
}

export async function replacePersonalization(
  fields: PersonalizationFields,
  expectedRevision: number,
  signal?: AbortSignal,
): Promise<PersonalizationSnapshot> {
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    expectedRevision === Number.MAX_SAFE_INTEGER
  ) {
    throw new PersonalizationClientError(
      "Personalization revision is invalid",
      0,
    );
  }
  const response = await requestPersonalization(
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expected_revision: expectedRevision, ...fields }),
    },
    signal,
  );
  if (!response.ok) throw parseError(response.status, response.value);
  const parsed = personalizationSaveResponseSchema.safeParse(response.value);
  if (!parsed.success)
    throw new PersonalizationClientError(
      "Personalization response is invalid",
      response.status,
    );
  if (
    parsed.data.data.revision !== expectedRevision + 1 ||
    Object.keys(fields).some(
      (key) =>
        parsed.data.data.personalization?.[
          key as keyof PersonalizationFields
        ] !== fields[key as keyof PersonalizationFields],
    )
  ) {
    throw new PersonalizationClientError(
      "Personalization acknowledgement does not match",
      response.status,
    );
  }
  return parsed.data.data;
}
