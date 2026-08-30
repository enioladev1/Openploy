export interface AppManifestConfig {
  /** Public base URL of this platform instance, e.g. https://paas.example.com */
  baseUrl: string;
  name: string;
}

/**
 * Least-privilege by design: read-only Contents/Metadata (needed to clone and
 * build), read-only Pull requests (for a future PR-preview feature, not used
 * yet). No Administration, Actions, Deployments, or write access anywhere -
 * this platform never pushes to or reconfigures a user's repo.
 */
export function buildAppManifest(config: AppManifestConfig) {
  return {
    name: config.name,
    url: config.baseUrl,
    redirect_url: `${config.baseUrl}/api/github/manifest-callback`,
    // Without this, GitHub never redirects back to us after a user installs the
    // app - it just shows its own confirmation page and leaves the installation
    // unrecorded on our side. setup_on_update makes the same happen when the
    // admin later adds/removes repos from an existing installation.
    setup_url: `${config.baseUrl}/api/github/install-callback`,
    setup_on_update: true,
    hook_attributes: {
      url: `${config.baseUrl}/api/webhooks/github`,
    },
    public: false,
    default_permissions: {
      contents: "read",
      metadata: "read",
      pull_requests: "read",
    },
    // "installation" and "installation_repositories" are not valid entries here -
    // GitHub delivers those automatically to every installed app's webhook
    // regardless of default_events, they're not gated behind a subscribable permission.
    default_events: ["push"],
  };
}
