import { keyVar, prefixedEnv, type Framework } from "./types.ts";

const listPage = (importPath: string) => `import { useState, useEffect } from 'react'
import { supabase } from '${importPath}'

export default function App() {
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
}`;

export const react: Framework = {
  key: "react",
  label: "React",
  icon: "React",
  guide: "https://supabase.com/docs/guides/getting-started/quickstarts/reactjs",
  packages: ["@supabase/supabase-js"],
  // Supabase's own dashboard points React at the react-router registry item; this is the one that
  // actually matches a plain React app.
  shadcnRegistry: "@supabase/supabase-client-react",
  variants: [
    {
      key: "vite",
      label: "Vite",
      files: (k) => [
        prefixedEnv(".env", "VITE", k),
        {
          name: "utils/supabase.ts",
          language: "ts",
          code: `import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.${keyVar("VITE", k)};

export const supabase = createClient(supabaseUrl, supabaseKey);`,
        },
        { name: "App.tsx", language: "tsx", code: listPage("./utils/supabase") },
      ],
    },
    {
      key: "create-react-app",
      label: "Create React App",
      files: (k) => [
        prefixedEnv(".env.local", "REACT_APP", k),
        {
          name: "utils/supabase.ts",
          language: "ts",
          code: `import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.${keyVar("REACT_APP", k)};

export const supabase = createClient(supabaseUrl, supabaseKey);`,
        },
        { name: "App.tsx", language: "tsx", code: listPage("./utils/supabase") },
      ],
    },
  ],
};
