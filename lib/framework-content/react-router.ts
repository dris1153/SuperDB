import { prefixedEnv, type Framework } from "./types.ts";

/** Supabase still keys this one as `remix`; the label followed the framework's rename. */
export const reactRouter: Framework = {
  key: "react-router",
  label: "React Router",
  icon: "ReactRouter",
  guide:
    "https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=remix&environment=remix-loader",
  packages: ["@supabase/supabase-js", "@supabase/ssr"],
  shadcnRegistry: "@supabase/supabase-client-react-router",
  variants: [
    {
      key: "supabasejs",
      label: "supabase-js",
      files: (k) => [
        prefixedEnv(".env", "VITE", k),
        {
          name: "app/utils/supabase.server.ts",
          language: "ts",
          code: `import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";

export function createClient(request: Request) {
  const headers = new Headers();

  const supabase = createServerClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_${k.publishableKey ? "PUBLISHABLE_KEY" : "ANON_KEY"}!,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get("Cookie") ?? "") as {
            name: string;
            value: string;
          }[];
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            headers.append(
              "Set-Cookie",
              serializeCookieHeader(name, value, options)
            )
          );
        },
      },
    }
  );

  return { supabase, headers };
}`,
        },
        {
          name: "app/routes/_index.tsx",
          language: "tsx",
          code: `import type { Route } from "./+types/home";
import { createClient } from "~/utils/supabase.server";

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createClient(request);
  const { data: todos } = await supabase.from("todos").select();

  return { todos };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <ul>
        {loaderData.todos?.map((todo) => (
          <li key={todo.id}>{todo.name}</li>
        ))}
      </ul>
    </>
  );
}`,
        },
      ],
    },
  ],
};
