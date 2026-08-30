import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  sendImpl: vi.fn(async () => ({})),
  destroyImpl: vi.fn(),
  lastClientConfig: undefined as unknown,
  lastCommandInput: undefined as unknown,
};

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation((config: unknown) => {
    state.lastClientConfig = config;
    return { send: state.sendImpl, destroy: state.destroyImpl };
  }),
  HeadBucketCommand: vi.fn().mockImplementation((input: unknown) => {
    state.lastCommandInput = input;
    return { input };
  }),
}));

const { createS3Client, testS3Connection } = await import("./s3-client");

const baseConfig = {
  region: "auto",
  bucket: "my-bucket",
  forcePathStyle: true,
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "supersecret",
};

beforeEach(() => {
  state.sendImpl = vi.fn(async () => ({}));
  state.destroyImpl = vi.fn();
  state.lastClientConfig = undefined;
  state.lastCommandInput = undefined;
});

describe("createS3Client", () => {
  it("omits the endpoint option entirely when none is given (AWS S3)", () => {
    createS3Client(baseConfig);
    expect(state.lastClientConfig).not.toHaveProperty("endpoint");
  });

  it("passes the endpoint through when given (R2 / self-hosted)", () => {
    createS3Client({ ...baseConfig, endpoint: "https://abc123.r2.cloudflarestorage.com" });
    expect(state.lastClientConfig).toMatchObject({ endpoint: "https://abc123.r2.cloudflarestorage.com" });
  });

  it("forwards region, forcePathStyle, and credentials", () => {
    createS3Client(baseConfig);
    expect(state.lastClientConfig).toMatchObject({
      region: "auto",
      forcePathStyle: true,
      credentials: { accessKeyId: "AKIAEXAMPLE", secretAccessKey: "supersecret" },
    });
  });
});

describe("testS3Connection", () => {
  it("returns success when HeadBucket resolves", async () => {
    const result = await testS3Connection(baseConfig);
    expect(result).toEqual({ success: true });
    expect(state.lastCommandInput).toEqual({ Bucket: "my-bucket" });
  });

  it("returns the error message when HeadBucket rejects", async () => {
    state.sendImpl = vi.fn(async () => {
      throw new Error("Forbidden");
    });
    const result = await testS3Connection(baseConfig);
    expect(result).toEqual({ success: false, error: "Forbidden" });
  });

  it("always destroys the client, even on failure", async () => {
    state.sendImpl = vi.fn(async () => {
      throw new Error("boom");
    });
    await testS3Connection(baseConfig);
    expect(state.destroyImpl).toHaveBeenCalledOnce();
  });
});
