"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AiBrain01Icon, ArrowLeft02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { AI_PROVIDER_DEFAULTS, type AiProviderKind } from "@openploy/shared";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

export interface AiProviderRow {
  id: string;
  name: string;
  provider: AiProviderKind;
  apiUrl: string;
  model: string;
  isEnabled: boolean;
}

const PROVIDER_KINDS: AiProviderKind[] = ["openai", "anthropic", "openrouter"];

export function AiProviderDialog({
  onOpenChange,
  editingProvider,
  onSaved,
}: {
  onOpenChange: (open: boolean) => void;
  editingProvider: AiProviderRow | null;
  onSaved: () => void;
}) {
  const isEditing = !!editingProvider;
  const utils = trpc.useUtils();

  const [step, setStep] = useState<"pick-kind" | "configure">(isEditing ? "configure" : "pick-kind");
  const [provider, setProvider] = useState<AiProviderKind>(editingProvider?.provider ?? "openai");
  const [name, setName] = useState(editingProvider?.name ?? "");
  const [isEnabled, setIsEnabled] = useState(editingProvider?.isEnabled ?? true);
  const [apiUrl, setApiUrl] = useState(editingProvider?.apiUrl ?? "");
  const [model, setModel] = useState(editingProvider?.model ?? "");
  const [apiKey, setApiKey] = useState("");

  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [modelSearch, setModelSearch] = useState("");
  const [showModelBrowser, setShowModelBrowser] = useState(false);

  const create = trpc.aiProviders.create.useMutation({
    onSuccess: () => {
      toast.success("AI provider connected");
      void utils.aiProviders.list.invalidate();
      onSaved();
    },
    onError: (err) => toast.error(err.message),
  });

  const update = trpc.aiProviders.update.useMutation({
    onSuccess: () => {
      toast.success("AI provider updated");
      void utils.aiProviders.list.invalidate();
      onSaved();
    },
    onError: (err) => toast.error(err.message),
  });

  const testConnection = trpc.aiProviders.testConnection.useMutation({
    onSuccess: (result) => {
      setTestResult(result);
      if (result.success) toast.success("Connection successful");
      else toast.error(result.error ?? "Connection failed");
    },
    onError: (err) => {
      setTestResult({ success: false, error: err.message });
      toast.error(err.message);
    },
  });

  const testSavedConnection = trpc.aiProviders.testSavedConnection.useMutation({
    onSuccess: (result) => {
      setTestResult(result);
      if (result.success) toast.success("Connection successful");
      else toast.error(result.error ?? "Connection failed");
    },
    onError: (err) => {
      setTestResult({ success: false, error: err.message });
      toast.error(err.message);
    },
  });

  const listModels = trpc.aiProviders.listModels.useMutation({
    onSuccess: () => {
      setShowModelBrowser(true);
      setModelSearch("");
    },
    onError: (err) => toast.error(err.message),
  });

  const isSaving = create.isPending || update.isPending;
  const isTesting = testConnection.isPending || testSavedConnection.isPending;

  function pickKind(kind: AiProviderKind) {
    setProvider(kind);
    const defaults = AI_PROVIDER_DEFAULTS[kind];
    setApiUrl(defaults.apiUrl);
    setModel(defaults.model);
    setStep("configure");
  }

  function handleTest() {
    setTestResult(null);
    if (isEditing && !apiKey) {
      testSavedConnection.mutate({ id: editingProvider.id });
    } else {
      testConnection.mutate({ provider, apiUrl, model, apiKey });
    }
  }

  function handleBrowseModels() {
    setShowModelBrowser(false);
    listModels.mutate({ provider, apiUrl, apiKey });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isEditing) {
      update.mutate({ id: editingProvider.id, name, isEnabled, provider, apiUrl, model, apiKey: apiKey || undefined });
    } else {
      create.mutate({ name, provider, apiUrl, model, apiKey });
    }
  }

  const canBrowseModels = apiUrl.length > 0 && apiKey.length > 0;
  const canTest = apiUrl.length > 0 && model.length > 0 && (isEditing || apiKey.length > 0);
  const canSave = name.length > 0 && apiUrl.length > 0 && model.length > 0 && (isEditing || apiKey.length > 0);
  const filteredModels = (listModels.data ?? []).filter(
    (m) => m.id.toLowerCase().includes(modelSearch.toLowerCase()) || m.label.toLowerCase().includes(modelSearch.toLowerCase()),
  );

  return (
    <Dialog isOpen onOpenChange={onOpenChange} className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{isEditing ? `Edit ${editingProvider.name}` : "New AI provider"}</DialogTitle>
      </DialogHeader>

      {step === "pick-kind" ? (
        <ItemGroup>
          {PROVIDER_KINDS.map((kind) => (
            <Item
              key={kind}
              variant="outline"
              role="button"
              tabIndex={0}
              className="cursor-pointer"
              onClick={() => pickKind(kind)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") pickKind(kind);
              }}
            >
              <ItemMedia variant="icon">
                <HugeiconsIcon icon={AiBrain01Icon} size={18} strokeWidth={2} />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{AI_PROVIDER_DEFAULTS[kind].label}</ItemTitle>
                <ItemDescription>{AI_PROVIDER_DEFAULTS[kind].apiUrl}</ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      ) : (
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="providerName">Name</FieldLabel>
              <Input id="providerName" autoFocus value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>

            <Field>
              <FieldLabel htmlFor="apiUrl">API URL</FieldLabel>
              <Input id="apiUrl" type="url" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} required />
            </Field>

            <Field>
              <FieldLabel htmlFor="apiKey">API key</FieldLabel>
              <Input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={isEditing ? "Leave blank to keep existing" : ""}
                required={!isEditing}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="model">Model</FieldLabel>
              <div className="flex gap-2">
                <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} required className="flex-1" />
                <Button
                  type="button"
                  variant="outline"
                  isDisabled={!canBrowseModels || listModels.isPending}
                  onPress={handleBrowseModels}
                >
                  {listModels.isPending ? <Spinner className="size-4" /> : <HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={2} />}
                  Browse
                </Button>
              </div>

              {showModelBrowser && (
                <div className="mt-2 overflow-hidden rounded-2xl border">
                  <div className="border-b p-2">
                    <Input
                      autoFocus
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      placeholder="Search models..."
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {filteredModels.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">No models found.</p>
                    ) : (
                      filteredModels.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => {
                            setModel(m.id);
                            setShowModelBrowser(false);
                          }}
                        >
                          <span>{m.label}</span>
                          {m.label !== m.id && <span className="text-xs text-muted-foreground">{m.id}</span>}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </Field>

            {isEditing && (
              <Field orientation="horizontal">
                <Switch aria-label={isEnabled ? "Disable provider" : "Enable provider"} isSelected={isEnabled} onChange={setIsEnabled} />
                <FieldLabel className="font-normal">Enabled</FieldLabel>
              </Field>
            )}

            {testResult && !testResult.success && (
              <Alert variant="destructive">
                <AlertDescription>{testResult.error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter className="mt-2">
              {!isEditing && (
                <Button type="button" variant="outline" onPress={() => setStep("pick-kind")}>
                  <HugeiconsIcon icon={ArrowLeft02Icon} size={14} strokeWidth={2} />
                  Back
                </Button>
              )}
              <Button type="button" variant="outline" isDisabled={!canTest || isTesting} onPress={handleTest}>
                {isTesting && <Spinner className="size-4" />}
                {isTesting ? "Testing..." : "Test connection"}
              </Button>
              <Button type="submit" isDisabled={!canSave || isSaving}>
                {isSaving && <Spinner className="size-4" />}
                {isSaving ? "Saving..." : isEditing ? "Save changes" : "Create"}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      )}
    </Dialog>
  );
}
