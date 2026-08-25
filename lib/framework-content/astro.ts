import { plainEnv, type Framework } from "./types.ts";

export const astro: Framework = {
  key: "astro",
  label: "Astro",
  icon: "Astro",
  // Supabase publishes no Astro quickstart, so the picker shows no guide link for it.
  packages: ["@supabase/supabase-js"],
  variants: [
    {
      key: "supabasejs",
      label: "supabase-js",
      files: (k) => [
        plainEnv(".env.local", k),
        {
          name: "src/db/supabase.js",
          language: "js",
          code: `import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseKey = import.meta.env.SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);`,
        },
        {
          name: "src/pages/index.astro",
          language: "html",
          code: `---
import { supabase } from '../db/supabase';

const { data, error } = await supabase.from("todos").select('*');
---

{
  (
    <ul>
      {data.map((entry) => (
        <li>{entry.name}</li>
      ))}
    </ul>
  )
}`,
        },
      ],
    },
  ],
};
