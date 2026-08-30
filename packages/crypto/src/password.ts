import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended argon2id parameters for interactive login (2024 guidance,
// tuned for ~19MiB / t=2 minimum; we go higher since this runs server-side only).
const ARGON2_OPTIONS = {
  algorithm: 2, // argon2id
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, ARGON2_OPTIONS);
}

export function verifyPassword(hashValue: string, plaintext: string): Promise<boolean> {
  return verify(hashValue, plaintext);
}
