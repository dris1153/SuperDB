import { keyVar, prefixedEnv, type Framework } from "./types.ts";

const P = "NEXT_PUBLIC";

export const nextjs: Framework = {
  key: "nextjs",
  label: "Next.js",
  icon: "NextJs",
  guide: "https://supabase.com/docs/guides/getting-started/quickstarts/nextjs",
  packages: ["@supabase/supabase-js"],
  shadcnRegistry: "@supabase/supabase-client-nextjs",
  variants: [
    {
      key: "app",
      label: "App Router",
      packages: ["@supabase/supabase-js", "@supabase/ssr"],
      files: (k) => [
        prefixedEnv(".env.local", P, k),
        {
          name: "page.tsx",
          language: "tsx",
          code: `import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

export default async function Page() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: todos } = await supabase.from('todos').select()

  return (
    <ul>
      {todos?.map((todo) => (
        <li key={todo.id}>{todo.name}</li>
      ))}
    </ul>
  )
}`,
        },
        {
          name: "utils/supabase/server.ts",
          language: "ts",
          code: `import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.${P}_SUPABASE_URL;
const supabaseKey = process.env.${keyVar(P, k)};

export const createClient = (cookieStore: Awaited<ReturnType<typeof cookies>>) => {
  return createServerClient(
    supabaseUrl!,
    supabaseKey!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // The \`setAll\` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  );
};`,
        },
        {
          name: "utils/supabase/client.ts",
          language: "ts",
          code: `import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.${P}_SUPABASE_URL;
const supabaseKey = process.env.${keyVar(P, k)};

export const createClient = () =>
  createBrowserClient(
    supabaseUrl!,
    supabaseKey!,
  );`,
        },
        {
          name: "utils/supabase/middleware.ts",
          language: "ts",
          code: `import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.${P}_SUPABASE_URL;
const supabaseKey = process.env.${keyVar(P, k)};

export const createClient = (request: NextRequest) => {
  // Create an unmodified response
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    supabaseUrl!,
    supabaseKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    },
  );

  return supabaseResponse
};`,
        },
      ],
    },
    {
      key: "pages",
      label: "Pages Router",
      files: (k) => [
        prefixedEnv(".env.local", P, k),
        {
          name: "utils/supabase.ts",
          language: "ts",
          code: `import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.${P}_SUPABASE_URL!;
const supabaseKey = process.env.${keyVar(P, k)}!;

export const supabase = createClient(supabaseUrl, supabaseKey);`,
        },
        {
          name: "pages/index.tsx",
          language: "tsx",
          code: `import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'

export default function Page() {
  const [todos, setTodos] = useState([])

  useEffect(() => {
    async function getTodos() {
      const { data: todos } = await supabase.from('todos').select()

      if (todos) {
        setTodos(todos)
      }
    }

    getTodos()
  }, [])

  return (
    <ul>
      {todos.map((todo) => (
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
