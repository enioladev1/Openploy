import type { ReactNode } from "react";
import Image from "next/image";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InsecureConnectionBanner } from "@/components/insecure-connection-banner";

interface AuthCardProps {
  title: string;
  description?: string;
  error?: string | undefined;
  children: ReactNode;
  footer?: ReactNode;
}

/** Split-screen shell shared by login/signup/verify-totp (login-02/signup-02 shape, adapted: no OAuth or password-reset links since neither exists here, and the image panel is a dot-grid + brand mark instead of a stock photo since there's no real product image to show). */
export function AuthCard({ title, description, error, children, footer }: AuthCardProps) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <InsecureConnectionBanner />
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center md:justify-start">
          <Image
            src="/logos/brand/openploy-logo.png"
            alt="Openploy"
            width={140}
            height={32}
            className="h-9 w-auto dark:hidden"
            priority
          />
          <Image
            src="/logos/brand/openploy-logo-light.png"
            alt="Openploy"
            width={140}
            height={32}
            className="hidden h-9 w-auto dark:block"
            priority
          />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="flex w-full max-w-sm flex-col gap-6">
            <div className="flex flex-col items-center gap-1 text-center">
              <h1 className="text-2xl font-bold">{title}</h1>
              {description && <p className="text-sm text-balance text-muted-foreground">{description}</p>}
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {children}
            {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
          </div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-muted lg:block">
        <div
          className="absolute inset-0 opacity-40"
          style={{ backgroundImage: "radial-gradient(var(--color-border) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex size-28 items-center justify-center rounded-full bg-foreground/[0.04] ring-1 ring-border">
            <Image src="/logos/brand/openploy-favicon.png" alt="" width={44} height={44} className="opacity-30 dark:hidden" />
            <Image
              src="/logos/brand/openploy-favicon-light.png"
              alt=""
              width={44}
              height={44}
              className="hidden opacity-30 dark:block"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
