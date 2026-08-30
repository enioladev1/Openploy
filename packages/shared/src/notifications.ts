import { z } from "zod";

export const notificationChannelTypeSchema = z.enum(["telegram", "smtp", "resend"]);
export type NotificationChannelType = z.infer<typeof notificationChannelTypeSchema>;

const eventFlagsSchema = {
  notifyOnDeploymentSuccess: z.boolean().default(false),
  notifyOnDeploymentFailed: z.boolean().default(true),
  notifyOnBackupSuccess: z.boolean().default(false),
  notifyOnBackupFailed: z.boolean().default(true),
};

// "Create" config: every field, including secrets, is required - there's
// nothing to fall back to yet.
export const telegramConfigSchema = z.object({
  kind: z.literal("telegram"),
  botToken: z.string().min(1, "Bot token is required"),
  chatId: z.string().min(1, "Chat ID is required"),
});
export const smtpConfigSchema = z.object({
  kind: z.literal("smtp"),
  host: z.string().min(1, "Host is required"),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean().default(false),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  fromEmail: z.string().email("Must be a valid email"),
  fromName: z.string().min(1).max(200),
  toEmail: z.string().email("Must be a valid email"),
});
export const resendConfigSchema = z.object({
  kind: z.literal("resend"),
  apiKey: z.string().min(1, "API key is required"),
  fromEmail: z.string().email("Must be a valid email"),
  fromName: z.string().min(1).max(200),
  toEmail: z.string().email("Must be a valid email"),
});
export const notificationChannelConfigSchema = z.discriminatedUnion("kind", [
  telegramConfigSchema,
  smtpConfigSchema,
  resendConfigSchema,
]);
export type NotificationChannelConfig = z.infer<typeof notificationChannelConfigSchema>;

export const createNotificationChannelInputSchema = z.object({
  name: z.string().min(1).max(200),
  config: notificationChannelConfigSchema,
  ...eventFlagsSchema,
});
export type CreateNotificationChannelInput = z.infer<typeof createNotificationChannelInputSchema>;

// "Update" config: secret fields are optional - blank means "keep the
// currently stored value," so editing a channel never requires re-entering
// credentials that already work. Non-secret fields stay required since the
// edit form always shows (and lets you change) their real current value.
export const updateTelegramConfigSchema = z.object({
  kind: z.literal("telegram"),
  botToken: z.string().min(1).optional(),
  chatId: z.string().min(1, "Chat ID is required"),
});
export const updateSmtpConfigSchema = z.object({
  kind: z.literal("smtp"),
  host: z.string().min(1, "Host is required"),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean().default(false),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1).optional(),
  fromEmail: z.string().email("Must be a valid email"),
  fromName: z.string().min(1).max(200),
  toEmail: z.string().email("Must be a valid email"),
});
export const updateResendConfigSchema = z.object({
  kind: z.literal("resend"),
  apiKey: z.string().min(1).optional(),
  fromEmail: z.string().email("Must be a valid email"),
  fromName: z.string().min(1).max(200),
  toEmail: z.string().email("Must be a valid email"),
});
export const updateNotificationChannelConfigSchema = z.discriminatedUnion("kind", [
  updateTelegramConfigSchema,
  updateSmtpConfigSchema,
  updateResendConfigSchema,
]);
export type UpdateNotificationChannelConfig = z.infer<typeof updateNotificationChannelConfigSchema>;

export const updateNotificationChannelInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  isEnabled: z.boolean(),
  config: updateNotificationChannelConfigSchema,
  ...eventFlagsSchema,
});
export type UpdateNotificationChannelInput = z.infer<typeof updateNotificationChannelInputSchema>;

export const testNotificationConfigInputSchema = z.object({ config: notificationChannelConfigSchema });
export type TestNotificationConfigInput = z.infer<typeof testNotificationConfigInputSchema>;
