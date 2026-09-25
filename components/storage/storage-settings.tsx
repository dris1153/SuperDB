"use client";

import { useState, useTransition } from "react";
import { saveStorageConfig } from "@/lib/storage-actions";
import type { StorageConfig } from "@/lib/mgmt-api";
import {
  fromBytes,
  imageTransformationOn,
  SIZE_UNITS,
  sizeProblem,
  toBytes,
  type SizeUnit,
} from "@/lib/storage-config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isWaiting, reasonOf, useProjectPart, useRefetchPart } from "@/components/use-project-part";

/**
 * The two settings that govern every upload on the project.
 *
 * The size field is a number and a unit, as in the original, but the API's field is bytes. The
 * conversion is in `lib/storage-config.ts` and is exact in both directions: a limit that is not a
 * whole number of megabytes stays in bytes rather than rounding, because rounding here would write
 * back a different limit than the project has.
 *
 * The original also shows a "Free Plan has a fixed limit of 50 MB" notice. Nothing in
 * `/config/storage` states the plan, so there is no notice here rather than a guessed one — if the
 * API refuses a value, it says why and that message is shown.
 */
export function StorageSettings({ projectRef }: { projectRef: string }) {
  const state = useProjectPart<StorageConfig>(projectRef, "storage-config");
  const refetch = useRefetchPart(projectRef, "storage-config");
  const config = state.status === "ready" ? state.data : undefined;

  if (isWaiting(state)) {
    return (
      <Card className="space-y-4 p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </Card>
    );
  }

  if (state.status !== "ready" || !config) {
    return (
      <Empty>
        Could not read this project&apos;s storage settings.
        <span className="mt-1 block text-xs">{reasonOf(state)}</span>
      </Empty>
    );
  }

  // Keyed on the values that came back, so a save elsewhere resets the form rather than leaving it
  // showing an edit that is no longer based on anything.
  return (
    <SettingsForm
      key={`${config.fileSizeLimit}-${imageTransformationOn(config)}`}
      projectRef={projectRef}
      config={config}
      onSaved={refetch}
    />
  );
}

function SettingsForm({
  projectRef,
  config,
  onSaved,
}: {
  projectRef: string;
  config: StorageConfig;
  onSaved: () => Promise<unknown>;
}) {
  const initial = fromBytes(config.fileSizeLimit);
  const [transform, setTransform] = useState(imageTransformationOn(config));
  const [size, setSize] = useState(String(initial.value));
  const [unit, setUnit] = useState<SizeUnit>(initial.unit);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = Number(size);
  // `Number("")` is 0, so the empty field has to be caught before the number is looked at.
  const problemWithSize = size.trim() === "" ? "That is not a size." : sizeProblem(parsed, unit);
  const bytes = problemWithSize ? config.fileSizeLimit : toBytes(parsed, unit);
  const sizeChanged = bytes !== config.fileSizeLimit;
  const transformChanged = transform !== imageTransformationOn(config);
  const dirty = sizeChanged || transformChanged;

  const save = () =>
    startTransition(async () => {
      setProblem(null);
      try {
        // Only what changed. The API merges, so an untouched setting is better left unsent than
        // sent back at the value this tab happens to be holding.
        const result = await saveStorageConfig(projectRef, {
          ...(sizeChanged ? { size: { value: parsed, unit } } : {}),
          ...(transformChanged ? { imageTransformation: transform } : {}),
        });
        if (!result.ok) return setProblem(result.reason);
        await onSaved();
      } catch {
        setProblem("Could not reach the server.");
      }
    });

  return (
    <Card className="divide-y divide-border p-0">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-foreground">Enable image transformation</div>
          <p className="mt-0.5 text-xs text-subtle">Optimize and resize images on the fly.</p>
        </div>
        <Switch checked={transform} onCheckedChange={setTransform} disabled={pending} />
      </div>

      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-foreground">Global file size limit</div>
          <p className="mt-0.5 text-xs text-subtle">
            Restrict the size of files uploaded across all buckets.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={size}
            onChange={(e) => setSize(e.target.value)}
            disabled={pending}
            inputMode="numeric"
            aria-label="Global file size limit"
            className="w-28"
          />
          <Select value={unit} onValueChange={(next) => setUnit(next as SizeUnit)} disabled={pending}>
            <SelectTrigger className="w-28" aria-label="Unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIZE_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 p-4">
        {problem ? <p className="mr-auto text-xs text-destructive">{problem}</p> : null}
        {problemWithSize ? <p className="mr-auto text-xs text-warn">{problemWithSize}</p> : null}
        <Button size="sm" disabled={!dirty || !!problemWithSize || pending} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
}
