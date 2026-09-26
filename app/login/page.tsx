import type { Metadata } from "next";
import Link from "next/link";
import { signInWithPassword } from "@/lib/auth-actions";
import { AuthCard, GitHubButton, OrDivider } from "@/components/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <AuthCard title="Sign in to reach your Supabase accounts.">
      <form action={signInWithPassword} className="mt-6 space-y-3">
        <Input name="email" type="email" placeholder="you@example.com" autoComplete="username" required />
        <Input name="password" type="password" placeholder="Password" autoComplete="current-password" required />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button variant="default" type="submit" className="w-full justify-center">
          Sign in
        </Button>
      </form>

      <OrDivider />
      <GitHubButton />

      <p className="mt-4 text-xs text-subtle">
        <Link href="/forgot-password" className="hover:text-foreground">
          Forgot password?
        </Link>
        {" · "}
        <Link href="/signup" className="hover:text-foreground">
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}
