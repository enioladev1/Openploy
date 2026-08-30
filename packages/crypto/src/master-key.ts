import { readFileSync } from "node:fs";

const MASTER_KEY_BYTES = 32;

let cachedKey: { version: number; key: Buffer } | null = null;

/**
 * Master key is never accepted directly from a request or client input.
 * It is loaded once per process from either OPENPLOY_MASTER_KEY (base64) or a
 * file path in OPENPLOY_MASTER_KEY_FILE (installer writes it to /etc/openploy/master.key, 0600).
 */
export function loadMasterKey(): { version: number; key: Buffer } {
  if (cachedKey) return cachedKey;

  const version = Number(process.env.OPENPLOY_MASTER_KEY_VERSION ?? "1");
  const inline = process.env.OPENPLOY_MASTER_KEY;
  const filePath = process.env.OPENPLOY_MASTER_KEY_FILE;

  let key: Buffer;
  if (inline) {
    key = Buffer.from(inline, "base64");
  } else if (filePath) {
    key = Buffer.from(readFileSync(filePath, "utf8").trim(), "base64");
  } else {
    throw new Error(
      "No master key configured: set OPENPLOY_MASTER_KEY or OPENPLOY_MASTER_KEY_FILE",
    );
  }

  if (key.length !== MASTER_KEY_BYTES) {
    throw new Error(
      `Master key must be exactly ${MASTER_KEY_BYTES} bytes, got ${key.length}`,
    );
  }

  cachedKey = { version, key };
  return cachedKey;
}

/** Test-only escape hatch, never call from application code. */
export function __resetMasterKeyCacheForTests(): void {
  cachedKey = null;
}
