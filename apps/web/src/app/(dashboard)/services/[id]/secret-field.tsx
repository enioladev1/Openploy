"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

interface SecretFieldProps {
  id: string;
  label: string;
  copyLabel: string;
  /** Fetches the raw secret - only called once per mount, cached after that so repeat reveals/copies are instant. */
  fetchSecret: () => Promise<string>;
  /** Transforms the fetched secret into what's shown/copied - identity by default, used for e.g. building a full connection string around a fetched password. */
  formatValue?: (secret: string) => string;
  maskedPlaceholder?: string;
  className?: string;
}

/**
 * Reveal and copy are independent actions: copying doesn't require revealing
 * on screen first, and once either has fetched the secret it's cached so the
 * other becomes instant instead of triggering its own round trip.
 */
export function SecretField({
  id,
  label,
  copyLabel,
  fetchSecret,
  formatValue = (secret) => secret,
  maskedPlaceholder = "••••••••",
  className,
}: SecretFieldProps) {
  const [secret, setSecret] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [revealPending, setRevealPending] = useState(false);

  async function ensureSecret(): Promise<string> {
    if (secret) return secret;
    const value = await fetchSecret();
    setSecret(value);
    return value;
  }

  async function handleToggleReveal() {
    if (secret) {
      setVisible((prev) => !prev);
      return;
    }
    try {
      setRevealPending(true);
      await ensureSecret();
      setVisible(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to reveal ${label.toLowerCase()}`);
    } finally {
      setRevealPending(false);
    }
  }

  const displayValue = visible && secret ? formatValue(secret) : maskedPlaceholder;

  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input id={id} readOnly value={displayValue} className="flex-1" />
        <Button type="button" variant="outline" size="icon-sm" isDisabled={revealPending} onPress={handleToggleReveal}>
          {revealPending ? (
            <Spinner className="size-3.5" />
          ) : (
            <HugeiconsIcon icon={visible ? ViewOffIcon : ViewIcon} size={14} strokeWidth={2} />
          )}
          <span className="sr-only">{visible ? `Hide ${label.toLowerCase()}` : `Reveal ${label.toLowerCase()}`}</span>
        </Button>
        <CopyButton
          value={secret ? formatValue(secret) : undefined}
          getValue={secret ? undefined : async () => formatValue(await ensureSecret())}
          label={copyLabel}
        />
      </div>
    </Field>
  );
}
