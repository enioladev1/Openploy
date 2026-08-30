import type { Readable } from "node:stream";
import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { createS3Client, type S3ConnectionConfig } from "./s3-client";

/**
 * Streams body straight to S3 without buffering the whole object in memory -
 * a database dump can be many gigabytes. @aws-sdk/lib-storage's Upload
 * automatically switches to a multipart upload once the stream exceeds its
 * internal part-size threshold, so this works for both a tiny and a huge dump.
 */
export async function uploadObjectStream(config: S3ConnectionConfig, key: string, body: Readable): Promise<void> {
  const client = createS3Client(config);
  try {
    const upload = new Upload({
      client,
      params: { Bucket: config.bucket, Key: key, Body: body },
    });
    await upload.done();
  } finally {
    client.destroy();
  }
}

export interface S3ObjectSummary {
  key: string;
  lastModified: Date | undefined;
}

/** Lists every object under keyPrefix, handling pagination - a backup folder can grow past the 1000-key single-page limit over time. */
export async function listObjectsWithPrefix(config: S3ConnectionConfig, keyPrefix: string): Promise<S3ObjectSummary[]> {
  const client = createS3Client(config);
  try {
    const results: S3ObjectSummary[] = [];
    let continuationToken: string | undefined;
    do {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: config.bucket,
          Prefix: keyPrefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const object of response.Contents ?? []) {
        if (object.Key) results.push({ key: object.Key, lastModified: object.LastModified });
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
    return results;
  } finally {
    client.destroy();
  }
}

/** No-op on an empty list - S3's DeleteObjects rejects a request with zero keys. */
export async function deleteObjects(config: S3ConnectionConfig, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const client = createS3Client(config);
  try {
    await client.send(
      new DeleteObjectsCommand({
        Bucket: config.bucket,
        Delete: { Objects: keys.map((key) => ({ Key: key })) },
      }),
    );
  } finally {
    client.destroy();
  }
}
