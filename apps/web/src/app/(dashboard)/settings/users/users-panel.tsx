"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, UserAdd01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { initialsOf } from "@/lib/initials";
import { PasswordInput } from "@/components/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type AssignableRole = "admin" | "member";

function roleBadgeVariant(role: string): "default" | "outline" | "secondary" {
  if (role === "owner") return "default";
  if (role === "admin") return "secondary";
  return "outline";
}

function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}

function InviteUserDialog({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AssignableRole>("member");

  const create = trpc.users.create.useMutation({
    onSuccess: () => {
      toast.success("User created");
      void utils.users.list.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Add user</DialogTitle>
        <DialogDescription>Set their sign-in credentials and role - they can change their password later.</DialogDescription>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ name, email, password, role });
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="invite-name">Name</FieldLabel>
            <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="invite-email">Email</FieldLabel>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="invite-password">Password</FieldLabel>
            <PasswordInput
              id="invite-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={12}
              required
            />
            <FieldDescription>At least 12 characters. Share this with them directly.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="invite-role">Role</FieldLabel>
            <Select selectedKey={role} onSelectionChange={(key) => setRole(key as AssignableRole)} className="w-full">
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem id="admin">Admin - full access</SelectItem>
                <SelectItem id="member">Member - view only</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <DialogFooter className="mt-6">
          <Button type="button" variant="outline" onPress={onClose}>
            Cancel
          </Button>
          <Button type="submit" isDisabled={create.isPending}>
            {create.isPending ? "Creating..." : "Create user"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

export function UsersPanel({ currentUserId }: { currentUserId: string }) {
  const utils = trpc.useUtils();
  const list = trpc.users.list.useQuery();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [userToRemove, setUserToRemove] = useState<{ id: string; name: string } | null>(null);

  const updateRole = trpc.users.updateRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      void utils.users.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = trpc.users.remove.useMutation({
    onSuccess: () => {
      toast.success("User removed");
      setUserToRemove(null);
      void utils.users.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">People who can sign in to this dashboard.</p>
          <Button size="sm" onPress={() => setInviteOpen(true)}>
            <HugeiconsIcon icon={UserAdd01Icon} size={14} strokeWidth={2} />
            Add user
          </Button>
        </CardHeader>
        <CardContent>
          {!list.data ? (
            <div className="flex flex-col divide-y divide-border">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : list.data.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={UserIcon} size={20} strokeWidth={2} />
                </EmptyMedia>
                <EmptyTitle>No users yet</EmptyTitle>
                <EmptyDescription>Add a user to give someone else access to this dashboard.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {list.data.map((user) => {
                const isSelf = user.id === currentUserId;
                const isOwner = user.role === "owner";
                return (
                  <div key={user.id} className="flex items-center gap-3.5 py-4 first:pt-0 last:pb-0">
                    <Avatar size="lg">
                      <AvatarImage src={`/api/users/${user.id}/avatar`} alt={user.name} />
                      <AvatarFallback className="bg-foreground/[0.06] font-heading text-[13px] font-semibold tracking-wide text-foreground/80">
                        {initialsOf(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{user.name}</p>
                        {isSelf && <Badge variant="secondary">You</Badge>}
                        <Badge variant={roleBadgeVariant(user.role)}>{roleLabel(user.role)}</Badge>
                      </div>
                      <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    {!isOwner && !isSelf && (
                      <div className="flex shrink-0 items-center gap-2">
                        <Select
                          selectedKey={user.role}
                          isDisabled={updateRole.isPending}
                          onSelectionChange={(key) => updateRole.mutate({ userId: user.id, role: key as AssignableRole })}
                        >
                          <SelectTrigger size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem id="admin">Admin</SelectItem>
                            <SelectItem id="member">Member</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${user.name}`}
                          onPress={() => setUserToRemove({ id: user.id, name: user.name })}
                        >
                          <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={2} className="text-muted-foreground" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {inviteOpen && <InviteUserDialog onClose={() => setInviteOpen(false)} />}

      {userToRemove && (
        <Dialog isOpen onOpenChange={(open) => !open && setUserToRemove(null)} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove user</DialogTitle>
            <DialogDescription>
              <strong>{userToRemove.name}</strong> will lose access to this dashboard immediately. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" isDisabled={remove.isPending} onPress={() => setUserToRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              isDisabled={remove.isPending}
              onPress={() => remove.mutate({ userId: userToRemove.id })}
            >
              {remove.isPending ? "Removing..." : "Confirm remove"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
}
