"use client";

import type { KeySummary } from "@/lib/project-parts";
import { Badge } from "@/components/ui/badge";
import { isWaiting, reasonOf, useProjectPart } from "@/components/use-project-part";

/**
 * The project's API keys, by name and prefix.
 *
 * **Never the values.** `reveal=false` does not hide them — the API returns `api_key` either way,
 * which this repo measured and wrote onto the `ApiKey` type — so the reader in `project-parts.ts`
 * picks its fields and the secret never leaves the server. `KeySummary` comes from that module
 * rather than being redeclared here: it is the shape that crosses the wire, and one definition
 * means the reader and this component cannot disagree about what was sent.
 */
export function DatabaseApiKeys({ projectRef }: { projectRef: string }) {
  const keys = useProjectPart<KeySummary[]>(projectRef, "api-keys");

  return (
    <section className="space-y-2">
      <h2 className="text-sm text-muted-foreground">API keys</h2>

      {isWaiting(keys) ? (
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-6 w-32 animate-pulse rounded-full bg-muted motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : keys.status !== "ready" ? (
        <p className="text-sm text-subtle">{reasonOf(keys)}</p>
      ) : Array.isArray(keys.data) && keys.data.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {keys.data.map((key) => (
            <Badge key={key.id ?? key.name} variant="outline" className="rounded-full font-mono">
              {key.name}
              {key.prefix ? ` · ${key.prefix}…` : ""}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-subtle">No keys returned. Values are never revealed here.</p>
      )}
    </section>
  );
}
