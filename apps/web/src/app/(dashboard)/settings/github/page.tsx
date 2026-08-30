import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon, GithubIcon } from "@hugeicons/core-free-icons";
import { getAuth } from "@/server/get-auth";
import { getGithubApp, listInstallations } from "@/server/services/github-service";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { LinkButton } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";

interface PageProps {
  searchParams: Promise<{ error?: string; setup?: string; installed?: string }>;
}

// GitHub's own "which repos can this installation see" UI - organization
// installations live under the org's settings, personal ones under the user's.
function getManageInstallationUrl(installation: { installationId: string; accountLogin: string; accountType: string }): string {
  return installation.accountType === "Organization"
    ? `https://github.com/organizations/${installation.accountLogin}/settings/installations/${installation.installationId}`
    : `https://github.com/settings/installations/${installation.installationId}`;
}

export default async function GithubSettingsPage({ searchParams }: PageProps) {
  const auth = await getAuth();
  if (!auth) return null;

  const params = await searchParams;
  const app = await getGithubApp();
  const installations = app ? await listInstallations(auth.organizationId) : [];

  return (
    <div>
      <h1 className="mb-6 text-xl font-heading font-semibold">GitHub</h1>

      {params.error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>Something went wrong: {params.error}</AlertDescription>
        </Alert>
      )}
      {params.setup === "success" && (
        <Alert className="mb-4">
          <AlertDescription>GitHub App created.</AlertDescription>
        </Alert>
      )}
      {params.installed === "success" && (
        <Alert className="mb-4">
          <AlertDescription>Account connected.</AlertDescription>
        </Alert>
      )}

      {!app ? (
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={GithubIcon} size={20} strokeWidth={2} />
                </EmptyMedia>
                <EmptyTitle>No GitHub App registered</EmptyTitle>
                <EmptyDescription>
                  {auth.role === "owner" ? "Set one up to connect repositories." : "Ask an owner to set this up."}
                </EmptyDescription>
              </EmptyHeader>
              {auth.role === "owner" && (
                <EmptyContent>
                  <LinkButton href="/api/github/manifest-start">
                    <HugeiconsIcon icon={GithubIcon} size={16} strokeWidth={2} />
                    Set up GitHub App
                  </LinkButton>
                </EmptyContent>
              )}
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <Item variant="outline" className="mb-6">
              <ItemMedia variant="icon">
                <HugeiconsIcon icon={GithubIcon} size={20} strokeWidth={2} />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>
                  {app.appSlug}
                  <StatusBadge status="active" />
                </ItemTitle>
                <ItemDescription>Registered GitHub App for this instance</ItemDescription>
              </ItemContent>
              <ItemActions>
                <LinkButton
                  variant="outline"
                  size="sm"
                  href={`https://github.com/apps/${app.appSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on GitHub
                  <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} strokeWidth={2} />
                </LinkButton>
              </ItemActions>
            </Item>

            <Separator className="mb-6" />

            <LinkButton variant="outline" href="/api/github/install-start" className="mb-6">
              <HugeiconsIcon icon={GithubIcon} size={16} strokeWidth={2} />
              Connect a GitHub account
            </LinkButton>

            <h2 className="mb-3 text-sm font-medium">Connected accounts</h2>
            {installations.length === 0 ? (
              <p className="text-sm text-muted-foreground">None connected yet.</p>
            ) : (
              <ItemGroup>
                {installations.map((installation) => (
                  <Item key={installation.id} variant="outline" size="sm">
                    <ItemMedia variant="icon">
                      <HugeiconsIcon icon={GithubIcon} size={16} strokeWidth={2} />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{installation.accountLogin}</ItemTitle>
                      <ItemDescription>{installation.accountType}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <LinkButton
                        variant="outline"
                        size="sm"
                        href={getManageInstallationUrl(installation)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Manage repos
                        <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} strokeWidth={2} />
                      </LinkButton>
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
