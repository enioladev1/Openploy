import { beforeEach, describe, expect, it, vi } from "vitest";
import { JOB_CHECK_CERTIFICATE_STATUS, JOB_SET_ACME_EMAIL, JOB_SYNC_PLATFORM_DOMAIN } from "@openploy/shared";

const state = {
  existing: null as any,
  existingSettings: null as any,
  selectRows: [] as any[],
  inserted: [] as any[],
  updates: [] as any[],
  deletes: [] as any[],
};

const enqueueJobMock = vi.fn(async () => "job-id");
const organizationId = "018e5a3e-0000-7000-8000-000000000099";
const actorUserId = "018e5a3e-0000-7000-8000-000000000001";

const platformDomainsTable = { id: "id-column", host: "host-column", certificateId: "certificate-id-column" };
const platformSettingsTable = { id: "id-column", acmeEmail: "acme-email-column" };

function makeTx() {
  return {
    // Record on .values() itself, not inside .returning() - logAuditEvent's
    // insert never chains .returning() at all.
    insert: vi.fn((table: any) => ({
      values: (values: any) => {
        const row = { id: `new-${state.inserted.length}`, ...values };
        state.inserted.push({ table, values, row });
        return { returning: async () => [row] };
      },
    })),
    update: vi.fn((table: any) => ({
      set: (values: any) => ({
        where: () => ({
          returning: async () => {
            const base = table === platformSettingsTable ? state.existingSettings : state.existing;
            const row = { ...base, ...values };
            state.updates.push({ table, values, row });
            return [row];
          },
        }),
      }),
    })),
    delete: vi.fn((table: any) => ({
      where: async () => {
        state.deletes.push({ table });
      },
    })),
  };
}

vi.mock("../db", () => ({
  db: {
    query: {
      platformDomains: { findFirst: vi.fn(async () => state.existing) },
      platformSettings: { findFirst: vi.fn(async () => state.existingSettings) },
    },
    select: vi.fn(() => ({
      from: () => ({
        leftJoin: () => ({
          limit: async () => state.selectRows,
        }),
      }),
    })),
    transaction: async (fn: any) => fn(makeTx()),
    update: vi.fn((table: any) => ({
      set: (values: any) => ({
        where: async () => {
          state.updates.push({ table, values });
        },
      }),
    })),
  },
}));

vi.mock("@openploy/db", () => ({
  platformDomains: platformDomainsTable,
  platformSettings: platformSettingsTable,
  certificates: { id: "id-column", status: "status-column" },
  auditLogs: { id: "id-column" },
}));

vi.mock("@openploy/queue", () => ({ enqueueJob: enqueueJobMock }));

const { getAcmeEmail, getPlatformDomain, removePlatformDomain, recheckPlatformDomainCertificate, setPlatformDomain, updateAcmeEmail } =
  await import("./platform-domain-service");

describe("platform-domain-service", () => {
  beforeEach(() => {
    state.existing = null;
    state.existingSettings = null;
    state.selectRows = [];
    state.inserted = [];
    state.updates = [];
    state.deletes = [];
    enqueueJobMock.mockClear();
  });

  describe("getPlatformDomain", () => {
    it("returns null when no row exists", async () => {
      state.selectRows = [];
      await expect(getPlatformDomain()).resolves.toBeNull();
    });

    it("returns the joined row when one exists", async () => {
      state.selectRows = [{ id: "1", host: "dash.example.com", certificateId: "cert-1", certificateStatus: "issued" }];
      await expect(getPlatformDomain()).resolves.toEqual(state.selectRows[0]);
    });
  });

  describe("setPlatformDomain", () => {
    it("inserts a fresh row, requests a certificate, and audit-logs it when TLS is enabled and none existed", async () => {
      state.existing = null;
      const row = await setPlatformDomain(organizationId, actorUserId, { host: "dash.example.com", enableTls: true });

      expect(state.inserted).toHaveLength(3); // certificate, platformDomains, auditLog
      expect(row.host).toBe("dash.example.com");
      expect(row.certificateId).toBeTruthy();
      expect(state.inserted[2].values).toMatchObject({ action: "platform_domain.set", actorUserId });
      expect(enqueueJobMock).toHaveBeenCalledWith(JOB_SYNC_PLATFORM_DOMAIN, {});
      expect(enqueueJobMock).toHaveBeenCalledWith(
        JOB_CHECK_CERTIFICATE_STATUS,
        { certificateId: row.certificateId, host: row.host, attempt: 1 },
        { startAfterSeconds: 10 },
      );
    });

    it("inserts with no certificate when TLS is disabled", async () => {
      state.existing = null;
      const row = await setPlatformDomain(organizationId, actorUserId, { host: "dash.example.com", enableTls: false });

      expect(state.inserted).toHaveLength(2); // platformDomains, auditLog
      expect(row.certificateId).toBeNull();
      expect(enqueueJobMock).toHaveBeenCalledWith(JOB_SYNC_PLATFORM_DOMAIN, {});
      expect(enqueueJobMock).not.toHaveBeenCalledWith(JOB_CHECK_CERTIFICATE_STATUS, expect.anything(), expect.anything());
    });

    it("updates the existing row instead of inserting a new one when a domain is already set", async () => {
      state.existing = { id: "existing-1", host: "old.example.com", certificateId: null };
      const row = await setPlatformDomain(organizationId, actorUserId, { host: "new.example.com", enableTls: false });

      expect(state.inserted).toHaveLength(1); // just the auditLog row
      expect(state.updates).toHaveLength(1);
      expect(row.host).toBe("new.example.com");
      expect(state.inserted[0].values).toMatchObject({ action: "platform_domain.update" });
    });
  });

  describe("removePlatformDomain", () => {
    it("throws NotFoundError when nothing is set", async () => {
      state.existing = null;
      await expect(removePlatformDomain(organizationId, actorUserId)).rejects.toThrow("No dashboard domain is set");
      expect(enqueueJobMock).not.toHaveBeenCalled();
    });

    it("deletes the row, audit-logs it, and syncs when a domain is set", async () => {
      state.existing = { id: "existing-1", host: "dash.example.com", certificateId: "cert-1" };
      await removePlatformDomain(organizationId, actorUserId);

      expect(state.deletes).toHaveLength(1);
      expect(state.inserted).toHaveLength(1);
      expect(state.inserted[0].values).toMatchObject({ action: "platform_domain.remove" });
      expect(enqueueJobMock).toHaveBeenCalledWith(JOB_SYNC_PLATFORM_DOMAIN, {});
    });
  });

  describe("recheckPlatformDomainCertificate", () => {
    it("throws NotFoundError when no domain is set", async () => {
      state.existing = null;
      await expect(recheckPlatformDomainCertificate()).rejects.toThrow("No dashboard domain is set");
    });

    it("throws NotFoundError when the domain has no certificate", async () => {
      state.existing = { id: "existing-1", host: "dash.example.com", certificateId: null };
      await expect(recheckPlatformDomainCertificate()).rejects.toThrow("no TLS certificate");
    });

    it("resets the certificate to pending and re-enqueues the check when a certificate exists", async () => {
      state.existing = { id: "existing-1", host: "dash.example.com", certificateId: "cert-1" };
      await recheckPlatformDomainCertificate();

      expect(state.updates).toHaveLength(1);
      expect(state.updates[0].values).toEqual({ status: "pending" });
      expect(enqueueJobMock).toHaveBeenCalledWith(JOB_CHECK_CERTIFICATE_STATUS, {
        certificateId: "cert-1",
        host: "dash.example.com",
        attempt: 1,
      });
    });
  });

  describe("getAcmeEmail", () => {
    it("returns null when no row exists yet", async () => {
      state.existingSettings = null;
      await expect(getAcmeEmail()).resolves.toBeNull();
    });

    it("returns the stored email", async () => {
      state.existingSettings = { id: "settings-1", acmeEmail: "admin@example.com" };
      await expect(getAcmeEmail()).resolves.toBe("admin@example.com");
    });
  });

  describe("updateAcmeEmail", () => {
    it("inserts a fresh row, audit-logs it, and enqueues the set-acme-email job when none existed", async () => {
      state.existingSettings = null;
      const row = await updateAcmeEmail(organizationId, actorUserId, { email: "admin@example.com" });

      expect(row.acmeEmail).toBe("admin@example.com");
      expect(state.inserted).toHaveLength(2); // platformSettings, auditLog
      expect(state.inserted[1].values).toMatchObject({ action: "platform_settings.update_acme_email", actorUserId });
      expect(enqueueJobMock).toHaveBeenCalledWith(JOB_SET_ACME_EMAIL, { email: "admin@example.com" });
    });

    it("updates the existing row instead of inserting a new one when settings already exist", async () => {
      state.existingSettings = { id: "settings-1", acmeEmail: "old@example.com" };
      const row = await updateAcmeEmail(organizationId, actorUserId, { email: "new@example.com" });

      expect(state.inserted).toHaveLength(1); // just the auditLog row
      expect(state.updates).toHaveLength(1);
      expect(row.acmeEmail).toBe("new@example.com");
      expect(state.inserted[0].values).toMatchObject({
        action: "platform_settings.update_acme_email",
        metadata: { previousEmail: "old@example.com", email: "new@example.com" },
      });
      expect(enqueueJobMock).toHaveBeenCalledWith(JOB_SET_ACME_EMAIL, { email: "new@example.com" });
    });
  });
});
