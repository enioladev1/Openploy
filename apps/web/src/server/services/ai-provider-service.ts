import "server-only";
import { and, eq } from "drizzle-orm";
import { aiProviders } from "@openploy/db";
import { decryptSecret, encryptSecret, type EncryptedSecret } from "@openploy/crypto";
import { listModels, testAiProviderConnection } from "@openploy/ai-providers";
import type { AiModel, AiProviderConfig } from "@openploy/ai-providers";
import type {
  CreateAiProviderInput,
  ListAiProviderModelsInput,
  TestAiProviderConfigInput,
  UpdateAiProviderInput,
} from "@openploy/shared";
import { db } from "../db";
import { ForbiddenError, NotFoundError } from "../errors";

function encrypt(value: string): string {
  return JSON.stringify(encryptSecret(value));
}

function decrypt(value: string): string {
  return decryptSecret(JSON.parse(value) as EncryptedSecret);
}

const LIST_COLUMNS = {
  id: true,
  name: true,
  provider: true,
  apiUrl: true,
  model: true,
  isEnabled: true,
  lastTestedAt: true,
  lastTestStatus: true,
  lastTestError: true,
  createdAt: true,
} as const;

/** Never selects apiKeyEncrypted - the list view has no reason to touch the secret at all. */
export async function listAiProviders(organizationId: string) {
  return db.query.aiProviders.findMany({
    where: eq(aiProviders.organizationId, organizationId),
    columns: LIST_COLUMNS,
    orderBy: (providers, { desc }) => [desc(providers.createdAt)],
  });
}

/** Read-only, id/name/provider only - used by the debug picker (any writer-role member), never returns anything owner-only `list` wouldn't also expose. */
export async function listEnabledAiProviders(organizationId: string) {
  return db.query.aiProviders.findMany({
    where: and(eq(aiProviders.organizationId, organizationId), eq(aiProviders.isEnabled, true)),
    columns: { id: true, name: true, provider: true },
    orderBy: (providers, { desc }) => [desc(providers.createdAt)],
  });
}

export async function createAiProvider(organizationId: string, input: CreateAiProviderInput) {
  const [row] = await db
    .insert(aiProviders)
    .values({
      organizationId,
      name: input.name,
      provider: input.provider,
      apiUrl: input.apiUrl,
      model: input.model,
      apiKeyEncrypted: encrypt(input.apiKey),
    })
    .returning();
  if (!row) throw new Error("Failed to create AI provider");
  return row;
}

async function getOrgScopedAiProvider(organizationId: string, id: string) {
  const row = await db.query.aiProviders.findFirst({
    where: and(eq(aiProviders.id, id), eq(aiProviders.organizationId, organizationId)),
  });
  if (!row) throw new NotFoundError("AI provider not found");
  return row;
}

export async function updateAiProvider(organizationId: string, input: UpdateAiProviderInput) {
  const existing = await getOrgScopedAiProvider(organizationId, input.id);
  const [row] = await db
    .update(aiProviders)
    .set({
      name: input.name,
      isEnabled: input.isEnabled,
      provider: input.provider,
      apiUrl: input.apiUrl,
      model: input.model,
      apiKeyEncrypted: input.apiKey ? encrypt(input.apiKey) : existing.apiKeyEncrypted,
    })
    .where(eq(aiProviders.id, input.id))
    .returning();
  if (!row) throw new Error("Failed to update AI provider");
  return row;
}

export async function deleteAiProvider(organizationId: string, id: string) {
  await getOrgScopedAiProvider(organizationId, id);
  await db.delete(aiProviders).where(eq(aiProviders.id, id));
}

/** Tests a config that hasn't been saved yet (create dialog, or edit dialog where the user typed a fresh key) - never touches the DB. */
export async function testAiProviderConfig(config: TestAiProviderConfigInput) {
  try {
    await testAiProviderConnection(config);
    return { success: true as const };
  } catch (err) {
    return { success: false as const, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/** Tests the currently-saved config for a provider - decrypts server-side, persists the result, never returns the key to the client. */
export async function testSavedAiProvider(organizationId: string, id: string) {
  const row = await getOrgScopedAiProvider(organizationId, id);
  const config: AiProviderConfig = { provider: row.provider, apiUrl: row.apiUrl, model: row.model, apiKey: decrypt(row.apiKeyEncrypted) };

  try {
    await testAiProviderConnection(config);
    await db.update(aiProviders).set({ lastTestedAt: new Date(), lastTestStatus: "success", lastTestError: null }).where(eq(aiProviders.id, id));
    return { success: true as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db.update(aiProviders).set({ lastTestedAt: new Date(), lastTestStatus: "failed", lastTestError: message }).where(eq(aiProviders.id, id));
    return { success: false as const, error: message };
  }
}

/** Lists the models a not-yet-saved config's provider actually offers, for the searchable model picker in the create/edit dialog. */
export async function listAiProviderModels(config: ListAiProviderModelsInput): Promise<AiModel[]> {
  return listModels(config);
}

/** Org-scoped + enabled check + decrypt, in one place - the only way the debug feature is allowed to obtain a usable provider config. Used only server-side (packages/trpc/routers/ai-debug.ts), never returned to the client. */
export async function getEnabledAiProviderConfig(organizationId: string, id: string): Promise<AiProviderConfig> {
  const row = await getOrgScopedAiProvider(organizationId, id);
  if (!row.isEnabled) throw new ForbiddenError("This AI provider is disabled");
  return { provider: row.provider, apiUrl: row.apiUrl, model: row.model, apiKey: decrypt(row.apiKeyEncrypted) };
}
