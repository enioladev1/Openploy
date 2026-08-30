import { Secret, TOTP } from "otpauth";
import { generateRecoveryCode } from "./tokens";

const RECOVERY_CODE_COUNT = 10;

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function buildTotp(secretBase32: string, accountLabel: string): TOTP {
  return new TOTP({
    issuer: "Openploy",
    label: accountLabel,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
}

/** Allows one step of clock drift either direction, per RFC 6238 guidance. */
export function verifyTotp(secretBase32: string, accountLabel: string, token: string): boolean {
  const totp = buildTotp(secretBase32, accountLabel);
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());
}
