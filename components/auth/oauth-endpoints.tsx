import type { OAuthEndpoint } from "@/lib/oauth-server";
import { CopyButton } from "@/components/copy-button";
import { Input } from "@/components/ui/input";

/** What a third-party app needs to integrate, as the original lists it. */
export function OAuthEndpoints({ endpoints }: { endpoints: OAuthEndpoint[] }) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-base text-foreground">OAuth Endpoints</h2>
        <p className="text-sm text-muted-foreground">
          Share these endpoints with third-party applications that need to integrate with your OAuth
          2.1 server.
        </p>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border">
        {endpoints.map(({ label, url }) => (
          <div
            key={label}
            className="grid gap-2 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:items-center"
          >
            <span className="text-sm text-foreground">{label}</span>
            <div className="flex gap-2">
              <Input readOnly value={url} aria-label={label} className="font-mono text-xs" />
              <CopyButton value={url} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
