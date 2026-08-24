import { redirect } from "next/navigation";
import { IconDatabase } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { Button, Card, Input } from "@/components/ui";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  async function signIn(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const allowed = process.env.ALLOWED_EMAIL?.trim();

    // Reject before touching Supabase Auth, so a non-owner never gets a session at all.
    if (allowed && email.toLowerCase() !== allowed.toLowerCase()) {
      redirect(`/login?error=${encodeURIComponent("Invalid credentials")}`);
    }

    const supabase = await createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) redirect(`/login?error=${encodeURIComponent(authError.message)}`);
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="flex items-center gap-2 text-brand">
          <IconDatabase size={20} stroke={1.5} />
          <span className="text-lg text-fg">SuperDB</span>
        </div>
        <p className="mt-1 text-sm text-fg-subtle">Sign in to reach your Supabase accounts.</p>

        <form action={signIn} className="mt-6 space-y-3">
          <Input name="email" type="email" placeholder="you@example.com" autoComplete="username" required />
          <Input name="password" type="password" placeholder="Password" autoComplete="current-password" required />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button variant="primary" type="submit" className="w-full justify-center">
            Sign in
          </Button>
        </form>
      </Card>
    </main>
  );
}
