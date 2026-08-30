"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon, Delete02Icon, ReloadIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

export function DomainsPanel({ serviceId }: { serviceId: string }) {
  const utils = trpc.useUtils();
  const domains = trpc.domains.list.useQuery({ serviceId });
  const createDomain = trpc.domains.create.useMutation({
    onSuccess: () => {
      toast.success("Domain added");
      setHost("");
      void utils.domains.list.invalidate({ serviceId });
    },
    onError: (err) => toast.error(err.message),
  });
  const generateNipIo = trpc.domains.generateNipIo.useMutation({
    onSuccess: () => {
      toast.success("nip.io domain generated");
      void utils.domains.list.invalidate({ serviceId });
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteDomain = trpc.domains.delete.useMutation({
    onSuccess: () => {
      toast.success("Domain deleted");
      void utils.domains.list.invalidate({ serviceId });
    },
    onError: (err) => toast.error(err.message),
  });
  const recheckCertificate = trpc.domains.recheckCertificate.useMutation({
    onSuccess: () => {
      toast.success("Certificate status rechecked");
      void utils.domains.list.invalidate({ serviceId });
    },
    onError: (err) => toast.error(err.message),
  });

  const [mode, setMode] = useState<"custom" | "nip">("custom");
  const [host, setHost] = useState("");
  const [targetPort, setTargetPort] = useState("3000");
  const [enableTls, setEnableTls] = useState(true);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Domains</CardTitle>
      </CardHeader>
      <CardContent>
        {domains.data && domains.data.length > 0 && (
          <ItemGroup className="mb-4">
            {domains.data.map((domain) => {
              const issued = domain.certificateStatus === "issued";
              const url = `${issued ? "https://" : "http://"}${domain.host}${domain.path !== "/" ? domain.path : ""}`;
              return (
                <Item key={domain.id} variant="outline" size="sm">
                  <ItemContent>
                    <ItemTitle className="flex-wrap font-normal">
                      {url}
                      <Badge variant="outline">:{domain.targetPort}</Badge>
                      {domain.certificateStatus && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          TLS: <StatusBadge status={domain.certificateStatus} />
                        </span>
                      )}
                    </ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    <LinkButton
                      variant="outline"
                      size="icon-sm"
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${domain.host} in a new tab`}
                    >
                      <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} strokeWidth={2} />
                    </LinkButton>
                    {(domain.certificateStatus === "pending" || domain.certificateStatus === "failed") && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        isDisabled={recheckCertificate.isPending}
                        onPress={() => recheckCertificate.mutate({ serviceId, domainId: domain.id })}
                      >
                        {recheckCertificate.isPending ? (
                          <Spinner className="size-4" />
                        ) : (
                          <HugeiconsIcon icon={ReloadIcon} size={14} strokeWidth={2} />
                        )}
                        Recheck TLS
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      isDisabled={deleteDomain.isPending}
                      onPress={() => deleteDomain.mutate({ serviceId, domainId: domain.id })}
                    >
                      {deleteDomain.isPending ? (
                        <Spinner className="size-4" />
                      ) : (
                        <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
                      )}
                      Delete
                    </Button>
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "custom") {
              createDomain.mutate({ serviceId, host, targetPort: Number(targetPort), enableTls, isPrimary: false });
            } else {
              generateNipIo.mutate({ serviceId, targetPort: Number(targetPort), enableTls });
            }
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel>Domain source</FieldLabel>
              <RadioGroup value={mode} onChange={(value) => setMode(value as typeof mode)}>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="custom" />
                  Custom domain
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="nip" />
                  Generate a nip.io domain
                </label>
              </RadioGroup>
            </Field>

            {mode === "custom" && (
              <Field>
                <FieldLabel htmlFor="host">Domain</FieldLabel>
                <Input id="host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="app.example.com" required />
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="targetPort">Port</FieldLabel>
              <Input id="targetPort" type="number" value={targetPort} onChange={(e) => setTargetPort(e.target.value)} required />
            </Field>

            <Field orientation="horizontal">
              <Switch id="enableTls" isSelected={enableTls} onChange={setEnableTls} />
              <FieldLabel htmlFor="enableTls" className="font-normal">
                HTTPS (Let&apos;s Encrypt)
              </FieldLabel>
            </Field>

            {mode === "custom" ? (
              <Button type="submit" isDisabled={createDomain.isPending} className="self-start">
                {createDomain.isPending && <Spinner className="size-4" />}
                {createDomain.isPending ? "Adding..." : "Add domain"}
              </Button>
            ) : (
              <Button type="submit" isDisabled={generateNipIo.isPending} className="self-start">
                {generateNipIo.isPending && <Spinner className="size-4" />}
                {generateNipIo.isPending ? "Generating..." : "Generate nip.io domain"}
              </Button>
            )}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
