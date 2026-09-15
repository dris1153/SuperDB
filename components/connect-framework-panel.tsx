"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { IconExternalLink } from "@tabler/icons-react";
import {
  Astro,
  Flutter,
  Ionic,
  Kotlin,
  NextJs,
  NuxtJs,
  Python,
  React as ReactLogo,
  ReactRouter,
  SolidJS,
  SvelteJS,
  Swift,
  TanStack,
  VueJs,
} from "developer-icons";
import {
  buildFrameworkGuide,
  getProjectKeys,
  type FrameworkGuide,
  type ProjectKeysResult,
} from "@/lib/framework-actions";
import {
  FRAMEWORKS,
  PENDING_FRAMEWORKS,
  frameworkFor,
} from "@/lib/framework-content";
import { Copyable, Step, StepFiles, StepSkeleton } from "./connect-primitives";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Switch } from "./ui/switch";

const LOGOS: Record<
  string,
  ComponentType<{ size?: number; className?: string }>
> = {
  Astro,
  Flutter,
  Ionic,
  Kotlin,
  NextJs,
  NuxtJs,
  Python,
  React: ReactLogo,
  ReactRouter,
  SolidJS,
  SvelteJS,
  Swift,
  TanStack,
  VueJs,
};

/** developer-icons has no logo for every framework; a lettered tile stands in so rows stay aligned. */
function Logo({ name, label }: { name: string | null; label: string }) {
  const Icon = name ? LOGOS[name] : undefined;
  if (Icon) return <Icon size={14} className="shrink-0" />;
  return (
    <span className="flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border border-border text-[9px] text-subtle">
      {label[0]}
    </span>
  );
}

function Field({
  label,
  top,
  children,
}: {
  label: string;
  top?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`grid gap-2 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] ${top ? "sm:items-start" : "sm:items-center"}`}
    >
      <div className={`text-sm text-foreground ${top ? "sm:pt-0.5" : ""}`}>
        {label}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function FrameworkPanel({ projectRef }: { projectRef: string }) {
  const [frameworkKey, setFrameworkKey] = useState(FRAMEWORKS[0].key);
  const [variantKey, setVariantKey] = useState(FRAMEWORKS[0].variants[0].key);
  const [shadcn, setShadcn] = useState(false);
  const [keys, setKeys] = useState<ProjectKeysResult | null>(null);
  const [guide, setGuide] = useState<FrameworkGuide | null>(null);
  const [pending, setPending] = useState(false);

  // Each selection is built once. Switching back to something already seen costs nothing, which is
  // most of what people do here.
  const built = useRef(new Map<string, FrameworkGuide>());

  const framework = frameworkFor(frameworkKey) ?? FRAMEWORKS[0];

  useEffect(() => {
    let cancelled = false;
    getProjectKeys(projectRef).then((result) => {
      if (!cancelled) setKeys(result);
    });
    return () => {
      cancelled = true;
    };
  }, [projectRef]);

  useEffect(() => {
    if (!keys || keys.blocked) return;

    const id = `${frameworkKey}/${variantKey}/${shadcn}`;
    const cached = built.current.get(id);
    if (cached) {
      setGuide(cached);
      return;
    }

    // The previous steps stay on screen, dimmed, rather than collapsing into a skeleton.
    let cancelled = false;
    setPending(true);
    buildFrameworkGuide(keys.keys, frameworkKey, variantKey, shadcn).then(
      (result) => {
        if (cancelled) return;
        built.current.set(id, result);
        setGuide(result);
        setPending(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [keys, frameworkKey, variantKey, shadcn]);

  // Variant and the shadcn toggle both belong to the outgoing framework, so neither survives a swap.
  function selectFramework(key: string) {
    const next = frameworkFor(key);
    if (!next) return;
    setFrameworkKey(key);
    setVariantKey(next.variants[0].key);
    if (!next.shadcnRegistry) setShadcn(false);
  }

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="space-y-4 px-5">
        <Field label="Framework">
          <Select value={frameworkKey} onValueChange={selectFramework}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FRAMEWORKS.map((f) => (
                <SelectItem key={f.key} value={f.key}>
                  <Logo name={f.icon} label={f.label} />
                  {f.label}
                </SelectItem>
              ))}
              {PENDING_FRAMEWORKS.map((f) => (
                <SelectItem key={f.key} value={f.key} disabled>
                  <Logo name={f.icon} label={f.label} />
                  {f.label}
                  <span className="ml-auto text-[10px] tracking-wide text-subtle uppercase">
                    soon
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {framework.variants.length > 1 ? (
          <Field label="Variant">
            <Select value={variantKey} onValueChange={setVariantKey}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {framework.variants.map((v) => (
                  <SelectItem key={v.key} value={v.key}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        {framework.shadcnRegistry ? (
          <Field label="Shadcn" top>
            <Switch
              checked={shadcn}
              onCheckedChange={setShadcn}
              aria-label="Use shadcn blocks"
            />
            <p className="mt-1.5 text-xs text-subtle">
              Install Supabase Library blocks with shadcn.
            </p>
          </Field>
        ) : null}

        {framework.guide ? (
          <a
            href={framework.guide}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-subtle hover:text-foreground"
          >
            {framework.label} guide on supabase.com
            <IconExternalLink size={12} stroke={1.5} />
          </a>
        ) : null}
      </div>

      <div className="px-5 pt-6 pb-5 flex-1 border-t border-border  space-y-6 bg-secondary">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base text-foreground">Follow these steps</h3>
          {guide ? <Copyable value={guide.prompt} label="Copy prompt" /> : null}
        </div>

        {keys?.blocked ? (
          <p className="text-sm text-subtle">{keys.reason}</p>
        ) : guide === null ? (
          <StepSkeleton steps={3} />
        ) : (
          <div
            className={`space-y-6 transition-opacity ${pending ? "opacity-50" : ""}`}
          >
            {guide.steps.map((step, index) => (
              <Step
                key={step.title}
                index={index + 1}
                title={step.optional ? `${step.title} (optional)` : step.title}
                description={step.description}
              >
                {/* Keyed by the file set so switching frameworks starts back on the first tab. */}
                <StepFiles
                  key={step.files.map((f) => f.name).join()}
                  step={step}
                />
              </Step>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
