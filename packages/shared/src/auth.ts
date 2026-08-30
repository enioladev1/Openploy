import { z } from "zod";

// NIST 800-63B guidance: enforce a minimum length, not forced complexity/rotation.
// 12 is the floor; we don't cap much below common password manager output.
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be at most 128 characters");

export const emailSchema = z.string().email().max(320).toLowerCase();

export const signupInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1).max(200),
});
export type SignupInput = z.infer<typeof signupInputSchema>;

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const totpVerifyInputSchema = z.object({
  token: z.string().regex(/^\d{6}$/, "Must be a 6-digit code"),
});
export type TotpVerifyInput = z.infer<typeof totpVerifyInputSchema>;

export const recoveryCodeInputSchema = z.object({
  code: z.string().min(6).max(20),
});
export type RecoveryCodeInput = z.infer<typeof recoveryCodeInputSchema>;

export const updateProfileInputSchema = z.object({
  name: z.string().min(1).max(200),
  email: emailSchema,
  currentPassword: z.string().min(1).max(128),
});
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;
