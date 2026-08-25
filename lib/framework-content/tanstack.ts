import { plainEnv, type Framework } from "./types.ts";

export const tanstack: Framework = {
  key: "tanstack",
  label: "TanStack Start",
  icon: "TanStack",
  guide: "https://supabase.com/docs/guides/getting-started/quickstarts/tanstack",
  packages: ["@supabase/supabase-js"],
  shadcnRegistry: "@supabase/supabase-client-tanstack",
  variants: [
    {
      key: "supabasejs",
      label: "supabase-js",
      files: (k) => [
        plainEnv(".env", k, "VITE"),
        {
          name: "src/utils/supabase.ts",
          language: "ts",
          code: `import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);`,
        },
        {
          name: "src/routes/index.tsx",
          language: "tsx",
          code: `import { createFileRoute } from '@tanstack/react-router'
import { supabase } from '../utils/supabase'

export const Route = createFileRoute('/')({
  loader: async () => {
    const { data: todos } = await supabase.from('todos').select()
    return { todos }
  },
  component: Home,
})

function Home() {
  const { todos } = Route.useLoaderData()

  return (
    <ul>
      {todos?.map((todo) => (
        <li key={todo.id}>{todo.name}</li>
      ))}
    </ul>
  )
}`,
        },
      ],
    },
  ],
};
