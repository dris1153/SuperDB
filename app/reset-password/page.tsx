import { updatePassword } from "@/lib/auth-actions";
import { AuthCard } from "@/components/auth-ui";
import { Button, Input } from "@/components/ui";

// Not listed as public in proxy.ts on purpose: /auth/confirm establishes the recovery session before
// redirecting here, so anyone reaching this page without one is bounced to /login.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <AuthCard title="Choose a new password.">
      <form action={updatePassword} className="mt-6 space-y-3">
        <Input
          name="password"
          type="password"
          placeholder="New password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button variant="primary" type="submit" className="w-full justify-center">
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
