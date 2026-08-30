import { ZodError } from "zod";

/**
 * ZodError's own .message is the JSON-stringified issues array - useful for
 * logs, unreadable as a user-facing error. Joins each issue's own message
 * instead, which is what a failed .input(zodSchema) parse should actually show.
 */
export function formatZodError(cause: unknown): string | null {
  if (!(cause instanceof ZodError)) return null;
  const message = cause.issues.map((issue) => issue.message).join("; ");
  return message || null;
}
