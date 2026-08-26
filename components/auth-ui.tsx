import type { ReactNode } from "react";
import { IconBrandGithub, IconDatabase } from "@tabler/icons-react";
import { signInWithGitHub } from "@/lib/auth-actions";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="flex items-center gap-2 text-primary">
          <IconDatabase size={20} stroke={1.5} />
          <span className="text-lg text-foreground">SuperDB</span>
        </div>
        <p className="mt-1 text-sm text-subtle">{title}</p>
        {children}
      </Card>
    </main>
  );
}

export function GitHubButton() {
  return (
    <form action={signInWithGitHub}>
      <Button variant="outline" type="submit" className="w-full justify-center">
        <IconBrandGithub size={16} stroke={1.5} />
        Continue with GitHub
      </Button>
    </form>
  );
}

export function OrDivider() {
  return (
    <div className="my-4 flex items-center gap-3 text-xs text-subtle">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
