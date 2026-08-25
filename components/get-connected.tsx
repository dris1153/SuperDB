"use client";

import { IconBox, IconDatabase, IconPlugConnected, IconServer, IconSparkles } from "@tabler/icons-react";
import { ConnectSheet, type ConnectInfo } from "./connect-sheet";

/** The five entry points Supabase shows — all open the same sheet, as the real Connect button does. */
const CELLS = [
  { icon: IconBox, title: "Framework", subtitle: "Use a client library" },
  { icon: IconServer, title: "Server", subtitle: "Build APIs" },
  { icon: IconDatabase, title: "Direct", subtitle: "Connection string" },
  { icon: IconPlugConnected, title: "ORM", subtitle: "Third-party library" },
  { icon: IconSparkles, title: "MCP", subtitle: "Connect your agent" },
];

export function GetConnected({ info }: { info: ConnectInfo }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg text-foreground">Get connected</h2>

      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border md:grid-cols-5">
        {CELLS.map(({ icon: Icon, title, subtitle }, index) => (
          <ConnectSheet key={title} info={info}>
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
          </ConnectSheet>
        ))}
      </div>
    </section>
  );
}
