import { z } from "zod";
import { emailSchema, passwordSchema } from "./auth";

// "owner" is never assignable here - it's the singular instance creator,
// set once at signup (see auth-service.ts) and never reassigned.
export const assignableOrgRoleSchema = z.enum(["admin", "member"]);

export const createUserInputSchema = z.object({
  name: z.string().min(1).max(200),
  email: emailSchema,
  password: passwordSchema,
  role: assignableOrgRoleSchema,
});
export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserRoleInputSchema = z.object({
  userId: z.string().uuid(),
  role: assignableOrgRoleSchema,
});
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleInputSchema>;
