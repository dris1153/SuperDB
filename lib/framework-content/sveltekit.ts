import { keyVar, prefixedEnv, type Framework } from "./types.ts";

export const sveltekit: Framework = {
  key: "sveltekit",
  label: "SvelteKit",
  icon: "SvelteJS",
  guide: "https://supabase.com/docs/guides/getting-started/quickstarts/sveltekit",
  packages: ["@supabase/supabase-js"],
  variants: [
    {
      key: "supabasejs",
      label: "supabase-js",
      files: (k) => [
        prefixedEnv(".env.local", "PUBLIC", k),
        {
          name: "src/lib/supabaseClient.js",
          language: "js",
          code: `import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL, ${keyVar("PUBLIC", k)} } from "$env/static/public"

const supabaseUrl = PUBLIC_SUPABASE_URL;
const supabaseKey = ${keyVar("PUBLIC", k)};

export const supabase = createClient(supabaseUrl, supabaseKey);`,
        },
        {
          name: "src/routes/+page.server.js",
          language: "js",
          code: `import { supabase } from "$lib/supabaseClient";

export async function load() {
  const { data } = await supabase.from("countries").select();
  return {
    countries: data ?? [],
  };
}`,
        },
        {
          name: "src/routes/+page.svelte",
          language: "html",
          code: `<script>
  export let data;
</script>

<ul>
  {#each data.countries as country}
    <li>{country.name}</li>
  {/each}
</ul>`,
        },
      ],
    },
  ],
};
