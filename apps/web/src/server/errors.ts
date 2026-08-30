export class AuthError extends Error {}
export class RateLimitedError extends Error {
  constructor(public retryAfterMs: number) {
    super("Too many attempts, please try again later");
  }
}
export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}
export class ValidationError extends Error {}
