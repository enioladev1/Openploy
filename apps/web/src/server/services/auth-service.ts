import "server-only";
import { eq } from "drizzle-orm";
import {
  decryptSecret,
  encryptSecret,
  generateSessionToken,
  generateTotpSecret,
  generateRecoveryCodes,
  hashPassword,
  hashToken,
  verifyPassword,
  verifyTotp,
} from "@openploy/crypto";
import { organizationMembers, organizations, sessions, users } from "@openploy/db";
import { JOB_SET_ACME_EMAIL, type LoginInput, type SignupInput } from "@openploy/shared";
import { enqueueJob } from "@openploy/queue";
import { db } from "../db";
import { AuthError, ForbiddenError } from "../errors";
import { SESSION_DURATION_MS } from "../session";

const GENERIC_LOGIN_ERROR = "Invalid email or password";

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

/** Used by the signup page to redirect away once setup is done, and by signupInitialAdmin itself as the actual enforcement - the page-level check is UX only, this is the real guard. */
export async function isInstanceSetUp(): Promise<boolean> {
  const existingOrgCount = await db.$count(organizations);
  return existingOrgCount > 0;
}

/**
 * Self-hosted, single-instance model: the very first signup bootstraps the
 * one organization and becomes its owner. Once an organization exists,
 * further members must come through the Phase 4 invitation flow, not open
 * signup, matching the plan's "one instance = one org" design.
 */
export async function signupInitialAdmin(input: SignupInput) {
  if (await isInstanceSetUp()) {
    throw new ForbiddenError(
      "This instance is already set up. Ask an admin for an invitation.",
    );
  }

  const existingUser = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  if (existingUser) {
    // Generic error, same as "org already set up" would be misleading here since
    // org count is 0; this path can only happen on a race between two signups.
    throw new ForbiddenError("This instance is already set up. Ask an admin for an invitation.");
  }

  const passwordHash = await hashPassword(input.password);

  const created = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email: input.email, passwordHash, name: input.name })
      .returning();
    if (!user) throw new Error("Failed to create user");

    const [org] = await tx
      .insert(organizations)
      .values({ name: `${input.name}'s organization`, ownerId: user.id })
      .returning();
    if (!org) throw new Error("Failed to create organization");

    await tx.insert(organizationMembers).values({
      organizationId: org.id,
      userId: user.id,
      role: "owner",
    });

    return { userId: user.id, organizationId: org.id };
  });

  // Best-effort: the admin account is already created at this point, and
  // must stay created even if Traefik/the queue is unreachable - a failed
  // ACME email update can always be retried later from Settings > Dashboard domain.
  try {
    await enqueueJob(JOB_SET_ACME_EMAIL, { email: input.email });
  } catch (err) {
    console.error("Failed to enqueue initial ACME email update:", err);
  }

  return created;
}

// Real argon2id hash of an unguessable, unused value, computed once and reused so
// a login attempt against a nonexistent email still pays the full hashing cost -
// otherwise timing would reveal whether the account exists.
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) dummyHashPromise = hashPassword(generateSessionToken());
  return dummyHashPromise;
}

export async function login(input: LoginInput, meta: RequestMeta) {
  const user = await db.query.users.findFirst({ where: eq(users.email, input.email) });

  // Always run a verify call even on a missing user, so response timing doesn't
  // reveal whether the account exists (a cheap, well-known enumeration mitigation).
  const passwordHashToCheck = user?.passwordHash ?? (await getDummyHash());
  const passwordOk = await verifyPassword(passwordHashToCheck, input.password);

  if (!user || !passwordOk) {
    throw new AuthError(GENERIC_LOGIN_ERROR);
  }

  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashToken(token),
    mfaPending: user.totpEnabled,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    expiresAt,
  });

  return { token, expiresAt, mfaRequired: user.totpEnabled };
}

export async function logout(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export interface AuthContext {
  userId: string;
  sessionId: string;
  organizationId: string;
  role: "owner" | "admin" | "member";
}

/** Returns null for missing/expired/mfa-pending sessions; callers must treat null as "not authenticated". */
export async function resolveSession(token: string): Promise<AuthContext | null> {
  const tokenHash = hashToken(token);
  const session = await db.query.sessions.findFirst({ where: eq(sessions.tokenHash, tokenHash) });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  if (session.mfaPending) return null;

  const membership = await db.query.organizationMembers.findFirst({
    where: eq(organizationMembers.userId, session.userId),
  });
  if (!membership) return null;

  return {
    userId: session.userId,
    sessionId: session.id,
    organizationId: membership.organizationId,
    role: membership.role,
  };
}

/** For the TOTP-verify step: resolves an mfa-pending session without requiring it be fully authenticated yet. */
export async function resolvePendingMfaSession(token: string) {
  const tokenHash = hashToken(token);
  const session = await db.query.sessions.findFirst({ where: eq(sessions.tokenHash, tokenHash) });
  if (!session || session.expiresAt.getTime() < Date.now() || !session.mfaPending) return null;
  return session;
}

export async function completeMfaChallenge(token: string, totpToken: string): Promise<void> {
  const session = await resolvePendingMfaSession(token);
  if (!session) throw new AuthError("Session expired, please log in again");

  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  if (!user?.totpEnabled) throw new AuthError("Session expired, please log in again");

  // totpSecretEncrypted is JSON-encoded EncryptedSecret; decrypted only for this check.
  if (!user.totpSecretEncrypted) throw new AuthError("Session expired, please log in again");
  const secret = decryptSecret(JSON.parse(user.totpSecretEncrypted));

  if (!verifyTotp(secret, user.email, totpToken)) {
    throw new AuthError("Invalid verification code");
  }

  await db.update(sessions).set({ mfaPending: false }).where(eq(sessions.id, session.id));
}

/** Secret + recovery codes are returned once for display (QR code, "save these codes" screen) and only persisted (encrypted/hashed) once confirmTotpEnrollment verifies the user actually scanned it. */
export function beginTotpEnrollment() {
  return { secret: generateTotpSecret(), recoveryCodes: generateRecoveryCodes() };
}

export async function confirmTotpEnrollment(
  userId: string,
  secret: string,
  recoveryCodes: string[],
  totpToken: string,
) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new AuthError("User not found");
  if (!verifyTotp(secret, user.email, totpToken)) {
    throw new AuthError("Invalid verification code");
  }

  await db
    .update(users)
    .set({
      totpSecretEncrypted: JSON.stringify(encryptSecret(secret)),
      totpEnabled: true,
      recoveryCodeHashes: recoveryCodes.map((code) => hashToken(code)),
    })
    .where(eq(users.id, userId));
}
