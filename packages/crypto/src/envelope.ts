import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { loadMasterKey } from "./master-key";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const DATA_KEY_BYTES = 32;

export interface EncryptedSecret {
  keyVersion: number;
  wrappedDataKey: string; // base64
  wrapIv: string; // base64
  wrapAuthTag: string; // base64
  cipherText: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

function aesGcmEncrypt(key: Buffer, plaintext: Buffer) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const cipherText = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { cipherText, iv, authTag: cipher.getAuthTag() };
}

function aesGcmDecrypt(key: Buffer, cipherText: Buffer, iv: Buffer, authTag: Buffer) {
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(cipherText), decipher.final()]);
}

/**
 * Envelope encryption: a random per-secret data key encrypts the plaintext,
 * and the master key only ever wraps that small data key. Rotating the
 * master key means re-wrapping data keys, never re-encrypting every secret.
 */
export function encryptSecret(plaintext: string): EncryptedSecret {
  const { version, key: masterKey } = loadMasterKey();
  const dataKey = randomBytes(DATA_KEY_BYTES);

  const wrapped = aesGcmEncrypt(masterKey, dataKey);
  const payload = aesGcmEncrypt(dataKey, Buffer.from(plaintext, "utf8"));

  dataKey.fill(0); // best-effort scrub of the plaintext data key from memory

  return {
    keyVersion: version,
    wrappedDataKey: wrapped.cipherText.toString("base64"),
    wrapIv: wrapped.iv.toString("base64"),
    wrapAuthTag: wrapped.authTag.toString("base64"),
    cipherText: payload.cipherText.toString("base64"),
    iv: payload.iv.toString("base64"),
    authTag: payload.authTag.toString("base64"),
  };
}

export function decryptSecret(secret: EncryptedSecret): string {
  const { version, key: masterKey } = loadMasterKey();
  if (secret.keyVersion !== version) {
    // Multi-key-version support (rotation) is a Phase 4 item; for now fail loudly
    // rather than silently using the wrong key.
    throw new Error(
      `Secret was encrypted with master key version ${secret.keyVersion}, current is ${version}`,
    );
  }

  const dataKey = aesGcmDecrypt(
    masterKey,
    Buffer.from(secret.wrappedDataKey, "base64"),
    Buffer.from(secret.wrapIv, "base64"),
    Buffer.from(secret.wrapAuthTag, "base64"),
  );

  const plaintext = aesGcmDecrypt(
    dataKey,
    Buffer.from(secret.cipherText, "base64"),
    Buffer.from(secret.iv, "base64"),
    Buffer.from(secret.authTag, "base64"),
  );

  dataKey.fill(0);
  return plaintext.toString("utf8");
}
