import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fetchWithRetry } from "./retry";

const CODELOAD_BASE = "https://codeload.github.com";

/**
 * Tarball download keyed by ref (branch/sha) rather than a full git clone -
 * faster, and avoids needing git tooling in the agent image at all. Works for
 * private repos too: codeload accepts the same installation token as the API.
 */
export async function downloadAndExtractSource(
  installationToken: string,
  owner: string,
  repo: string,
  ref: string,
  destDir: string,
): Promise<void> {
  const response = await fetchWithRetry(
    `${CODELOAD_BASE}/${owner}/${repo}/tar.gz/${encodeURIComponent(ref)}`,
    { headers: { Authorization: `token ${installationToken}` } },
    // Runs inside a background deploy job, not an HTTP request - safe to wait
    // out GitHub's documented 60s secondary rate limit instead of failing fast.
    { maxAttempts: 5, honorRateLimitFloor: true },
  );

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download source tarball: ${response.status} ${await response.text()}`);
  }

  await rm(destDir, { recursive: true, force: true });
  await mkdir(destDir, { recursive: true });

  const tarPath = `${destDir}.tar.gz`;
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(tarPath));

  await new Promise<void>((resolve, reject) => {
    // --strip-components=1: GitHub tarballs wrap everything in a single
    // "<owner>-<repo>-<sha>/" directory that callers don't want to see.
    const child = spawn("tar", ["-xzf", tarPath, "-C", destDir, "--strip-components=1"]);
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`tar extract failed: ${code}`))));
  });

  await rm(tarPath, { force: true });
}
