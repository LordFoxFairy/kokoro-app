export class PersonalizationClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "PersonalizationClientError";
  }
}
