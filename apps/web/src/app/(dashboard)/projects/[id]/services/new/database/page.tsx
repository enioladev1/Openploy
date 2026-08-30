"use client";

import { use, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { databaseIdentifierSchema } from "@openploy/shared";
import { trpc } from "@/app/providers";
import { Button, LinkButton } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

function getIdentifierError(value: string): string | null {
  const result = databaseIdentifierSchema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? "Invalid value");
}

const ENGINE_VERSIONS: Record<string, string[]> = {
  postgres: ["18", "16", "15", "14"],
  mysql: ["8.4", "8.0"],
  redis: ["8", "7.4", "7.2"],
  clickhouse: ["26.4", "26.3", "25.8"],
  mongodb: ["8.0", "7.0", "6.0"],
  mariadb: ["11.4", "10.11"],
};

const ENGINES = [
  { value: "postgres", label: "PostgreSQL", logo: "/logos/postgresql.png" },
  { value: "mysql", label: "MySQL", logo: "/logos/mysql.png" },
  { value: "mariadb", label: "MariaDB", logo: "/logos/mariadb.png" },
  { value: "redis", label: "Redis", logo: "/logos/redis.png" },
  { value: "clickhouse", label: "ClickHouse", logo: "/logos/clickhouse.png" },
  { value: "mongodb", label: "MongoDB", logo: "/logos/mongodb.png" },
] as const;

function generateClientPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "");
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function PasswordField({ id, label, value, onChange }: PasswordFieldProps) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} required className="flex-1" />
        <Button type="button" variant="outline" onPress={() => onChange(generateClientPassword())}>
          <HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={2} />
          Generate
        </Button>
      </div>
    </Field>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ name?: string }>;
}

export default function NewDatabaseServicePage({ params, searchParams }: PageProps) {
  const { id: projectId } = use(params);
  const { name: nameParam } = use(searchParams);
  const router = useRouter();

  const name = nameParam ?? "";
  const [engine, setEngine] = useState<"postgres" | "mysql" | "redis" | "clickhouse" | "mongodb" | "mariadb">("postgres");
  const [version, setVersion] = useState(ENGINE_VERSIONS.postgres![0]!);
  const [databaseName, setDatabaseName] = useState("openploy");
  const [username, setUsername] = useState("openploy");
  const [password, setPassword] = useState("");
  const [rootPassword, setRootPassword] = useState("");

  const createDatabase = trpc.services.createDatabase.useMutation({
    onSuccess: (service) => router.push(`/services/${service.id}`),
    onError: (err) => toast.error(err.message),
  });

  const databaseNameError = engine !== "redis" ? getIdentifierError(databaseName) : null;
  const usernameError = engine !== "redis" ? getIdentifierError(username) : null;

  return (
    <div>
      <LinkButton variant="link" href={`/projects/${projectId}`} className="mb-2 h-auto p-0">
        <HugeiconsIcon icon={ArrowLeft02Icon} size={14} strokeWidth={2} />
        Back
      </LinkButton>

      <h1 className="mb-1 text-xl font-heading font-semibold">New Database</h1>
      <p className="mb-6 text-sm text-muted-foreground">{name}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (databaseNameError || usernameError) return;
          if (engine === "redis") {
            createDatabase.mutate({ projectId, name, engine, version, password });
          } else if (engine === "mysql" || engine === "mariadb") {
            createDatabase.mutate({ projectId, name, engine, version, databaseName, username, password, rootPassword });
          } else {
            createDatabase.mutate({ projectId, name, engine, version, databaseName, username, password });
          }
        }}
        className="max-w-lg"
      >
        <FieldGroup>
          <Field>
            <FieldLabel>Engine</FieldLabel>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {ENGINES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setEngine(option.value);
                    setVersion(ENGINE_VERSIONS[option.value]![0]!);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-2xl border p-4 text-sm transition-colors",
                    engine === option.value ? "border-primary bg-muted" : "border-border hover:bg-muted/50",
                  )}
                >
                  <div className="relative h-10 w-full">
                    <Image src={option.logo} alt={option.label} fill className="object-contain" />
                  </div>
                  <span className="font-medium">{option.label}</span>
                </button>
              ))}
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor="version">Version</FieldLabel>
            <Select selectedKey={version} onSelectionChange={(key) => setVersion(key as string)}>
              <SelectTrigger id="version">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENGINE_VERSIONS[engine]!.map((v) => (
                  <SelectItem key={v} id={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {engine !== "redis" && (
            <>
              <Field>
                <FieldLabel htmlFor="databaseName">Database name</FieldLabel>
                <Input id="databaseName" value={databaseName} onChange={(e) => setDatabaseName(e.target.value)} required />
                {databaseNameError && <p className="text-sm text-destructive">{databaseNameError}</p>}
              </Field>
              <Field>
                <FieldLabel htmlFor="username">Database user</FieldLabel>
                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
                {usernameError && <p className="text-sm text-destructive">{usernameError}</p>}
              </Field>
            </>
          )}

          <PasswordField id="password" label="Database password" value={password} onChange={setPassword} />

          {(engine === "mysql" || engine === "mariadb") && (
            <PasswordField id="rootPassword" label="Database root password" value={rootPassword} onChange={setRootPassword} />
          )}

          <Button type="submit" isDisabled={createDatabase.isPending || Boolean(databaseNameError || usernameError)}>
            {createDatabase.isPending && <Spinner className="size-4" />}
            {createDatabase.isPending ? "Creating..." : "Create database"}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
