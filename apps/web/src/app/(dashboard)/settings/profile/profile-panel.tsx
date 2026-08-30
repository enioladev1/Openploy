"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Camera01Icon, Cancel01Icon, LockPasswordIcon, UserIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { initialsOf } from "@/lib/initials";
import { PasswordInput } from "@/components/password-input";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Camera badge (bottom-right, always visible) opens the file picker to
 * upload/replace the photo. A tiny "x" only appears on hover, and only once
 * a photo is actually set, to revert to initials - deliberately not framed
 * as a labeled "Remove" action.
 */
function AvatarUploader({ userId, name }: { userId: string; name: string }) {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cacheBuster, setCacheBuster] = useState(0);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setIsBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/users/${userId}/avatar`, { method: "POST", body: formData });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Upload failed");
      toast.success("Photo updated");
      setCacheBuster((n) => n + 1);
      void utils.users.list.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRevertToInitials(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsBusy(true);
    try {
      const response = await fetch(`/api/users/${userId}/avatar`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to update photo");
      setHasPhoto(false);
      setCacheBuster((n) => n + 1);
      void utils.users.list.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update photo");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="group/avatar-uploader relative inline-block self-start">
      <Avatar size="lg" className="size-16">
        {/* Raw <img>, not the shared AvatarImage - this needs its own load-state
            visibility (hasPhoto) to drive the hover-to-remove control, which the
            shared component's internal state doesn't expose to callers. */}
        <img
          key={cacheBuster}
          src={`/api/users/${userId}/avatar?v=${cacheBuster}`}
          alt={name}
          className="aspect-square size-full rounded-full object-cover"
          style={{ display: hasPhoto ? "block" : "none" }}
          onLoad={() => setHasPhoto(true)}
          onError={() => setHasPhoto(false)}
        />
        {!hasPhoto && (
          <AvatarFallback className="bg-foreground/[0.06] font-heading text-base font-semibold tracking-wide text-foreground/80">
            {initialsOf(name)}
          </AvatarFallback>
        )}
      </Avatar>

      <button
        type="button"
        aria-label="Change photo"
        disabled={isBusy}
        onClick={() => fileInputRef.current?.click()}
        className="absolute -right-0.5 -bottom-0.5 flex size-4.5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <HugeiconsIcon icon={Camera01Icon} size={9} strokeWidth={2} />
      </button>

      {hasPhoto && (
        <button
          type="button"
          aria-label="Revert to initials"
          disabled={isBusy}
          onClick={handleRevertToInitials}
          className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-foreground text-background opacity-0 transition-opacity group-hover/avatar-uploader:opacity-100"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2.5} />
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

function ProfileInfoCard() {
  const utils = trpc.useUtils();
  const profile = trpc.profile.get.useQuery();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.name);
      setEmail(profile.data.email);
    }
  }, [profile.data]);

  const update = trpc.profile.update.useMutation({
    onSuccess: () => {
      toast.success("Profile updated");
      setCurrentPassword("");
      void utils.profile.get.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon icon={UserIcon} size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" />
          Profile
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!profile.data ? (
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate({ name, email, currentPassword });
            }}
          >
            <FieldGroup>
              <AvatarUploader userId={profile.data.id} name={profile.data.name} />
              <div className="grid grid-cols-2 gap-6">
                <Field>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="current-password">Current password</FieldLabel>
                <PasswordInput
                  id="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <FieldDescription>Required to confirm any change to your name or email.</FieldDescription>
              </Field>
              <Button type="submit" isDisabled={update.isPending} className="self-start">
                {update.isPending ? "Saving..." : "Save changes"}
              </Button>
            </FieldGroup>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePassword = trpc.profile.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Password changed - you've been signed out of your other sessions");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err) => toast.error(err.message),
  });

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon icon={LockPasswordIcon} size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" />
          Change password
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (mismatch) return;
            changePassword.mutate({ currentPassword, newPassword });
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="change-current-password">Current password</FieldLabel>
              <PasswordInput
                id="change-current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-6">
              <Field>
                <FieldLabel htmlFor="new-password">New password</FieldLabel>
                <PasswordInput
                  id="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
                <FieldDescription>At least 12 characters.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
                <PasswordInput
                  id="confirm-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                {mismatch && <FieldDescription className="text-destructive">Passwords don&apos;t match.</FieldDescription>}
              </Field>
            </div>
            <Button type="submit" isDisabled={changePassword.isPending || mismatch} className="self-start">
              {changePassword.isPending ? "Changing password..." : "Change password"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

export function ProfilePanel() {
  return (
    <div className="flex flex-col gap-8">
      <ProfileInfoCard />
      <ChangePasswordCard />
    </div>
  );
}
