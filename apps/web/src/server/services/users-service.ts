import "server-only";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "@openploy/crypto";
import { organizationMembers, users } from "@openploy/db";
import type { CreateUserInput } from "@openploy/shared";
import { logAuditEvent } from "../audit";
import { db } from "../db";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";

export async function listUsers(organizationId: string) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: organizationMembers.role,
      createdAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(eq(organizationMembers.organizationId, organizationId))
    .orderBy(organizationMembers.createdAt);
}

/** Admin directly sets credentials for the new user - no email/invite-link flow, matching this being a self-hosted, single-instance install with no email infrastructure. */
export async function createUser(organizationId: string, actorUserId: string, input: CreateUserInput) {
  const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  if (existing) throw new ValidationError("That email is already in use");

  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ email: input.email, passwordHash, name: input.name }).returning();
    if (!user) throw new Error("Failed to create user");

    await tx.insert(organizationMembers).values({ organizationId, userId: user.id, role: input.role });

    await logAuditEvent(tx, {
      organizationId,
      actorUserId,
      action: "user.create",
      targetType: "user",
      targetId: user.id,
      metadata: { email: user.email, role: input.role },
    });

    return { id: user.id, name: user.name, email: user.email, role: input.role, createdAt: user.createdAt };
  });
}

async function getMembership(organizationId: string, userId: string) {
  const membership = await db.query.organizationMembers.findFirst({
    where: and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)),
  });
  if (!membership) throw new NotFoundError("User not found");
  return membership;
}

export async function updateUserRole(organizationId: string, callerUserId: string, userId: string, role: "admin" | "member") {
  const membership = await getMembership(organizationId, userId);
  if (membership.role === "owner") throw new ForbiddenError("The owner's role can't be changed");
  if (userId === callerUserId) throw new ForbiddenError("You can't change your own role");

  await db.transaction(async (tx) => {
    await tx
      .update(organizationMembers)
      .set({ role })
      .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)));

    await logAuditEvent(tx, {
      organizationId,
      actorUserId: callerUserId,
      action: "user.role_change",
      targetType: "user",
      targetId: userId,
      metadata: { from: membership.role, to: role },
    });
  });
}

/** Deletes the users row outright, not just the membership - this codebase's current phase treats one install as one org, so a user with no membership here has nowhere else to belong. Cascades clean up their sessions and membership row. */
export async function removeUser(organizationId: string, callerUserId: string, userId: string) {
  const membership = await getMembership(organizationId, userId);
  if (membership.role === "owner") throw new ForbiddenError("The owner can't be removed");
  if (userId === callerUserId) throw new ForbiddenError("You can't remove your own account");

  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });

  await db.transaction(async (tx) => {
    await tx.delete(users).where(eq(users.id, userId));

    await logAuditEvent(tx, {
      organizationId,
      actorUserId: callerUserId,
      action: "user.remove",
      targetType: "user",
      targetId: userId,
      metadata: { email: target?.email, role: membership.role },
    });
  });
}
