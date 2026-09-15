"use client";

import { useEffect, useRef, useState } from "react";
import { Prisma } from "developer-icons";
import { buildOrmGuide, type OrmGuide } from "@/lib/orm-actions";
import { ORMS } from "@/lib/orm-content";
import { cn } from "@/lib/utils";
import { Copyable, Step, StepFiles, StepSkeleton } from "./connect-primitives";

const LOGOS: Record<string, typeof Prisma> = { Prisma };

export function OrmPanel({
  transactionPooler,
  sessionPooler,
}: {
  transactionPooler: string | null;
  sessionPooler: string | null;
}) {
  const [ormKey, setOrmKey] = useState(ORMS[0].key);
  const [guide, setGuide] = useState<OrmGuide | null>(null);
  const [pending, setPending] = useState(false);

  // Same treatment as the framework panel: each ORM is built once, then switching is free.
  const built = useRef(new Map<string, OrmGuide>());

  useEffect(() => {
    const cached = built.current.get(ormKey);
    if (cached) {
      setGuide(cached);
      return;
    }

    let cancelled = false;
    setPending(true);
    buildOrmGuide(
      { transaction: transactionPooler ?? undefined, session: sessionPooler ?? undefined },
      ormKey,
    ).then((result) => {
      if (cancelled) return;
      built.current.set(ormKey, result);
      setGuide(result);
      setPending(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ormKey, transactionPooler, sessionPooler]);

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="px-5 grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
        <div className="text-sm text-foreground">ORM</div>
        <div className="overflow-hidden rounded-md border border-border">
          {ORMS.map((orm, index) => {
            const Icon = orm.icon ? LOGOS[orm.icon] : undefined;
            return (
              <button
                key={orm.key}
                onClick={() => setOrmKey(orm.key)}
                className={cn(
                  "flex w-full items-center gap-3 p-3 text-left transition-colors",
                  index > 0 && "border-t border-border",
                  ormKey === orm.key ? "bg-muted/60" : "hover:bg-muted/30",
                )}
              >
                <span
                  className={cn(
                    "size-3 shrink-0 rounded-full border",
                    ormKey === orm.key ? "border-primary bg-primary" : "border-input",
                  )}
                />
                {Icon ? (
                  <Icon size={15} className="shrink-0" />
                ) : (
                  <span className="flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border border-border text-[9px] text-subtle">
                    {orm.label[0]}
                  </span>
                )}
                <span className="text-sm text-foreground">{orm.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 border-t border-border pt-6 flex-1 bg-secondary pb-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base text-foreground">Follow these steps</h3>
          {guide && !guide.blocked ? (
            <Copyable value={guide.prompt} label="Copy prompt" />
          ) : null}
        </div>

        {guide === null ? (
          <StepSkeleton />
        ) : guide.blocked ? (
          <p className="text-sm text-subtle">{guide.reason}</p>
        ) : (
          <div className={cn("space-y-6 transition-opacity", pending && "opacity-50")}>
            {guide.steps.map((step, index) => (
              <Step
                key={step.title}
                index={index + 1}
                title={step.optional ? `${step.title} (optional)` : step.title}
                description={step.description}
              >
                <StepFiles key={step.files.map((f) => f.name).join()} step={step} />
              </Step>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
