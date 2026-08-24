import Link from "next/link";
import { requestPasswordReset } from "@/lib/auth-actions";
import { AuthCard } from "@/components/auth-ui";
import { Button, Input } from "@/components/ui";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;

  // Same message whether or not the address has an account — the form must not be an enumeration oracle.
  if (sent) {
    return (
      <AuthCard title="Check your inbox.">
        <p className="mt-4 text-sm text-fg-muted">
          If that address has an account, a reset link is on its way.
        </p>
        <p className="mt-4 text-xs text-fg-subtle">
          <Link href="/login" className="hover:text-fg">
            Back to sign in
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset your password.">
      <form action={requestPasswordReset} className="mt-6 space-y-3">
        <Input name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
        <Button variant="primary" type="submit" className="w-full justify-center">
          Send reset link
        </Button>
      </form>

      <p className="mt-4 text-xs text-fg-subtle">
        <Link href="/login" className="hover:text-fg">
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
