"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, LinkSquare01Icon, PlusSignIcon, ViewIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { type EnvVarReferenceField, formatEnvFileText, parseEnvFileText } from "@openploy/shared";
import { trpc } from "@/app/providers";
import { HighlightedEnvTextarea } from "@/components/highlighted-env-textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

const REFERENCE_FIELD_LABELS: Record<EnvVarReferenceField, string> = {
  connection_string: "Connection string",
  host: "Host",
  port: "Port",
  username: "Username",
  password: "Password",
  database_name: "Database name",
};

// Redis has no username concept, and its connection string never includes a
// database name (unlike postgres/mysql/clickhouse) - offering those fields
// for it would produce a value that doesn't mean anything.
const ENGINE_FIELDS: Record<string, EnvVarReferenceField[]> = {
  redis: ["connection_string", "host", "port", "password"],
  postgres: ["connection_string", "host", "port", "username", "password", "database_name"],
  mysql: ["connection_string", "host", "port", "username", "password", "database_name"],
  clickhouse: ["connection_string", "host", "port", "username", "password", "database_name"],
};

interface EnvVarScopeEditorProps {
  serviceId: string;
  scope: "runtime" | "build";
  title: string;
}

function LinkVariableDialog({ serviceId, scope, onClose }: { serviceId: string; scope: "runtime" | "build"; onClose: () => void }) {
  const utils = trpc.useUtils();
  const linkableServices = trpc.envVars.listLinkableServices.useQuery({ serviceId });

  const [key, setKey] = useState("");
  const [referencesServiceId, setReferencesServiceId] = useState("");
  const [referencesField, setReferencesField] = useState<EnvVarReferenceField>("connection_string");

  const selectedService = linkableServices.data?.find((s) => s.id === referencesServiceId);
  const availableFields = selectedService ? (ENGINE_FIELDS[selectedService.engine] ?? ENGINE_FIELDS.postgres!) : Object.keys(REFERENCE_FIELD_LABELS);

  function handleServiceChange(newServiceId: string) {
    setReferencesServiceId(newServiceId);
    const newEngine = linkableServices.data?.find((s) => s.id === newServiceId)?.engine;
    const fields = newEngine ? (ENGINE_FIELDS[newEngine] ?? ENGINE_FIELDS.postgres!) : undefined;
    if (fields && !fields.includes(referencesField)) setReferencesField(fields[0]!);
  }

  const create = trpc.envVars.set.useMutation({
    onSuccess: () => {
      toast.success("Linked variable added");
      void utils.envVars.list.invalidate({ serviceId });
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Link to another service</DialogTitle>
        <DialogDescription>The value is resolved from that service at deploy time - never typed or pasted here.</DialogDescription>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!referencesServiceId) {
            toast.error("Select a service to link to");
            return;
          }
          create.mutate({ kind: "reference", serviceId, key, referencesServiceId, referencesField, scope });
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="linkKey">Variable name</FieldLabel>
            <Input id="linkKey" value={key} onChange={(e) => setKey(e.target.value)} placeholder="DB_PASSWORD_2" required />
          </Field>

          <Field>
            <FieldLabel htmlFor="linkService">Service</FieldLabel>
            <Select
              placeholder={linkableServices.data?.length === 0 ? "No database services in this project" : "Select a service"}
              selectedKey={referencesServiceId || null}
              onSelectionChange={(key) => handleServiceChange(key as string)}
              isRequired
            >
              <SelectTrigger id="linkService">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {linkableServices.data?.map((service) => (
                  <SelectItem key={service.id} id={service.id}>
                    {service.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="linkField">Field</FieldLabel>
            <Select
              selectedKey={referencesField}
              onSelectionChange={(key) => setReferencesField(key as EnvVarReferenceField)}
            >
              <SelectTrigger id="linkField">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableFields.map((value) => (
                  <SelectItem key={value} id={value}>
                    {REFERENCE_FIELD_LABELS[value as EnvVarReferenceField]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" isDisabled={create.isPending} onPress={onClose}>
              Cancel
            </Button>
            <Button type="submit" isDisabled={create.isPending}>
              {create.isPending && <Spinner className="size-4" />}
              {create.isPending ? "Linking..." : "Link variable"}
            </Button>
          </DialogFooter>
        </FieldGroup>
      </form>
    </Dialog>
  );
}

/**
 * Masked-by-default, read-only until the user explicitly reveals - editing is
 * only ever enabled on a textarea pre-filled with real decrypted values, never
 * on the masked placeholder text. Saving while masked would otherwise risk
 * silently overwriting a secret with a literal "••••••••" the moment any
 * untouched line got included in the diff.
 */
export function EnvVarScopeEditor({ serviceId, scope, title }: EnvVarScopeEditorProps) {
  const utils = trpc.useUtils();
  const list = trpc.envVars.list.useQuery({ serviceId });
  const revealAll = trpc.envVars.revealAllByScope.useMutation();
  const setBulk = trpc.envVars.setBulk.useMutation();
  const deleteVar = trpc.envVars.delete.useMutation({
    onSuccess: () => void utils.envVars.list.invalidate({ serviceId }),
    onError: (err) => toast.error(err.message),
  });

  const [revealed, setRevealed] = useState(false);
  const [draftText, setDraftText] = useState<string | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  const allScopedVars = (list.data ?? []).filter((v) => v.scope === scope);
  const plainVars = allScopedVars.filter((v) => !v.referencesServiceId);
  const linkedVars = allScopedVars.filter((v) => v.referencesServiceId);
  const maskedText = plainVars.map((v) => `${v.key}=${"•".repeat(12)}`).join("\n");

  const editable = revealed || plainVars.length === 0;
  const textareaValue = draftText ?? (editable ? "" : maskedText);

  async function handleReveal() {
    try {
      const values = await revealAll.mutateAsync({ serviceId, scope });
      setDraftText(formatEnvFileText(values));
      setRevealed(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reveal");
    }
  }

  async function handleSave() {
    const entries = parseEnvFileText(textareaValue);
    try {
      await setBulk.mutateAsync({ serviceId, scope, entries });
      await utils.envVars.list.invalidate({ serviceId });
      setDraftText(formatEnvFileText(entries));
      // Otherwise a save from the zero-vars empty state (editable via the
      // scopedVars.length===0 branch, not via `revealed`) would immediately
      // snap back to a masked read-only view the instant the list refetches
      // and scopedVars.length becomes > 0.
      setRevealed(true);
      toast.success(`${title} environment variables saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel>{title}</FieldLabel>
        <Button type="button" variant="outline" size="sm" onPress={() => setLinkDialogOpen(true)}>
          <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} />
          Link to service
        </Button>
      </div>

      {linkedVars.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {linkedVars.map((v) => (
            <div key={v.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs font-medium">{v.key}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="size-7 shrink-0"
                  isDisabled={deleteVar.isPending}
                  onPress={() => deleteVar.mutate({ serviceId, envVarId: v.id })}
                >
                  <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={2} />
                </Button>
              </div>
              <Badge variant="outline" className="w-fit max-w-full gap-1">
                <HugeiconsIcon icon={LinkSquare01Icon} size={12} strokeWidth={2} className="shrink-0" />
                <span className="truncate">
                  {v.referencesServiceName} · {v.referencesField && REFERENCE_FIELD_LABELS[v.referencesField]}
                </span>
              </Badge>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between">
        <FieldLabel className="text-muted-foreground">Plain values</FieldLabel>
        {!editable && (
          <Button type="button" variant="outline" size="sm" onPress={handleReveal} isDisabled={revealAll.isPending}>
            {revealAll.isPending ? <Spinner className="size-4" /> : <HugeiconsIcon icon={ViewIcon} size={14} strokeWidth={2} />}
            {revealAll.isPending ? "Loading..." : "Reveal to edit"}
          </Button>
        )}
      </div>

      <HighlightedEnvTextarea
        rows={8}
        readOnly={!editable}
        value={textareaValue}
        onChange={(value) => setDraftText(value)}
        placeholder={`KEY=value\nANOTHER_KEY=another value`}
      />

      {editable && (
        <Button type="button" variant="outline" size="sm" className="self-start" onPress={handleSave} isDisabled={setBulk.isPending}>
          {setBulk.isPending && <Spinner className="size-4" />}
          {setBulk.isPending ? "Saving..." : "Save"}
        </Button>
      )}

      {linkDialogOpen && <LinkVariableDialog serviceId={serviceId} scope={scope} onClose={() => setLinkDialogOpen(false)} />}
    </Field>
  );
}
