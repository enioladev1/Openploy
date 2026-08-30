"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CloudServerIcon, Delete02Icon, ReloadIcon } from "@hugeicons/core-free-icons";
import type { BackupStorageInput } from "@openploy/shared";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/status-badge";

type Provider = "aws-s3" | "cloudflare-r2" | "s3-compatible";

const PROVIDER_LABELS: Record<Provider, string> = {
  "aws-s3": "Amazon S3",
  "cloudflare-r2": "Cloudflare R2",
  "s3-compatible": "Other S3-compatible",
};

export function BackupsPanel() {
  const utils = trpc.useUtils();
  const configs = trpc.backups.list.useQuery();

  const [provider, setProvider] = useState<Provider>("aws-s3");
  const [name, setName] = useState("");
  const [bucket, setBucket] = useState("");
  const [pathPrefix, setPathPrefix] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [region, setRegion] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [forcePathStyle, setForcePathStyle] = useState(true);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  function buildInput(): BackupStorageInput {
    const base = { name, endpoint, bucket, pathPrefix, accessKeyId, secretAccessKey };
    if (provider === "aws-s3") return { ...base, provider, region };
    if (provider === "cloudflare-r2") return { ...base, provider, region: region || "auto" };
    return { ...base, provider, region: region || "auto", forcePathStyle };
  }

  const testConnection = trpc.backups.testConnection.useMutation({
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

  const create = trpc.backups.create.useMutation({
    onSuccess: () => {
      toast.success("Backup storage connected");
      setName("");
      setBucket("");
      setPathPrefix("");
      setAccessKeyId("");
      setSecretAccessKey("");
      setRegion("");
      setEndpoint("");
      setTestResult(null);
      void utils.backups.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const retest = trpc.backups.retest.useMutation({
    onSuccess: (result) => {
      if (result.success) toast.success("Connection successful");
      else toast.error(result.error ?? "Connection failed");
      void utils.backups.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteConfig = trpc.backups.delete.useMutation({
    onSuccess: () => {
      toast.success("Backup storage removed");
      setDeleteTarget(null);
      void utils.backups.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>Connect storage</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(buildInput());
            }}
          >
            <FieldGroup>
              <div className="grid grid-cols-2 gap-x-6 gap-y-6">
                <Field>
                  <FieldLabel htmlFor="provider">Provider</FieldLabel>
                  <Select
                    selectedKey={provider}
                    onSelectionChange={(key) => {
                      setProvider(key as Provider);
                      setTestResult(null);
                    }}
                  >
                    <SelectTrigger id="provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PROVIDER_LABELS) as Provider[]).map((value) => (
                        <SelectItem key={value} id={value}>
                          {PROVIDER_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </Field>

                <Field>
                  <FieldLabel htmlFor="endpoint">Endpoint URL</FieldLabel>
                  <Input
                    id="endpoint"
                    type="url"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    placeholder={
                      provider === "aws-s3"
                        ? "https://s3.<region>.amazonaws.com"
                        : provider === "cloudflare-r2"
                          ? "https://<account-id>.r2.cloudflarestorage.com"
                          : "https://s3.example.com"
                    }
                    required
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="region">Region</FieldLabel>
                  <Input
                    id="region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder={provider === "aws-s3" ? "us-east-1" : "auto"}
                    required={provider === "aws-s3"}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="bucket">Bucket</FieldLabel>
                  <Input id="bucket" value={bucket} onChange={(e) => setBucket(e.target.value)} required />
                </Field>

                <Field>
                  <FieldLabel htmlFor="pathPrefix">Path prefix (optional)</FieldLabel>
                  <Input
                    id="pathPrefix"
                    value={pathPrefix}
                    onChange={(e) => setPathPrefix(e.target.value)}
                    placeholder="openploy-backups"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="accessKeyId">Access key ID</FieldLabel>
                  <Input id="accessKeyId" value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} required />
                </Field>

                <Field>
                  <FieldLabel htmlFor="secretAccessKey">Secret access key</FieldLabel>
                  <Input
                    id="secretAccessKey"
                    type="password"
                    value={secretAccessKey}
                    onChange={(e) => setSecretAccessKey(e.target.value)}
                    required
                  />
                </Field>

                {provider === "s3-compatible" && (
                  <Field orientation="horizontal" className="col-span-2">
                    <Checkbox id="forcePathStyle" isSelected={forcePathStyle} onChange={setForcePathStyle} />
                    <FieldLabel htmlFor="forcePathStyle" className="font-normal">
                      Use path-style addressing (required by most self-hosted S3 servers, e.g. MinIO)
                    </FieldLabel>
                  </Field>
                )}
              </div>

              {testResult && !testResult.success && (
                <Alert variant="destructive">
                  <AlertDescription>{testResult.error}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  isDisabled={testConnection.isPending || !bucket || !accessKeyId || !secretAccessKey}
                  onPress={() => {
                    setTestResult(null);
                    testConnection.mutate(buildInput());
                  }}
                >
                  {testConnection.isPending && <Spinner className="size-4" />}
                  {testConnection.isPending ? "Testing..." : "Test connection"}
                </Button>
                <Button type="submit" isDisabled={create.isPending}>
                  {create.isPending && <Spinner className="size-4" />}
                  {create.isPending ? "Connecting..." : "Connect"}
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected storage</CardTitle>
        </CardHeader>
        <CardContent>
          {configs.data?.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={CloudServerIcon} size={20} strokeWidth={2} />
                </EmptyMedia>
                <EmptyTitle>No backup storage connected</EmptyTitle>
                <EmptyDescription>Connect an S3-compatible destination above.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ItemGroup>
              {configs.data?.map((config) => (
                <Item key={config.id} variant="outline" size="sm">
                  <ItemContent>
                    <ItemTitle>
                      {config.name}
                      <StatusBadge status={config.lastVerifyError ? "failed" : config.lastVerifiedAt ? "active" : "pending"} />
                    </ItemTitle>
                    <ItemDescription>
                      {PROVIDER_LABELS[config.provider as Provider]} - {config.bucket}
                      {config.lastVerifyError && `- ${config.lastVerifyError}`}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      variant="outline"
                      size="sm"
                      isDisabled={retest.isPending && retest.variables?.id === config.id}
                      onPress={() => retest.mutate({ id: config.id })}
                    >
                      {retest.isPending && retest.variables?.id === config.id ? (
                        <Spinner className="size-4" />
                      ) : (
                        <HugeiconsIcon icon={ReloadIcon} size={14} strokeWidth={2} />
                      )}
                      Retest
                    </Button>
                    <Button variant="outline" size="sm" onPress={() => setDeleteTarget({ id: config.id, name: config.name })}>
                      <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
                      Delete
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </CardContent>
      </Card>

      {deleteTarget && (
        <Dialog isOpen onOpenChange={(open) => !open && setDeleteTarget(null)} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete backup storage</DialogTitle>
            <DialogDescription>
              Remove <strong>{deleteTarget.name}</strong>? This only disconnects the storage config - it does not delete
              anything already stored in the bucket.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" isDisabled={deleteConfig.isPending} onPress={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" isDisabled={deleteConfig.isPending} onPress={() => deleteConfig.mutate({ id: deleteTarget.id })}>
              {deleteConfig.isPending && <Spinner className="size-4" />}
              {deleteConfig.isPending ? "Removing..." : "Confirm delete"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
}
