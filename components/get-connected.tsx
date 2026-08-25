"use client";

import { ConnectSheet, METHODS, type ConnectInfo } from "./connect-sheet";

export function GetConnected({ info }: { info: ConnectInfo }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg text-foreground">Get connected</h2>

      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border md:grid-cols-5">
        {METHODS.map(({ id, icon: Icon, title, subtitle }, index) => (
          // Each tile opens the sheet on its own tab; without the id every one of them landed on
          // Direct, since that is the sheet's default.
          <ConnectSheet key={id} info={info} method={id}>
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
