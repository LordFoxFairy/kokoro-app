export class ReferenceGenerationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReferenceGenerationError';
  }
}
