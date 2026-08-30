"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { ArrowLeft02Icon, Mail01Icon, SentIcon } from "@hugeicons/core-free-icons";
import type { NotificationChannelConfig, UpdateNotificationChannelConfig } from "@openploy/shared";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

export type NotificationChannelType = "telegram" | "smtp" | "resend";

export interface NotificationChannelRow {
  id: string;
  name: string;
  type: NotificationChannelType;
  isEnabled: boolean;
  telegramChatId: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  smtpFromEmail: string | null;
  smtpFromName: string | null;
  smtpToEmail: string | null;
  resendFromEmail: string | null;
  resendFromName: string | null;
  resendToEmail: string | null;
  notifyOnDeploymentSuccess: boolean;
  notifyOnDeploymentFailed: boolean;
  notifyOnBackupSuccess: boolean;
  notifyOnBackupFailed: boolean;
}

const CHANNEL_TYPES: Array<{ type: NotificationChannelType; label: string; description: string; icon: IconSvgElement }> = [
  { type: "telegram", label: "Telegram", description: "Send messages via a Telegram bot", icon: SentIcon },
  { type: "smtp", label: "SMTP email", description: "Send email through your own SMTP server", icon: Mail01Icon },
  { type: "resend", label: "Resend", description: "Send email through the Resend API", icon: Mail01Icon },
];

const EVENT_OPTIONS = [
  { key: "notifyOnDeploymentSuccess", label: "Deployment succeeded" },
  { key: "notifyOnDeploymentFailed", label: "Deployment failed" },
  { key: "notifyOnBackupSuccess", label: "Backup succeeded" },
  { key: "notifyOnBackupFailed", label: "Backup failed" },
] as const;

export function NotificationChannelDialog({
  onOpenChange,
  editingChannel,
  onSaved,
}: {
  onOpenChange: (open: boolean) => void;
  editingChannel: NotificationChannelRow | null;
  onSaved: () => void;
}) {
  const isEditing = !!editingChannel;
  const utils = trpc.useUtils();

  const [step, setStep] = useState<"pick-type" | "configure">(isEditing ? "configure" : "pick-type");
  const [type, setType] = useState<NotificationChannelType>(editingChannel?.type ?? "telegram");
  const [name, setName] = useState(editingChannel?.name ?? "");
  const [isEnabled, setIsEnabled] = useState(editingChannel?.isEnabled ?? true);

  const [chatId, setChatId] = useState(editingChannel?.telegramChatId ?? "");
  const [botToken, setBotToken] = useState("");

  const [smtpHost, setSmtpHost] = useState(editingChannel?.smtpHost ?? "");
  const [smtpPort, setSmtpPort] = useState(editingChannel?.smtpPort ? String(editingChannel.smtpPort) : "587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUsername, setSmtpUsername] = useState(editingChannel?.smtpUsername ?? "");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFromEmail, setSmtpFromEmail] = useState(editingChannel?.smtpFromEmail ?? "");
  const [smtpFromName, setSmtpFromName] = useState(editingChannel?.smtpFromName ?? "Openploy");
  const [smtpToEmail, setSmtpToEmail] = useState(editingChannel?.smtpToEmail ?? "");

  const [resendApiKey, setResendApiKey] = useState("");
  const [resendFromEmail, setResendFromEmail] = useState(editingChannel?.resendFromEmail ?? "");
  const [resendFromName, setResendFromName] = useState(editingChannel?.resendFromName ?? "Openploy");
  const [resendToEmail, setResendToEmail] = useState(editingChannel?.resendToEmail ?? "");

  const [events, setEvents] = useState({
    notifyOnDeploymentSuccess: editingChannel?.notifyOnDeploymentSuccess ?? false,
    notifyOnDeploymentFailed: editingChannel?.notifyOnDeploymentFailed ?? true,
    notifyOnBackupSuccess: editingChannel?.notifyOnBackupSuccess ?? false,
    notifyOnBackupFailed: editingChannel?.notifyOnBackupFailed ?? true,
  });

  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  const create = trpc.notifications.create.useMutation({
    onSuccess: () => {
      toast.success("Notification channel created");
      void utils.notifications.list.invalidate();
      onSaved();
    },
    onError: (err) => toast.error(err.message),
  });

  const update = trpc.notifications.update.useMutation({
    onSuccess: () => {
      toast.success("Notification channel updated");
      void utils.notifications.list.invalidate();
      onSaved();
    },
    onError: (err) => toast.error(err.message),
  });

  const testConnection = trpc.notifications.testConnection.useMutation({
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

  const testSavedConnection = trpc.notifications.testSavedConnection.useMutation({
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

  const isSaving = create.isPending || update.isPending;
  const isTesting = testConnection.isPending || testSavedConnection.isPending;

  function isSecretFilled(): boolean {
    if (type === "telegram") return botToken.length > 0;
    if (type === "smtp") return smtpPassword.length > 0;
    return resendApiKey.length > 0;
  }

  function requiredFieldsFilled(): boolean {
    if (type === "telegram") return chatId.length > 0;
    if (type === "smtp") return smtpHost.length > 0 && smtpUsername.length > 0 && smtpFromEmail.length > 0 && smtpFromName.length > 0 && smtpToEmail.length > 0;
    return resendFromEmail.length > 0 && resendFromName.length > 0 && resendToEmail.length > 0;
  }

  function buildRawConfig(): NotificationChannelConfig {
    if (type === "telegram") return { kind: "telegram", chatId, botToken };
    if (type === "smtp") {
      return {
        kind: "smtp",
        host: smtpHost,
        port: Number(smtpPort),
        secure: smtpSecure,
        username: smtpUsername,
        password: smtpPassword,
        fromEmail: smtpFromEmail,
        fromName: smtpFromName,
        toEmail: smtpToEmail,
      };
    }
    return { kind: "resend", apiKey: resendApiKey, fromEmail: resendFromEmail, fromName: resendFromName, toEmail: resendToEmail };
  }

  function buildUpdateConfig(): UpdateNotificationChannelConfig {
    if (type === "telegram") return { kind: "telegram", chatId, botToken: botToken || undefined };
    if (type === "smtp") {
      return {
        kind: "smtp",
        host: smtpHost,
        port: Number(smtpPort),
        secure: smtpSecure,
        username: smtpUsername,
        password: smtpPassword || undefined,
        fromEmail: smtpFromEmail,
        fromName: smtpFromName,
        toEmail: smtpToEmail,
      };
    }
    return {
      kind: "resend",
      apiKey: resendApiKey || undefined,
      fromEmail: resendFromEmail,
      fromName: resendFromName,
      toEmail: resendToEmail,
    };
  }

  function handleTest() {
    setTestResult(null);
    if (isEditing && !isSecretFilled()) {
      testSavedConnection.mutate({ id: editingChannel.id });
    } else {
      testConnection.mutate({ config: buildRawConfig() });
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isEditing) {
      update.mutate({
        id: editingChannel.id,
        name,
        isEnabled,
        config: buildUpdateConfig(),
        ...events,
      });
    } else {
      create.mutate({ name, config: buildRawConfig(), ...events });
    }
  }

  const activeType = CHANNEL_TYPES.find((t) => t.type === type);
  const canTest = requiredFieldsFilled() && (isEditing || isSecretFilled());
  const canSave = name.length > 0 && requiredFieldsFilled() && (isEditing || isSecretFilled());

  return (
    <Dialog isOpen onOpenChange={onOpenChange} className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{isEditing ? `Edit ${editingChannel.name}` : activeType ? `New ${activeType.label} channel` : "New notification channel"}</DialogTitle>
      </DialogHeader>

      {step === "pick-type" ? (
        <ItemGroup>
          {CHANNEL_TYPES.map((option) => (
            <Item
              key={option.type}
              variant="outline"
              role="button"
              tabIndex={0}
              className="cursor-pointer"
              onClick={() => {
                setType(option.type);
                setStep("configure");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setType(option.type);
                  setStep("configure");
                }
              }}
            >
              <ItemMedia variant="icon">
                <HugeiconsIcon icon={option.icon} size={18} strokeWidth={2} />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{option.label}</ItemTitle>
                <ItemDescription>{option.description}</ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      ) : (
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="channelName">Name</FieldLabel>
              <Input id="channelName" autoFocus value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>

            {type === "telegram" && (
              <>
                <Field>
                  <FieldLabel htmlFor="chatId">Chat ID</FieldLabel>
                  <Input id="chatId" value={chatId} onChange={(e) => setChatId(e.target.value)} required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="botToken">Bot token</FieldLabel>
                  <Input
                    id="botToken"
                    type="password"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder={isEditing ? "Leave blank to keep existing" : ""}
                    required={!isEditing}
                  />
                </Field>
                <p className="text-xs text-muted-foreground">
                  Create a bot with @BotFather to get a token, then message @userinfobot to find your chat ID.
                </p>
              </>
            )}

            {type === "smtp" && (
              <>
                <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                  <Field className="col-span-2">
                    <FieldLabel htmlFor="smtpHost">Host</FieldLabel>
                    <Input id="smtpHost" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="smtpPort">Port</FieldLabel>
                    <Input id="smtpPort" type="number" min={1} max={65535} value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} required />
                  </Field>
                  <Field orientation="horizontal" className="items-end pb-2">
                    <Checkbox id="smtpSecure" isSelected={smtpSecure} onChange={setSmtpSecure} />
                    <FieldLabel htmlFor="smtpSecure" className="font-normal">
                      Use TLS
                    </FieldLabel>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="smtpUsername">Username</FieldLabel>
                    <Input id="smtpUsername" value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="smtpPassword">Password</FieldLabel>
                    <Input
                      id="smtpPassword"
                      type="password"
                      value={smtpPassword}
                      onChange={(e) => setSmtpPassword(e.target.value)}
                      placeholder={isEditing ? "Leave blank to keep existing" : ""}
                      required={!isEditing}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="smtpFromEmail">From email</FieldLabel>
                    <Input id="smtpFromEmail" type="email" value={smtpFromEmail} onChange={(e) => setSmtpFromEmail(e.target.value)} required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="smtpFromName">From name</FieldLabel>
                    <Input id="smtpFromName" value={smtpFromName} onChange={(e) => setSmtpFromName(e.target.value)} required />
                  </Field>
                  <Field className="col-span-2">
                    <FieldLabel htmlFor="smtpToEmail">Send alerts to</FieldLabel>
                    <Input id="smtpToEmail" type="email" value={smtpToEmail} onChange={(e) => setSmtpToEmail(e.target.value)} required />
                  </Field>
                </div>
              </>
            )}

            {type === "resend" && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                <Field className="col-span-2">
                  <FieldLabel htmlFor="resendApiKey">API key</FieldLabel>
                  <Input
                    id="resendApiKey"
                    type="password"
                    value={resendApiKey}
                    onChange={(e) => setResendApiKey(e.target.value)}
                    placeholder={isEditing ? "Leave blank to keep existing" : "re_..."}
                    required={!isEditing}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="resendFromEmail">From email</FieldLabel>
                  <Input id="resendFromEmail" type="email" value={resendFromEmail} onChange={(e) => setResendFromEmail(e.target.value)} required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="resendFromName">From name</FieldLabel>
                  <Input id="resendFromName" value={resendFromName} onChange={(e) => setResendFromName(e.target.value)} required />
                </Field>
                <Field className="col-span-2">
                  <FieldLabel htmlFor="resendToEmail">Send alerts to</FieldLabel>
                  <Input id="resendToEmail" type="email" value={resendToEmail} onChange={(e) => setResendToEmail(e.target.value)} required />
                </Field>
              </div>
            )}

            {isEditing && (
              <Field orientation="horizontal">
                <Switch aria-label={isEnabled ? "Disable channel" : "Enable channel"} isSelected={isEnabled} onChange={setIsEnabled} />
                <FieldLabel className="font-normal">Enabled</FieldLabel>
              </Field>
            )}

            <div>
              <FieldLabel className="mb-3">Notify on</FieldLabel>
              <div className="grid grid-cols-2 gap-3">
                {EVENT_OPTIONS.map((option) => (
                  <Field key={option.key} orientation="horizontal">
                    <Checkbox
                      id={option.key}
                      isSelected={events[option.key]}
                      onChange={(checked) => setEvents((prev) => ({ ...prev, [option.key]: checked }))}
                    />
                    <FieldLabel htmlFor={option.key} className="font-normal">
                      {option.label}
                    </FieldLabel>
                  </Field>
                ))}
              </div>
            </div>

            {testResult && !testResult.success && (
              <Alert variant="destructive">
                <AlertDescription>{testResult.error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter className="mt-2">
              {!isEditing && (
                <Button type="button" variant="outline" onPress={() => setStep("pick-type")}>
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
