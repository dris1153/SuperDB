"use client";

import { IconBox, IconDatabase, IconKey, IconPlugConnected, IconServer, IconSparkles } from "@tabler/icons-react";
import { ConnectDialog, type ConnectInfo } from "./connect-dialog";

/**
 * The six entry points Supabase shows. They all open the same dialog rather than six near-identical
 * ones — the dialog is what the real button does too.
 */
const CELLS = [
  { icon: IconBox, title: "Framework", subtitle: "Use a client library" },
  { icon: IconServer, title: "Server", subtitle: "Build APIs" },
  { icon: IconDatabase, title: "Direct", subtitle: "Connection string" },
  { icon: IconPlugConnected, title: "ORM", subtitle: "Third-party library" },
  { icon: IconSparkles, title: "MCP", subtitle: "Connect your agent" },
  { icon: IconKey, title: "API Keys", subtitle: "Manage project keys" },
];

export function GetConnected({ info }: { info: ConnectInfo }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg text-foreground">Get connected</h2>

      {/* Hairline dividers between cells, drawn with a border on the grid so they never double up. */}
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border md:grid-cols-3 lg:grid-cols-6">
        {CELLS.map(({ icon: Icon, title, subtitle }, index) => (
          <ConnectDialog key={title} info={info}>
            <button
              className={[
                "flex flex-col items-center gap-1.5 px-4 py-8 text-center transition-colors hover:bg-muted/40",
                index > 0 ? "border-l border-border" : "",
                index >= 2 ? "border-t border-border md:border-t-0" : "",
              ].join(" ")}
            >
              <Icon size={20} stroke={1.5} className="text-muted-foreground" />
              <span className="text-sm text-foreground">{title}</span>
              <span className="text-xs text-subtle">{subtitle}</span>
            </button>
          </ConnectDialog>
        ))}
      </div>
    </section>
  );
}
