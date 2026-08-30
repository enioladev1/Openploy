import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  provider: null as any,
  listRows: [] as any[],
  inserted: [] as any[],
  updates: [] as any[],
  deletes: [] as any[],
};

const encryptSecretMock = vi.fn((value: string) => ({ cipherText: `enc(${value})` }));
const decryptSecretMock = vi.fn((value: any) => value.cipherText?.replace(/^enc\(|\)$/g, "") ?? "decrypted");

vi.mock("@openploy/crypto", () => ({
  encryptSecret: (value: string) => encryptSecretMock(value),
  decryptSecret: (value: any) => decryptSecretMock(value),
}));

const testAiProviderConnectionMock = vi.fn(async (_config: unknown) => undefined);
const listModelsMock = vi.fn(async (_config: unknown) => [{ id: "gpt-4o-mini", label: "gpt-4o-mini" }]);
vi.mock("@openploy/ai-providers", () => ({
  testAiProviderConnection: (config: unknown) => testAiProviderConnectionMock(config),
  listModels: (config: unknown) => listModelsMock(config),
}));

vi.mock("@openploy/db", () => ({
  aiProviders: { id: "id-column", organizationId: "org-id-column", isEnabled: "is-enabled-column" },
}));

vi.mock("../db", () => ({
  db: {
    query: {
      aiProviders: {
        findFirst: vi.fn(async () => state.provider),
        findMany: vi.fn(async () => state.listRows),
      },
    },
    insert: vi.fn(() => ({
      values: (values: any) => ({
        returning: async () => {
          const row = { id: "new-provider-id", ...values };
          state.inserted.push(values);
          return [row];
        },
      }),
    })),
    update: vi.fn(() => ({
      set: (values: any) => ({
        where: () => {
          state.updates.push(values);
          const row = { id: "updated-provider-id", ...values };
          return { returning: async () => [row], then: (resolve: any) => resolve(undefined) };
        },
      }),
    })),
    delete: vi.fn(() => ({
      where: async () => {
        state.deletes.push(true);
      },
    })),
  },
}));

const {
  createAiProvider,
  deleteAiProvider,
  getEnabledAiProviderConfig,
  listAiProviderModels,
  listAiProviders,
  listEnabledAiProviders,
  testAiProviderConfig,
  testSavedAiProvider,
  updateAiProvider,
} = await import("./ai-provider-service");

const organizationId = "018e5a3e-0000-7000-8000-000000000099";
const providerId = "018e5a3e-2b6b-7c3e-8b3a-2f7f3a8b9c1d";

describe("ai-provider-service", () => {
  beforeEach(() => {
    state.provider = null;
    state.listRows = [];
    state.inserted = [];
    state.updates = [];
    state.deletes = [];
    encryptSecretMock.mockClear();
    decryptSecretMock.mockClear();
    testAiProviderConnectionMock.mockClear();
    listModelsMock.mockClear();
  });

  describe("createAiProvider", () => {
    it("encrypts the api key and stores provider/apiUrl/model in the clear", async () => {
      const row = await createAiProvider(organizationId, {
        name: "Team OpenAI",
        provider: "openai",
        apiUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKey: "sk-secret",
      });

      expect(row.organizationId).toBe(organizationId);
      expect(encryptSecretMock).toHaveBeenCalledWith("sk-secret");
      expect(state.inserted[0]).toMatchObject({
        provider: "openai",
        apiUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKeyEncrypted: JSON.stringify({ cipherText: "enc(sk-secret)" }),
      });
    });
  });

  describe("updateAiProvider", () => {
    it("throws NotFoundError when the provider isn't in the caller's org", async () => {
      state.provider = null;
      await expect(
        updateAiProvider(organizationId, {
          id: providerId,
          name: "Renamed",
          isEnabled: true,
          provider: "openai",
          apiUrl: "https://api.openai.com/v1",
          model: "gpt-4o-mini",
        }),
      ).rejects.toThrow("AI provider not found");
    });

    it("keeps the existing encrypted key when apiKey is left blank", async () => {
      state.provider = {
        id: providerId,
        organizationId,
        provider: "openai",
        apiUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKeyEncrypted: "existing-encrypted-value",
      };

      await updateAiProvider(organizationId, {
        id: providerId,
        name: "Team OpenAI",
        isEnabled: true,
        provider: "openai",
        apiUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini-2",
      });

      expect(encryptSecretMock).not.toHaveBeenCalled();
      expect(state.updates[0]).toMatchObject({ model: "gpt-4o-mini-2", apiKeyEncrypted: "existing-encrypted-value" });
    });

    it("re-encrypts when a new key is provided", async () => {
      state.provider = {
        id: providerId,
        organizationId,
        provider: "openai",
        apiUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKeyEncrypted: "existing-encrypted-value",
      };

      await updateAiProvider(organizationId, {
        id: providerId,
        name: "Team OpenAI",
        isEnabled: true,
        provider: "openai",
        apiUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKey: "brand-new-key",
      });

      expect(encryptSecretMock).toHaveBeenCalledWith("brand-new-key");
      expect(state.updates[0].apiKeyEncrypted).toBe(JSON.stringify({ cipherText: "enc(brand-new-key)" }));
    });
  });

  describe("listAiProviders", () => {
    it("returns the rows for the org", async () => {
      state.listRows = [{ id: providerId, name: "Team OpenAI" }];
      await expect(listAiProviders(organizationId)).resolves.toEqual(state.listRows);
    });
  });

  describe("listEnabledAiProviders", () => {
    it("returns the rows the query resolves (enabled filter applied server-side in the WHERE clause)", async () => {
      state.listRows = [{ id: providerId, name: "Team OpenAI", provider: "openai" }];
      await expect(listEnabledAiProviders(organizationId)).resolves.toEqual(state.listRows);
    });
  });

  describe("deleteAiProvider", () => {
    it("throws NotFoundError when the provider doesn't exist", async () => {
      await expect(deleteAiProvider(organizationId, providerId)).rejects.toThrow("AI provider not found");
    });

    it("deletes when the provider belongs to the org", async () => {
      state.provider = { id: providerId, organizationId };
      await deleteAiProvider(organizationId, providerId);
      expect(state.deletes).toHaveLength(1);
    });
  });

  describe("testAiProviderConfig", () => {
    it("calls through to the ai-providers package without touching the DB", async () => {
      const config = { provider: "openai" as const, apiUrl: "u", apiKey: "k", model: "m" };
      const result = await testAiProviderConfig(config);
      expect(testAiProviderConnectionMock).toHaveBeenCalledWith(config);
      expect(result).toEqual({ success: true });
    });

    it("returns success:false with the error message on failure, without throwing", async () => {
      testAiProviderConnectionMock.mockRejectedValueOnce(new Error("invalid api key"));
      const result = await testAiProviderConfig({ provider: "openai", apiUrl: "u", apiKey: "bad", model: "m" });
      expect(result).toEqual({ success: false, error: "invalid api key" });
    });
  });

  describe("testSavedAiProvider", () => {
    it("decrypts the stored key, tests it, and persists success", async () => {
      state.provider = {
        id: providerId,
        organizationId,
        provider: "openai",
        apiUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKeyEncrypted: JSON.stringify({ cipherText: "enc(stored-key)" }),
      };

      const result = await testSavedAiProvider(organizationId, providerId);

      expect(decryptSecretMock).toHaveBeenCalled();
      expect(testAiProviderConnectionMock).toHaveBeenCalledWith({
        provider: "openai",
        apiUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKey: "stored-key",
      });
      expect(result).toEqual({ success: true });
      expect(state.updates[0]).toMatchObject({ lastTestStatus: "success", lastTestError: null });
    });

    it("persists failure with the error message when the send fails", async () => {
      state.provider = {
        id: providerId,
        organizationId,
        provider: "openai",
        apiUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKeyEncrypted: JSON.stringify({ cipherText: "enc(stored-key)" }),
      };
      testAiProviderConnectionMock.mockRejectedValueOnce(new Error("Unauthorized"));

      const result = await testSavedAiProvider(organizationId, providerId);

      expect(result).toEqual({ success: false, error: "Unauthorized" });
      expect(state.updates[0]).toMatchObject({ lastTestStatus: "failed", lastTestError: "Unauthorized" });
    });
  });

  describe("listAiProviderModels", () => {
    it("calls through to the ai-providers package", async () => {
      const config = { provider: "openai" as const, apiUrl: "u", apiKey: "k" };
      await expect(listAiProviderModels(config)).resolves.toEqual([{ id: "gpt-4o-mini", label: "gpt-4o-mini" }]);
      expect(listModelsMock).toHaveBeenCalledWith(config);
    });
  });

  describe("getEnabledAiProviderConfig", () => {
    it("throws NotFoundError when the provider isn't in the caller's org", async () => {
      state.provider = null;
      await expect(getEnabledAiProviderConfig(organizationId, providerId)).rejects.toThrow("AI provider not found");
    });

    it("throws ForbiddenError when the provider is disabled", async () => {
      state.provider = {
        id: providerId,
        organizationId,
        isEnabled: false,
        provider: "openai",
        apiUrl: "u",
        model: "m",
        apiKeyEncrypted: JSON.stringify({ cipherText: "enc(k)" }),
      };
      await expect(getEnabledAiProviderConfig(organizationId, providerId)).rejects.toThrow("disabled");
    });

    it("returns the decrypted config when enabled", async () => {
      state.provider = {
        id: providerId,
        organizationId,
        isEnabled: true,
        provider: "anthropic",
        apiUrl: "https://api.anthropic.com",
        model: "claude-haiku-4-5-20251001",
        apiKeyEncrypted: JSON.stringify({ cipherText: "enc(stored-key)" }),
      };
      await expect(getEnabledAiProviderConfig(organizationId, providerId)).resolves.toEqual({
        provider: "anthropic",
        apiUrl: "https://api.anthropic.com",
        model: "claude-haiku-4-5-20251001",
        apiKey: "stored-key",
      });
    });
  });
});
