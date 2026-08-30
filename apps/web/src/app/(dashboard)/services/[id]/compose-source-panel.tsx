"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon, ClipboardPasteIcon, GithubIcon, ViewIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { ComposePreviewModal } from "@/components/compose-preview-modal";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface ComposeSourcePanelProps {
  serviceId: string;
  detail: {
    sourceType: "repo" | "raw" | null;
    githubInstallationId: string | null;
    repoOwner: string | null;
    repoName: string | null;
    branch: string | null;
    composeFilePath: string | null;
    rawComposeContent: string | null;
  };
}

export function ComposeSourcePanel({ serviceId, detail }: ComposeSourcePanelProps) {
  const utils = trpc.useUtils();

  const [sourceType, setSourceType] = useState<"repo" | "raw">(detail.sourceType ?? "raw");
  const [rawComposeContent, setRawComposeContent] = useState(
    detail.rawComposeContent ?? "services:\n  web:\n    image: nginx:latest\n",
  );
  const [installationId, setInstallationId] = useState(detail.githubInstallationId ?? "");
  const [repoFullName, setRepoFullName] = useState(
    detail.repoOwner && detail.repoName ? `${detail.repoOwner}/${detail.repoName}` : "",
  );
  const [branch, setBranch] = useState(detail.branch ?? "");
  const [composeFilePath, setComposeFilePath] = useState(detail.composeFilePath ?? "docker-compose.yml");
  const [showPreview, setShowPreview] = useState(false);

  const installations = trpc.github.listInstallations.useQuery(undefined, { enabled: sourceType === "repo" });
  const repos = trpc.github.listRepos.useQuery(
    { installationId },
    { enabled: sourceType === "repo" && installationId.length > 0 },
  );
  const [repoOwner, repoName] = repoFullName.split("/");
  const branches = trpc.github.listBranches.useQuery(
    { installationId, owner: repoOwner ?? "", repo: repoName ?? "" },
    { enabled: sourceType === "repo" && Boolean(installationId && repoOwner && repoName) },
  );

  const composeFile = trpc.github.getFileContent.useQuery(
    { installationId, owner: repoOwner ?? "", repo: repoName ?? "", path: composeFilePath, ref: branch },
    {
      enabled:
        sourceType === "repo" &&
        Boolean(installationId && repoOwner && repoName && branch && composeFilePath.trim()),
      retry: false,
    },
  );

  const setSource = trpc.services.setComposeSource.useMutation({
    onSuccess: () => {
      toast.success("Compose source saved");
      void utils.services.getComposeDetail.invalidate({ serviceId });
    },
    onError: (err) => toast.error(err.message),
  });

  const isConfigured = detail.sourceType !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Source</CardTitle>
        {detail.sourceType === "repo" && detail.repoOwner && detail.repoName && (
          <CardAction>
            <LinkButton
              variant="outline"
              size="sm"
              href={`https://github.com/${detail.repoOwner}/${detail.repoName}${detail.branch ? `/tree/${detail.branch}` : ""}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View repository
              <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} strokeWidth={2} />
            </LinkButton>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {!isConfigured && (
          <FieldDescription className="mb-4">
            Provide a docker-compose.yml, either pasted directly or from a GitHub repository.
          </FieldDescription>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (sourceType === "raw") {
              setSource.mutate({ serviceId, sourceType, rawComposeContent });
            } else {
              if (!repoOwner || !repoName) return;
              setSource.mutate({
                serviceId,
                sourceType,
                githubInstallationId: installationId,
                repoOwner,
                repoName,
                branch,
                composeFilePath,
              });
            }
          }}
        >
          <FieldGroup>
            <Tabs selectedKey={sourceType} onSelectionChange={(key) => setSourceType(key as typeof sourceType)}>
              <TabsList aria-label="Source type" className="mb-4">
                <TabsTrigger id="raw" className="gap-1.5">
                  <HugeiconsIcon icon={ClipboardPasteIcon} size={14} strokeWidth={2} />
                  Paste compose file
                </TabsTrigger>
                <TabsTrigger id="repo" className="gap-1.5">
                  <HugeiconsIcon icon={GithubIcon} size={14} strokeWidth={2} />
                  From GitHub repo
                </TabsTrigger>
              </TabsList>

              <TabsContent id="raw">
                <Field>
                  <FieldLabel htmlFor="rawCompose">docker-compose.yml</FieldLabel>
                  <Textarea
                    id="rawCompose"
                    rows={12}
                    value={rawComposeContent}
                    onChange={(e) => setRawComposeContent(e.target.value)}
                    required
                    className="font-mono text-xs"
                  />
                </Field>
              </TabsContent>

              <TabsContent id="repo">
                <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="installation">GitHub account</FieldLabel>
                    <Select
                      placeholder="Select an account"
                      selectedKey={installationId || null}
                      onSelectionChange={(key) => {
                        setInstallationId(key as string);
                        setRepoFullName("");
                        setBranch("");
                      }}
                      isRequired
                    >
                      <SelectTrigger id="installation">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {installations.data?.map((installation) => (
                          <SelectItem key={installation.id} id={installation.id}>
                            {installation.accountLogin}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  {installationId && (
                    <Field>
                      <FieldLabel htmlFor="repo">Repository</FieldLabel>
                      <Select
                        placeholder={repos.isLoading ? "Loading..." : "Select a repository"}
                        selectedKey={repoFullName || null}
                        onSelectionChange={(key) => {
                          setRepoFullName(key as string);
                          setBranch("");
                        }}
                        isRequired
                      >
                        <SelectTrigger id="repo">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {repos.data?.map((repo) => (
                            <SelectItem key={repo.fullName} id={repo.fullName}>
                              {repo.fullName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}

                  {repoFullName && (
                    <Field>
                      <FieldLabel htmlFor="branch">Branch</FieldLabel>
                      <Select
                        placeholder={branches.isLoading ? "Loading..." : "Select a branch"}
                        selectedKey={branch || null}
                        onSelectionChange={(key) => setBranch(key as string)}
                        isRequired
                      >
                        <SelectTrigger id="branch">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.data?.map((b) => (
                            <SelectItem key={b} id={b}>
                              {b}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}

                  <Field>
                    <FieldLabel htmlFor="composeFilePath">Compose file path</FieldLabel>
                    <Input id="composeFilePath" value={composeFilePath} onChange={(e) => setComposeFilePath(e.target.value)} />
                    {composeFile.isFetching && <FieldDescription>Fetching compose file...</FieldDescription>}
                    {composeFile.isError && (
                      <p className="text-sm text-destructive">Could not fetch compose file: {composeFile.error.message}</p>
                    )}
                    {composeFile.data && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 self-start"
                        onPress={() => setShowPreview(true)}
                      >
                        <HugeiconsIcon icon={ViewIcon} size={14} strokeWidth={2} />
                        Preview compose code
                      </Button>
                    )}
                  </Field>
                </div>
              </TabsContent>
            </Tabs>

            {showPreview && composeFile.data && (
              <ComposePreviewModal title={composeFilePath} content={composeFile.data} onClose={() => setShowPreview(false)} />
            )}

            <Button type="submit" isDisabled={setSource.isPending} className="self-start">
              {setSource.isPending && <Spinner className="size-4" />}
              {setSource.isPending ? "Saving..." : isConfigured ? "Save changes" : "Save source"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
