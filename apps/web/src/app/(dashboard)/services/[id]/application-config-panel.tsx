"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon, FileZipIcon, GithubIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { trpc } from "@/app/providers";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StaticSourceForm } from "./static-source-form";

interface ApplicationConfigPanelProps {
  serviceId: string;
  detail: {
    sourceType: "repo" | "static" | null;
    githubInstallationId: string | null;
    repoOwner: string | null;
    repoName: string | null;
    branch: string | null;
    buildMethod: "dockerfile" | "heroku-buildpacks";
    dockerfileDirectory: string;
    autoDeployOnPush: boolean;
  };
}

export function ApplicationConfigPanel({ serviceId, detail }: ApplicationConfigPanelProps) {
  const utils = trpc.useUtils();

  const [sourceType, setSourceType] = useState<"repo" | "static">(detail.sourceType ?? "repo");

  const [installationId, setInstallationId] = useState(detail.githubInstallationId ?? "");
  const [repoFullName, setRepoFullName] = useState(
    detail.repoOwner && detail.repoName ? `${detail.repoOwner}/${detail.repoName}` : "",
  );
  const [branch, setBranch] = useState(detail.branch ?? "");
  const [buildMethod, setBuildMethod] = useState<"dockerfile" | "heroku-buildpacks">(detail.buildMethod);
  const [dockerfileDirectory, setDockerfileDirectory] = useState(detail.dockerfileDirectory);
  const [autoDeployOnPush, setAutoDeployOnPush] = useState(detail.autoDeployOnPush);

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

  const setConfig = trpc.services.setApplicationConfig.useMutation({
    onSuccess: () => {
      toast.success("Application configuration saved");
      void utils.services.getApplicationDetail.invalidate({ serviceId });
    },
    onError: (err) => toast.error(err.message),
  });

  const isConfigured = Boolean(detail.sourceType === "repo" ? detail.repoOwner && detail.repoName && detail.branch : detail.sourceType);

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
          <FieldDescription className="mb-4">Connect a repository or upload a zip to enable deployments.</FieldDescription>
        )}

        <Tabs selectedKey={sourceType} onSelectionChange={(key) => setSourceType(key as typeof sourceType)}>
          <TabsList aria-label="Source type" className="mb-4">
            <TabsTrigger id="repo" className="gap-1.5">
              <HugeiconsIcon icon={GithubIcon} size={14} strokeWidth={2} />
              GitHub
            </TabsTrigger>
            <TabsTrigger id="static" className="gap-1.5">
              <HugeiconsIcon icon={FileZipIcon} size={14} strokeWidth={2} />
              Static files
            </TabsTrigger>
          </TabsList>

          <TabsContent id="repo">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!repoOwner || !repoName) return;
                setConfig.mutate({
                  serviceId,
                  githubInstallationId: installationId,
                  repoOwner,
                  repoName,
                  branch,
                  buildMethod,
                  dockerfileDirectory,
                  autoDeployOnPush,
                });
              }}
            >
              <FieldGroup>
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
                </div>

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
                  <FieldLabel>Build method</FieldLabel>
                  <RadioGroup value={buildMethod} onChange={(value) => setBuildMethod(value as typeof buildMethod)}>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="dockerfile" />
                      Dockerfile
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="heroku-buildpacks" />
                      Heroku Buildpacks
                    </label>
                  </RadioGroup>
                </Field>

                {buildMethod === "dockerfile" && (
                  <Field>
                    <FieldLabel htmlFor="dockerfileDirectory">Dockerfile directory</FieldLabel>
                    <Input
                      id="dockerfileDirectory"
                      value={dockerfileDirectory}
                      onChange={(e) => setDockerfileDirectory(e.target.value)}
                      placeholder="/"
                    />
                  </Field>
                )}

                <Field orientation="horizontal">
                  <Switch id="autoDeployOnPush" isSelected={autoDeployOnPush} onChange={setAutoDeployOnPush} />
                  <div>
                    <FieldLabel htmlFor="autoDeployOnPush" className="font-normal">
                      Auto-deploy on push
                    </FieldLabel>
                    <FieldDescription>Redeploys automatically on every push to {branch || "the selected branch"}.</FieldDescription>
                  </div>
                </Field>

                <Button type="submit" isDisabled={setConfig.isPending} className="self-start">
                  {setConfig.isPending && <Spinner className="size-4" />}
                  {setConfig.isPending ? "Saving..." : isConfigured && detail.sourceType === "repo" ? "Save changes" : "Connect repository"}
                </Button>
              </FieldGroup>
            </form>
          </TabsContent>

          <TabsContent id="static">
            <StaticSourceForm serviceId={serviceId} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
