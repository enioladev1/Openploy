"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, GlobeIcon, ReloadIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/status-badge";
import { Switch } from "@/components/ui/switch";

export function DashboardDomainPanel({ publicIp }: { publicIp: string | null }) {
  const utils = trpc.useUtils();
  const domain = trpc.platformDomain.get.useQuery(undefined, { refetchInterval: 5000 });
  const acmeEmail = trpc.platformDomain.getAcmeEmail.useQuery();

  const [host, setHost] = useState("");
  const [enableTls, setEnableTls] = useState(true);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [email, setEmail] = useState("");

  const setDomain = trpc.platformDomain.set.useMutation({
    onSuccess: () => {
      toast.success("Dashboard domain saved");
      setHost("");
      void utils.platformDomain.get.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const recheck = trpc.platformDomain.recheckCertificate.useMutation({
    onSuccess: () => {
      toast.success("Certificate status rechecked");
      void utils.platformDomain.get.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = trpc.platformDomain.remove.useMutation({
    onSuccess: () => {
      toast.success("Dashboard domain removed");
      setRemoveDialogOpen(false);
      void utils.platformDomain.get.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Prefill once the current value loads - a plain useState default can't see
  // it yet since the query hasn't resolved on first render.
  useEffect(() => {
    if (acmeEmail.data?.email) setEmail(acmeEmail.data.email);
  }, [acmeEmail.data?.email]);

  const updateAcmeEmail = trpc.platformDomain.updateAcmeEmail.useMutation({
    onSuccess: () => {
      toast.success("Let's Encrypt email updated");
      void utils.platformDomain.getAcmeEmail.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>Current domain</CardTitle>
        </CardHeader>
        <CardContent>
          {domain.data ? (
            <ItemGroup>
              <Item variant="outline" size="sm">
                <ItemMedia variant="icon">
                  <HugeiconsIcon icon={GlobeIcon} size={16} strokeWidth={2} />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    {domain.data.host}
                    {domain.data.certificateStatus && <StatusBadge status={domain.data.certificateStatus} />}
                  </ItemTitle>
                  <ItemDescription>
                    {domain.data.certificateId
                      ? "HTTPS via Let's Encrypt"
                      : "HTTP only - no certificate requested"}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  {(domain.data.certificateStatus === "pending" || domain.data.certificateStatus === "failed") && (
                    <Button variant="outline" size="sm" isDisabled={recheck.isPending} onPress={() => recheck.mutate()}>
                      {recheck.isPending ? <Spinner className="size-4" /> : <HugeiconsIcon icon={ReloadIcon} size={14} strokeWidth={2} />}
                      Recheck TLS
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onPress={() => setRemoveDialogOpen(true)}>
                    <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
                    Remove
                  </Button>
                </ItemActions>
              </Item>
            </ItemGroup>
          ) : (
            <p className="text-sm text-muted-foreground">
              No dashboard domain set yet - the dashboard is only reachable directly, not via a custom domain.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{domain.data ? "Change domain" : "Set a domain"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setDomain.mutate({ host, enableTls });
            }}
            className="max-w-lg"
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="host">Domain</FieldLabel>
                <Input id="host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="dashboard.example.com" required />
                <FieldDescription>
                  Point an A record for this domain at your server{publicIp ? ` (${publicIp})` : ""} before saving, so the
                  certificate challenge can succeed.
                </FieldDescription>
              </Field>

              <Field orientation="horizontal">
                <Switch id="enableTls" isSelected={enableTls} onChange={setEnableTls} />
                <FieldLabel htmlFor="enableTls" className="font-normal">
                  HTTPS (Let&apos;s Encrypt)
                </FieldLabel>
              </Field>

              <Button type="submit" isDisabled={setDomain.isPending} className="self-start">
                {setDomain.isPending && <Spinner className="size-4" />}
                {setDomain.isPending ? "Saving..." : "Save domain"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Let&apos;s Encrypt notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateAcmeEmail.mutate({ email });
            }}
            className="max-w-lg"
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="acmeEmail">Email</FieldLabel>
                <Input
                  id="acmeEmail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
                <FieldDescription>
                  Used by Let&apos;s Encrypt to contact you if a certificate renewal ever fails. Set automatically from the
                  first admin&apos;s signup email - change it here if needed.
                </FieldDescription>
              </Field>

              <Button type="submit" isDisabled={updateAcmeEmail.isPending} className="self-start">
                {updateAcmeEmail.isPending && <Spinner className="size-4" />}
                {updateAcmeEmail.isPending ? "Saving..." : "Update email"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {removeDialogOpen && (
        <Dialog isOpen onOpenChange={setRemoveDialogOpen} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove dashboard domain</DialogTitle>
            <DialogDescription>
              The dashboard will no longer be reachable at <strong>{domain.data?.host}</strong>. Make sure you have another
              way to reach it before removing this.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" isDisabled={remove.isPending} onPress={() => setRemoveDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" isDisabled={remove.isPending} onPress={() => remove.mutate()}>
              {remove.isPending && <Spinner className="size-4" />}
              {remove.isPending ? "Removing..." : "Confirm remove"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
}
