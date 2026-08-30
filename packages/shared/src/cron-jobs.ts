import { CronExpressionParser } from "cron-parser";
import { z } from "zod";

// Standard 5-field cron syntax ("*/5 * * * *"), validated with the exact
// same library apps/agent uses to evaluate due-ness (cron-parser) - a
// malformed expression is rejected here at write time, not discovered later
// as a schedule that silently never fires.
export const cronExpressionSchema = z
  .string()
  .min(1)
  .max(100)
  .refine(
    (value) => {
      try {
        CronExpressionParser.parse(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Not a valid cron expression" },
  );

export const createCronJobInputSchema = z.object({
  serviceId: z.string().uuid(),
  name: z.string().min(1).max(200),
  command: z.string().min(1).max(2000),
  cronExpression: cronExpressionSchema,
});
export type CreateCronJobInput = z.infer<typeof createCronJobInputSchema>;

export const updateCronJobInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  command: z.string().min(1).max(2000),
  cronExpression: cronExpressionSchema,
});
export type UpdateCronJobInput = z.infer<typeof updateCronJobInputSchema>;
