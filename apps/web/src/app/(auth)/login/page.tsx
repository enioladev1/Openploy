"use client";

import { useActionState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Login01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { AuthCard } from "../auth-card";
import { loginAction, type LoginFormState } from "./actions";

const initialState: LoginFormState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <AuthCard title="Log in" description="Enter your email and password to access your dashboard" error={state.error}>
      <form action={formAction}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <PasswordInput id="password" name="password" autoComplete="current-password" required />
          </Field>
          <Button type="submit" isDisabled={pending} className="w-full">
            <HugeiconsIcon icon={Login01Icon} size={16} strokeWidth={2} />
            {pending ? "Logging in..." : "Log in"}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
