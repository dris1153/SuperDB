import { keyVar, prefixedEnv, type Framework } from "./types.ts";

export const solid: Framework = {
  key: "solid",
  label: "Solid.js",
  icon: "SolidJS",
  guide: "https://supabase.com/docs/guides/getting-started/quickstarts/solidjs",
  packages: ["@supabase/supabase-js"],
  variants: [
    {
      key: "supabasejs",
      label: "supabase-js",
      files: (k) => [
        prefixedEnv(".env.local", "VITE", k),
        {
          name: "utils/supabase.ts",
          language: "ts",
          code: `import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.${keyVar("VITE", k)};

export const supabase = createClient(supabaseUrl, supabaseKey);`,
        },
        {
          name: "src/App.tsx",
          language: "tsx",
          code: `import { supabase } from '../utils/supabase'
import { createResource, For } from "solid-js";

async function getTodos() {
  const { data: todos } = await supabase.from("todos").select();
  return todos;
}

function App() {
  const [todos] = createResource(getTodos);

  return (
    <ul>
      <For each={todos()}>{(todo) => <li>{todo.name}</li>}</For>
    </ul>
  );
}

export default App;`,
        },
      ],
    },
  ],
};
