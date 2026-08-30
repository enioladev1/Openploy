import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Lets a local production-mode build/start run in its own output dir,
  // side by side with a running `next dev` - both default to `.next` and
  // will corrupt each other's build manifests if run concurrently there.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Minimal self-contained server bundle for the installer's Docker image (see apps/web/Dockerfile).
  output: "standalone",
  // @node-rs/argon2 ships a native .node binary; bundling it with webpack
  // breaks the build, so it must run as a real Node require instead.
  serverExternalPackages: ["@node-rs/argon2"],
  // .env* and any dotfile already never ship to the client bundle by default;
  // this is an explicit belt-and-suspenders block per CLAUDE.md's "no sensitive
  // files accessible via the web" rule, not relying on the default alone.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default config;
