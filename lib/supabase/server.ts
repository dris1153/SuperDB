import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function env() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
  return { url, anon };
}

export async function createClient() {
  const store = await cookies();
  const { url, anon } = env();
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Throws when called from a Server Component render; middleware refreshes the session there.
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {}
      },
    },
  });
}

export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not authenticated");
  return { supabase, user: data.user };
}
