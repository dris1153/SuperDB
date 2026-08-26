import { verifyChallenge } from "@/lib/mfa-actions";
import { AuthCard } from "@/components/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

// Reached from proxy.ts when a session holds aal1 but the user has a verified factor. Deliberately
// outside the (app) layout: there is no sidebar to show someone who is only half signed in.
export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <AuthCard title="Enter the code from your authenticator.">
      <form action={verifyChallenge} className="mt-6 space-y-3">
        <Input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          required
          autoFocus
          className="font-mono"
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button variant="default" type="submit" className="w-full justify-center">
          Verify
        </Button>
      </form>

      <form action="/auth/signout" method="post" className="mt-4">
        <button className="text-xs text-subtle hover:text-foreground">Sign out instead</button>
      </form>
    </AuthCard>
  );
}
