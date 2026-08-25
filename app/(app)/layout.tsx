import { requireUser } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/ui/sonner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  return (
    <div className="flex min-h-screen">
      <Sidebar email={user.email ?? ""} />
      <main className="min-w-0 flex-1">{children}</main>
      <Toaster />
    </div>
  );
}
