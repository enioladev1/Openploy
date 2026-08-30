import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { cn } from "@/lib/utils";

// Placeholder while the Gellix webfont license (Displaay Type Foundry) is
// being purchased - swap to next/font/local pointed at the licensed .woff2
// files under public/fonts, keeping the --font-sans variable name unchanged.
const figtree = Figtree({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Openploy",
  description: "Self-hosted platform as a service",
  icons: {
    icon: [
      { url: "/logos/brand/openploy-favicon.png", media: "(prefers-color-scheme: light)" },
      { url: "/logos/brand/openploy-favicon-light.png", media: "(prefers-color-scheme: dark)" },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", figtree.variable)} suppressHydrationWarning>
      {/* Browser extensions (Grammarly, ColorZilla, etc.) inject their own
          attributes onto <body> after the server HTML is sent - React sees
          those as a mismatch on hydration. suppressHydrationWarning here is
          the standard fix for exactly that false positive, not a real bug. */}
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
