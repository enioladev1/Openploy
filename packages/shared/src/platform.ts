import { z } from "zod";
import { hostnameSchema } from "./services";

export const setPlatformDomainInputSchema = z.object({
  host: hostnameSchema,
  enableTls: z.boolean().default(true),
});
export type SetPlatformDomainInput = z.infer<typeof setPlatformDomainInputSchema>;

export const updateAcmeEmailInputSchema = z.object({ email: z.string().email() });
export type UpdateAcmeEmailInput = z.infer<typeof updateAcmeEmailInputSchema>;
