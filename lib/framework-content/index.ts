import { astro } from "./astro.ts";
import { nextjs } from "./nextjs.ts";
import { nuxt } from "./nuxt.ts";
import { react } from "./react.ts";
import { reactRouter } from "./react-router.ts";
import { refine } from "./refine.ts";
import { solid } from "./solid.ts";
import { sveltekit } from "./sveltekit.ts";
import { tanstack } from "./tanstack.ts";
import { vue } from "./vue.ts";
import type { Framework } from "./types.ts";

export * from "./types.ts";

/** Ordered as Supabase's own picker orders them. */
export const FRAMEWORKS: Framework[] = [
  nextjs,
  reactRouter,
  react,
  nuxt,
  vue,
  sveltekit,
  solid,
  astro,
  refine,
  tanstack,
];

/** Listed but disabled: Supabase covers these, SuperDB has not transcribed them yet. */
export const PENDING_FRAMEWORKS = [
  { key: "flask", label: "Flask (Python)", icon: "Python" },
  { key: "expo", label: "Expo React Native", icon: "React" },
  { key: "flutter", label: "Flutter", icon: "Flutter" },
  { key: "ionic-react", label: "Ionic React", icon: "Ionic" },
  { key: "swift", label: "Swift", icon: "Swift" },
  { key: "android-kotlin", label: "Android Kotlin", icon: "Kotlin" },
];

export const frameworkFor = (key: string) => FRAMEWORKS.find((f) => f.key === key);

export function variantFor(framework: Framework, key: string | null) {
  return framework.variants.find((v) => v.key === key) ?? framework.variants[0];
}

/** Variant packages win when set — App Router needs @supabase/ssr, Pages Router does not. */
export const installCommand = (framework: Framework, variantKey: string | null) =>
  `npm install ${(variantFor(framework, variantKey).packages ?? framework.packages).join(" ")}`;
