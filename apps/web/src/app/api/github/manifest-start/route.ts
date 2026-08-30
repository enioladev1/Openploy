import { redirect } from "next/navigation";
import { getAuth } from "@/server/get-auth";
import { issueOauthState } from "@/server/oauth-state";
import { buildManifestForSetup } from "@/server/services/github-service";

const MANIFEST_STATE_COOKIE = "gh_manifest_state";

/**
 * Renders a self-submitting form that POSTs the app manifest to GitHub, per
 * GitHub's documented "create a GitHub App from a manifest" flow. A real form
 * post (not a client fetch) is required here since the target is github.com,
 * not this app's own API.
 */
export async function GET() {
  const auth = await getAuth();
  if (!auth || auth.role !== "owner") {
    redirect("/login");
  }

  const state = await issueOauthState(MANIFEST_STATE_COOKIE);
  const manifest = await buildManifestForSetup();


  const html = `<!doctype html>
<html>
  <head>
    <style>
      body { margin: 0; display: flex; min-height: 100dvh; align-items: center; justify-content: center; background: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
      .wrap { display: flex; flex-direction: column; align-items: center; gap: 16px; }
      .spinner { width: 24px; height: 24px; border: 2px solid #e4e4e7; border-top-color: #0a0a0a; border-radius: 50%; animation: spin 0.7s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      p { margin: 0; font-size: 14px; color: #71717a; }
      button { display: none; margin-top: 8px; padding: 8px 16px; border-radius: 8px; border: 1px solid #e4e4e7; background: #0a0a0a; color: #fff; font-size: 14px; cursor: pointer; }
    </style>
  </head>
  <body>
    <form id="gh-manifest-form" method="post" action="https://github.com/settings/apps/new?state=${encodeURIComponent(state)}">
      <input type="hidden" name="manifest" value='${JSON.stringify(manifest).replace(/'/g, "&#39;")}' />
      <div class="wrap">
        <div class="spinner"></div>
        <p>Redirecting to GitHub...</p>
        <button type="submit" id="gh-manifest-fallback">Continue to GitHub</button>
      </div>
    </form>
    <script>
      document.getElementById("gh-manifest-form").submit();
      // Auto-submit can fail silently (JS blocked, an extension interfering) -
      // reveal the manual fallback if navigation hasn't happened by then.
      setTimeout(function () {
        document.getElementById("gh-manifest-fallback").style.display = "inline-block";
      }, 3000);
    </script>
  </body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
}
