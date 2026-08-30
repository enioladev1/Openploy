"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthCard } from "../auth-card";
import { verifyTotpAction, type VerifyTotpFormState } from "./actions";

const initialState: VerifyTotpFormState = {};

export default function VerifyTotpPage() {
  const [state, formAction, pending] = useActionState(verifyTotpAction, initialState);

  return (
    <AuthCard title="Two-factor verification" description="Open your authenticator app and enter the current code" error={state.error}>
      <form action={formAction}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="token">Authenticator code</FieldLabel>
            <Input
              id="token"
              name="token"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
            />
          </Field>
          <Button type="submit" isDisabled={pending} className="w-full">
            {pending ? "Verifying..." : "Verify"}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
