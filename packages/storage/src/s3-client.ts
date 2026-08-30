import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

export interface S3ConnectionConfig {
  // Optional here (the AWS SDK can derive a default from region alone), but
  // callers should always collect this from the user rather than hardcode
  // one - the "correct" endpoint varies per account/region/deployment even
  // within one provider.
  endpoint?: string;
  region: string;
  bucket: string;
  // Path-style addressing (bucket in the URL path, not the hostname) - most
  // self-hosted/non-AWS S3-compatible servers need this; AWS and R2 do not.
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface TestConnectionResult {
  success: boolean;
  error?: string;
}

export function createS3Client(config: S3ConnectionConfig): S3Client {
  return new S3Client({
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // The SDK has no default timeout otherwise - a wrong/unreachable endpoint
    // hangs the request forever instead of failing fast. This is how a stuck
    // "running" backup was actually discovered: nothing but pg-boss's own
    // ~15min job expiry ever killed it. requestTimeout is per HTTP request,
    // not per whole upload - lib-storage's multipart parts easily finish
    // within this even on a slow link, so it's safe for large dumps.
    requestHandler: { connectionTimeout: 10_000, requestTimeout: 5 * 60 * 1000 },
  });
}

/**
 * HeadBucket is the minimal real proof a "test connection" needs: it
 * confirms the bucket exists AND that these credentials can reach it,
 * without listing or writing anything.
 */
export async function testS3Connection(config: S3ConnectionConfig): Promise<TestConnectionResult> {
  const client = createS3Client(config);
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.destroy();
  }
}
