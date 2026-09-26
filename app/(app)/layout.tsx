import { requireUser } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VaultProvider } from "@/components/vault-provider";
import { getVaultMeta } from "@/lib/vault-actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ user }, vaultMeta] = await Promise.all([
    requireUser(),
    getVaultMeta(),
  ]);
  return (
    <VaultProvider meta={vaultMeta}>
      <TooltipProvider delayDuration={200}>
        <div className="flex min-h-screen">
          <Sidebar email={user.email ?? ""} />
          <main className="min-w-0 flex-1">{children}</main>
          <Toaster />
        </div>
      </TooltipProvider>
    </VaultProvider>
  );
}
