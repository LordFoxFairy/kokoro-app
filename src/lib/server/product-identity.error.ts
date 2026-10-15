/** An authoritative BFF rejection of this Product session's online admission. */
export class ProductIdentitySessionRejectedError extends Error {
  constructor() {
    super("Product session rejected")
    this.name = "ProductIdentitySessionRejectedError"
  }
}
