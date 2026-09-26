"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconExternalLink } from "@tabler/icons-react";
import { METHODS } from "@/lib/credential-methods";
import { dashboardUrl } from "@/lib/dashboard-url";
import type { ProjectAccess } from "@/lib/project-access";
import { Copyable } from "@/components/connect-primitives";
import { Button } from "@/components/ui/button";
import { VaultGate } from "@/components/vault-gate";
import { useVaultSecret } from "@/components/use-vault-secret";

type AccountSecret = { supabase_password: string; email_password: string };
type DbSecret = { db_password: string };

const DOTS = "••••••••••••";

const Heading = ({ children }: { children: React.ReactNode }) => (
  <h3 className="font-mono text-[11px] tracking-widest text-subtle uppercase">{children}</h3>
);

/** A copyable line; a password copies without ever being painted. */
function Row({ label, value, secret, copy = true }: { label: string; value: string | null | undefined; secret?: boolean; copy?: boolean }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <span className="w-36 shrink-0 text-sm text-muted-foreground">{label}</span>
      {value && !copy ? <span className="flex-1 text-sm text-foreground">{value}</span> : value ? (
        <>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground" title={secret ? undefined : value}>{secret ? DOTS : value}</span>
          <Copyable value={value} />
        </>
      ) : (
        <span className="flex-1 text-sm text-subtle">Not saved</span>
      )}
    </div>
  );
}

/**
 * Everything it takes to carry on in the original: which account holds the project, what signs in
 * to it, and a link to the page in view. Passwords decrypt here, in the browser, and nowhere else.
 */
export function AccessPanel({ projectRef, access }: { projectRef: string; access: ProjectAccess }) {
  const pathname = usePathname();
  const account = useVaultSecret<AccountSecret>(access.accountBlob);
  const db = useVaultSecret<DbSecret>(access.dbBlob);
  const method = METHODS.find((m) => m.value === access.method);
  const page = dashboardUrl(projectRef, pathname);
  const home = dashboardUrl(projectRef, "");
  const edit = `/connections?edit=${access.connectionId}`;
  const signInSaved = access.method || access.email || access.accountBlob;

  const passwords = (
    <div>
      {method?.supabasePassword || account.value.supabase_password ? <Row label="Supabase password" value={account.value.supabase_password} secret /> : null}
      {method?.emailPassword || account.value.email_password ? <Row label="Email password" value={account.value.email_password} secret /> : null}
      <Row label="Database password" value={db.value.db_password} secret />
      {account.message || db.message ? <p className="pt-1 text-xs text-destructive">{account.message ?? db.message}</p> : null}
    </div>
  );

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Heading>Account</Heading>
          <Link href={edit} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Edit sign-in</Link>
        </div>
        <p className="text-sm text-foreground">
          {access.account}
          {access.orgName && access.orgName !== access.account ? <span className="text-muted-foreground"> · {access.orgName}</span> : null}
        </p>
        {signInSaved ? (
          <div>
            <Row label="Signs in with" value={method?.label} copy={false} />
            <Row label="Email" value={access.email} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No sign-in details saved for this account.{" "}
            <Link href={edit} className="text-foreground underline underline-offset-4">Add them</Link>
          </p>
        )}
      </section>

      <section className="space-y-2">
        <Heading>Passwords</Heading>
        {method && !method.supabasePassword && !method.emailPassword ? (
          <p className="text-sm text-muted-foreground">Signs in with {method.label} — no account password to copy.</p>
        ) : null}
        {access.accountBlob || access.dbBlob ? <VaultGate>{passwords}</VaultGate> : passwords}
      </section>

      <section className="space-y-2">
        <Heading>Project</Heading>
        <div>
          <Row label="Reference" value={projectRef} />
          <Row label="URL" value={`https://${projectRef}.supabase.co`} />
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <a href={page} target="_blank" rel="noreferrer">
            {page === home ? "Open in Supabase" : "Open this page in Supabase"} <IconExternalLink size={14} />
          </a>
        </Button>
        {page !== home ? (
          <Button asChild size="sm" variant="outline">
            <a href={home} target="_blank" rel="noreferrer">Project home <IconExternalLink size={14} /></a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
