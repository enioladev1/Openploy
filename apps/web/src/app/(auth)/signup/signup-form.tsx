"use client";

import { useActionState, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserAdd01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { Spinner } from "@/components/ui/spinner";
import { AuthCard } from "../auth-card";
import { signupAction, type SignupFormState } from "./actions";

const initialState: SignupFormState = {};

// How long to wait before navigating to /login after signup - covers the
// Traefik restart the first admin's ACME email triggers (see actions.ts).
// A full navigation, not router.push, so it re-requests the page fresh
// rather than reusing an RSC transport that may have been mid-request when
// the restart happened.
const REDIRECT_DELAY_MS = 5000;

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initialState);

  useEffect(() => {
    if (!state.success) return;
    const timeout = setTimeout(() => {
      window.location.href = "/login?signedUp=1";
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [state.success]);

  if (state.success) {
    return (
      <AuthCard title="Finishing setup" description="Your account is ready - this instance is restarting its proxy to finish setup.">
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Spinner className="size-6" />
          <p className="text-sm text-muted-foreground">Redirecting you to sign in...</p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Set up this instance"
      description="Create the first admin account to finish installing Openploy"
      error={state.error}
    >
      <form action={formAction}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">Your name</FieldLabel>
            <Input id="name" name="name" type="text" autoComplete="name" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <PasswordInput id="password" name="password" autoComplete="new-password" minLength={12} required />
            <FieldDescription>At least 12 characters.</FieldDescription>
          </Field>
          <Button type="submit" isDisabled={pending} className="w-full">
            <HugeiconsIcon icon={UserAdd01Icon} size={16} strokeWidth={2} />
            {pending ? "Creating account..." : "Create admin account"}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
