import Link from "next/link";
import { signUpWithPassword } from "@/lib/auth-actions";
import { AuthCard, GitHubButton, OrDivider } from "@/components/auth-ui";
import { Button, Input } from "@/components/ui";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;

  if (sent) {
    return (
      <AuthCard title="Check your inbox.">
        <p className="mt-4 text-sm text-fg-muted">
          A confirmation link is on its way to <span className="text-fg">{sent}</span>. Open it to finish
          creating your account.
        </p>
        {/* Signing up with an address that already has a GitHub identity returns success and sends
            nothing — Supabase obfuscates it to prevent account enumeration. Without this hint the
            person waits for mail that will never arrive. */}
        <p className="mt-3 text-xs text-fg-subtle">
          Nothing arriving? If you first signed up with GitHub, sign in with GitHub instead.
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
    <AuthCard title="Create an account to manage your Supabase projects.">
      <form action={signUpWithPassword} className="mt-6 space-y-3">
        <Input name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
        <Input
          name="password"
          type="password"
          placeholder="Password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button variant="primary" type="submit" className="w-full justify-center">
          Create account
        </Button>
      </form>

      <OrDivider />
      <GitHubButton />

      <p className="mt-4 text-xs text-fg-subtle">
        Already have an account?{" "}
        <Link href="/login" className="hover:text-fg">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
