import { describe, expect, it } from "vitest";
import { backupStorageInputSchema } from "./backups";

describe("backupStorageInputSchema", () => {
  it("accepts an aws-s3 config with an explicit endpoint and region", () => {
    const result = backupStorageInputSchema.parse({
      provider: "aws-s3",
      name: "Primary backups",
      endpoint: "https://s3.us-east-1.amazonaws.com",
      region: "us-east-1",
      bucket: "my-backups",
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "secret",
    });
    expect(result).toMatchObject({
      provider: "aws-s3",
      endpoint: "https://s3.us-east-1.amazonaws.com",
      region: "us-east-1",
    });
  });

  it("requires an endpoint for aws-s3 too - never hardcoded/derived", () => {
    const result = backupStorageInputSchema.safeParse({
      provider: "aws-s3",
      name: "Primary backups",
      region: "us-east-1",
      bucket: "my-backups",
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "secret",
    });
    expect(result.success).toBe(false);
  });

  it("requires an endpoint for cloudflare-r2 and rejects a missing one", () => {
    const result = backupStorageInputSchema.safeParse({
      provider: "cloudflare-r2",
      name: "R2 backups",
      bucket: "my-backups",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });
    expect(result.success).toBe(false);
  });

  it("accepts cloudflare-r2 with an endpoint and defaults region to auto", () => {
    const result = backupStorageInputSchema.parse({
      provider: "cloudflare-r2",
      name: "R2 backups",
      endpoint: "https://abc123.r2.cloudflarestorage.com",
      bucket: "my-backups",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });
    expect(result).toMatchObject({
      provider: "cloudflare-r2",
      endpoint: "https://abc123.r2.cloudflarestorage.com",
      region: "auto",
    });
  });

  it("accepts an explicit region for cloudflare-r2", () => {
    const result = backupStorageInputSchema.parse({
      provider: "cloudflare-r2",
      name: "R2 backups",
      endpoint: "https://abc123.r2.cloudflarestorage.com",
      region: "weur",
      bucket: "my-backups",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });
    expect(result.region).toBe("weur");
  });

  it("defaults s3-compatible forcePathStyle to true and region to auto", () => {
    const result = backupStorageInputSchema.parse({
      provider: "s3-compatible",
      name: "MinIO",
      endpoint: "https://minio.example.com",
      bucket: "my-backups",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });
    expect(result).toMatchObject({ forcePathStyle: true, region: "auto" });
  });

  it("requires a valid URL for s3-compatible's endpoint", () => {
    const result = backupStorageInputSchema.safeParse({
      provider: "s3-compatible",
      name: "MinIO",
      endpoint: "not-a-url",
      bucket: "my-backups",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });
    expect(result.success).toBe(false);
  });

  it("strips leading and trailing slashes from pathPrefix", () => {
    const result = backupStorageInputSchema.parse({
      provider: "aws-s3",
      name: "Primary",
      endpoint: "https://s3.us-east-1.amazonaws.com",
      region: "us-east-1",
      bucket: "my-backups",
      pathPrefix: "/backups/openploy/",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });
    expect(result.pathPrefix).toBe("backups/openploy");
  });

  it("rejects an unknown provider", () => {
    const result = backupStorageInputSchema.safeParse({
      provider: "azure-blob",
      name: "Nope",
      bucket: "my-backups",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });
    expect(result.success).toBe(false);
  });
});
