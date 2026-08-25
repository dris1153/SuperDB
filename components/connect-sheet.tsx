"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  IconBox,
  IconCheck,
  IconCopy,
  IconDatabase,
  IconExternalLink,
  IconEye,
  IconEyeOff,
  IconInfoCircle,
  IconPlugConnected,
  IconServer,
  IconSparkles,
} from "@tabler/icons-react";
import { getServerEnv, type ServerEnv } from "@/lib/connect-actions";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export type ConnectInfo = {
  projectRef: string;
  projectUrl: string;
  dbHost: string | null;
  transactionPooler: string | null;
  sessionPooler: string | null;
};

type Method = "framework" | "server" | "direct" | "orm" | "mcp";

const METHODS: {
  id: Method;
  icon: typeof IconBox;
  title: string;
  subtitle: string;
}[] = [
  {
    id: "framework",
    icon: IconBox,
    title: "Framework",
    subtitle: "Use a client library",
  },
  { id: "server", icon: IconServer, title: "Server", subtitle: "Build APIs" },
  {
    id: "direct",
    icon: IconDatabase,
    title: "Direct",
    subtitle: "Connection string",
  },
  {
    id: "orm",
    icon: IconPlugConnected,
    title: "ORM",
    subtitle: "Third-party library",
  },
  {
    id: "mcp",
    icon: IconSparkles,
    title: "MCP",
    subtitle: "Connect your agent",
  },
];

function Copyable({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label="Copy"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Denied outside a secure context; the value stays selectable on screen.
        }
      }}
    >
      {copied ? (
        <IconCheck size={13} stroke={1.5} className="text-primary" />
      ) : (
        <IconCopy size={13} stroke={1.5} />
      )}
    </Button>
  );
}

function Snippet({ value }: { value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-background p-2.5">
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-xs whitespace-pre text-muted-foreground">
        {value}
      </code>
      <Copyable value={value} />
    </div>
  );
}

function Step({
  index,
  title,
  description,
  children,
}: {
  index: number;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <div className="flex gap-2.5">
        <span className="flex size-5 shrink-0 items-center justify-center rounded border border-border text-[11px] text-subtle">
          {index}
        </span>
        <div>
          <div className="text-sm text-foreground">{title}</div>
          <p className="mt-0.5 text-xs leading-relaxed text-subtle">
            {description}
          </p>
        </div>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

const SKILLS_STEP = <Snippet value="npx skills add supabase/agent-skills" />;

function DirectPanel({ info }: { info: ConnectInfo }) {
  const [method, setMethod] = useState<"direct" | "transaction" | "session">(
    "direct",
  );

  const options = [
    {
      id: "direct" as const,
      title: "Direct connection",
      body: "Ideal for applications with persistent and long-lived connections such as those running on virtual machines or long-standing containers.",
      value: info.dbHost
        ? `postgresql://postgres:[YOUR-PASSWORD]@${info.dbHost}:5432/postgres`
        : null,
    },
    {
      id: "transaction" as const,
      title: "Transaction pooler",
      body: "Ideal for stateless applications like serverless functions where each interaction with Postgres is brief and isolated.",
      value: info.transactionPooler,
    },
    {
      id: "session" as const,
      title: "Session pooler",
      body: "Only recommended as an alternative to direct connection when connecting via an IPv4 network.",
      value: info.sessionPooler,
    },
  ];

  const selected = options.find((o) => o.id === method)!;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
        <div className="text-sm text-foreground">Connection Method</div>
        <div className="overflow-hidden rounded-md border border-border">
          {options.map((option, index) => (
            <button
              key={option.id}
              onClick={() => setMethod(option.id)}
              className={cn(
                "flex w-full items-start gap-3 p-3 text-left transition-colors",
                index > 0 && "border-t border-border",
                method === option.id ? "bg-muted/60" : "hover:bg-muted/30",
              )}
            >
              <span
                className={cn(
                  "mt-1 size-3 shrink-0 rounded-full border",
                  method === option.id
                    ? "border-primary bg-primary"
                    : "border-input",
                )}
              />
              <span>
                <span className="block text-sm text-foreground">
                  {option.title}
                </span>
                <span className="block text-xs leading-relaxed text-subtle">
                  {option.body}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="mb-4 text-base text-foreground">Follow these steps</h3>

        <div className="mb-4 flex items-start gap-2.5 rounded-md border border-border bg-card p-3">
          <IconInfoCircle
            size={15}
            stroke={1.5}
            className="mt-0.5 shrink-0 text-muted-foreground"
          />
          <div className="flex-1">
            <div className="text-sm text-foreground">
              Direct connections use IPv6 by default
            </div>
            <p className="mt-0.5 text-xs text-subtle">
              The dedicated IPv4 add-on is a billing change, so it is made in
              the Supabase dashboard rather than here.
            </p>
          </div>
          <a
            href={`https://supabase.com/dashboard/project/${info.projectRef}/settings/addons`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs text-brand-text hover:underline"
          >
            Open settings <IconExternalLink size={12} stroke={1.5} />
          </a>
        </div>

        <div className="space-y-6">
          <Step
            index={1}
            title="Connection string"
            description="Copy the connection details for your database."
          >
            {selected.value ? (
              <>
                <Snippet value={selected.value} />
                <p className="text-xs text-subtle">
                  Supabase does not return the database password through its
                  API, so the placeholder stays — paste your own in. Resetting
                  it is a destructive action and lives in the{" "}
                  <a
                    href={`https://supabase.com/dashboard/project/${info.projectRef}/settings/database`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-text hover:underline"
                  >
                    Supabase dashboard
                  </a>
                  .
                </p>
              </>
            ) : (
              <p className="text-xs text-subtle">
                This connection type is unavailable for this project.
              </p>
            )}
          </Step>

          {info.dbHost ? (
            <Step
              index={2}
              title="Connection parameters"
              description="The same details, field by field."
            >
              <div className="overflow-hidden rounded-md border border-border">
                {[
                  ["host", info.dbHost],
                  ["port", "5432"],
                  ["database", "postgres"],
                  ["user", "postgres"],
                ].map(([key, value], index) => (
                  <div
                    key={key}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2",
                      index > 0 && "border-t border-border",
                    )}
                  >
                    <span className="w-20 shrink-0 font-mono text-xs text-subtle">
                      {key}:
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                      {value}
                    </span>
                    <Copyable value={value} />
                  </div>
                ))}
              </div>
            </Step>
          ) : null}

          <Step
            index={info.dbHost ? 3 : 2}
            title="Install Agent Skills"
            description="Ready-made instructions for AI coding tools."
          >
            {SKILLS_STEP}
          </Step>
        </div>
      </div>
    </div>
  );
}

function ServerPanel({ projectRef }: { projectRef: string }) {
  const [state, setState] = useState<ServerEnv | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getServerEnv(projectRef).then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, [projectRef]);

  return (
    <div className="space-y-6">
      <h3 className="text-base text-foreground">Follow these steps</h3>

      <Step
        index={1}
        title="Install package"
        description="Add @supabase/supabase-js to your backend."
      >
        <Snippet value="npm install @supabase/supabase-js" />
      </Step>

      <Step
        index={2}
        title="Set environment variables"
        description="Copy these into your environment so your handler can verify users and call the API."
      >
        {state === null ? (
          <div className="h-24 animate-pulse rounded-md border border-border bg-card/50" />
        ) : state.blocked ? (
          <p className="text-xs text-subtle">{state.reason}</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-subtle">.env</span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={revealed ? "Hide secret key" : "Show secret key"}
                  onClick={() => setRevealed((v) => !v)}
                >
                  {revealed ? (
                    <IconEyeOff size={13} stroke={1.5} />
                  ) : (
                    <IconEye size={13} stroke={1.5} />
                  )}
                </Button>
                <Copyable value={state.env} />
              </div>
            </div>

            {/* The secret key is masked until asked for — it bypasses RLS on the user's project. */}
            {revealed && state.html ? (
              <div
                className="overflow-x-auto rounded-md border border-border bg-background p-2.5 text-xs [&_pre]:!bg-transparent"
                dangerouslySetInnerHTML={{ __html: state.html }}
              />
            ) : (
              <pre className="overflow-x-auto rounded-md border border-border bg-background p-2.5 font-mono text-xs text-muted-foreground">
                {state.env
                  .split("\n")
                  .map((line) =>
                    line.startsWith("SUPABASE_SECRET_KEY=")
                      ? "SUPABASE_SECRET_KEY=••••••••••••••••"
                      : line,
                  )
                  .join("\n")}
              </pre>
            )}
            <p className="text-xs text-subtle">
              SUPABASE_SECRET_KEY bypasses row level security. Keep it
              server-side only.
            </p>
          </>
        )}
      </Step>

      <Step
        index={3}
        title="Install Agent Skills"
        description="Ready-made instructions for AI coding tools."
      >
        {SKILLS_STEP}
      </Step>
    </div>
  );
}

function McpPanel({ projectRef }: { projectRef: string }) {
  const [client, setClient] = useState("claude-code");
  const [readOnly, setReadOnly] = useState(false);

  const url = `https://mcp.supabase.com/mcp?project_ref=${projectRef}${readOnly ? "&read_only=true" : ""}`;
  const command =
    client === "claude-code"
      ? `claude mcp add --scope project --transport http supabase "${url}"`
      : `# Add this HTTP MCP server to your client:\n${url}`;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
        <div className="text-sm text-foreground">Client</div>
        <div className="space-y-3">
          <Select value={client} onValueChange={setClient}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="claude-code">Claude Code</SelectItem>
              <SelectItem value="other">Other MCP client</SelectItem>
            </SelectContent>
          </Select>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(e) => setReadOnly(e.target.checked)}
              className="accent-primary"
            />
            Read-only — only allow read operations on your database.
          </label>
        </div>
      </div>

      <div className="space-y-6 border-t border-border pt-6">
        <h3 className="text-base text-foreground">Follow these steps</h3>

        <Step
          index={1}
          title="Add MCP server"
          description="Register the server with your client."
        >
          <Snippet value={command} />
        </Step>

        <Step
          index={2}
          title="Authenticate"
          description="Run this in a regular terminal, not an IDE extension."
        >
          <Snippet value="claude /mcp" />
        </Step>

        <Step
          index={3}
          title="Install Agent Skills"
          description="Ready-made instructions for AI coding tools."
        >
          {SKILLS_STEP}
        </Step>
      </div>
    </div>
  );
}

function ComingSoon({ what }: { what: string }) {
  return (
    <div className="rounded-md border border-dashed border-border p-8 text-center">
      <p className="text-sm text-muted-foreground">
        {what} setup is not built yet.
      </p>
      <p className="mt-1 text-xs text-subtle">
        Unlike the other tabs this one is documentation rather than your
        project&apos;s own connection details, so it is queued behind them.
      </p>
    </div>
  );
}

export function ConnectSheet({
  info,
  children,
}: {
  info: ConnectInfo;
  children: ReactNode;
}) {
  const [method, setMethod] = useState<Method>("direct");

  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl!"
      >
        <SheetHeader className="border-b border-border p-5">
          <SheetTitle>Connect to your project</SheetTitle>
          <SheetDescription>
            Choose how you want to use Supabase
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-2 border-b border-border sm:grid-cols-5">
          {METHODS.map(({ id, icon: Icon, title, subtitle }, index) => (
            <button
              key={id}
              onClick={() => setMethod(id)}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-4 text-center transition-colors",
                index > 0 && "border-l border-border",
                method === id ? "bg-muted/60" : "hover:bg-muted/30",
              )}
            >
              <Icon
                size={17}
                stroke={1.5}
                className={
                  method === id ? "text-foreground" : "text-muted-foreground"
                }
              />
              <span
                className={cn(
                  "text-xs",
                  method === id ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {title}
              </span>
              <span className="text-[11px] leading-tight text-subtle">
                {subtitle}
              </span>
            </button>
          ))}
        </div>

        <div className="p-5">
          {method === "direct" ? <DirectPanel info={info} /> : null}
          {method === "server" ? (
            <ServerPanel projectRef={info.projectRef} />
          ) : null}
          {method === "mcp" ? <McpPanel projectRef={info.projectRef} /> : null}
          {method === "framework" ? <ComingSoon what="Framework" /> : null}
          {method === "orm" ? <ComingSoon what="ORM" /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
