import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { hashPassword, verifyPassword } from "@openploy/crypto";
import { sessions, users } from "@openploy/db";
import type { ChangePasswordInput, UpdateProfileInput } from "@openploy/shared";
import { logAuditEvent } from "../audit";
import { db } from "../db";
import { AuthError, NotFoundError, ValidationError } from "../errors";

export async function getProfile(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, name: true, email: true, totpEnabled: true, createdAt: true },
  });
  if (!user) throw new NotFoundError("User not found");
  return user;
}

/** Email is tied to login identity, so changing it (like changing the password) requires re-proving the current password, not just an active session. */
export async function updateProfile(organizationId: string, userId: string, input: UpdateProfileInput) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new NotFoundError("User not found");

  const passwordOk = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!passwordOk) throw new AuthError("Current password is incorrect");

  const emailChanged = input.email !== user.email;
  if (emailChanged) {
    const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
    if (existing) throw new ValidationError("That email is already in use");
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ name: input.name, email: input.email })
      .where(eq(users.id, userId))
      .returning({ id: users.id, name: users.name, email: users.email, totpEnabled: users.totpEnabled, createdAt: users.createdAt });
    if (!updated) throw new Error("Failed to update profile");

    await logAuditEvent(tx, {
      organizationId,
      actorUserId: userId,
      action: "profile.update",
      targetType: "user",
      targetId: userId,
      metadata: emailChanged ? { emailChanged: true, previousEmail: user.email, newEmail: input.email } : { emailChanged: false },
    });

    return updated;
  });
}

/** Revokes every other session on success - the same reasoning as most account systems: a password change should force re-login everywhere else, in case the old password leaked. */
export async function changePassword(
  organizationId: string,
  userId: string,
  currentSessionId: string,
  input: ChangePasswordInput,
) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new NotFoundError("User not found");

  const passwordOk = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!passwordOk) throw new AuthError("Current password is incorrect");

  const newPasswordHash = await hashPassword(input.newPassword);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: newPasswordHash }).where(eq(users.id, userId));
    await tx.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, currentSessionId)));

    await logAuditEvent(tx, {
      organizationId,
      actorUserId: userId,
      action: "profile.password_change",
      targetType: "user",
      targetId: userId,
    });
  });
}
