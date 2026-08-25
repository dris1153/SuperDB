import { plainEnv, type Framework } from "./types.ts";

export const refine: Framework = {
  key: "refine",
  label: "Refine",
  // developer-icons ships no Refine logo; the picker falls back to a lettered tile.
  icon: null,
  guide: "https://supabase.com/docs/guides/getting-started/quickstarts/refine",
  packages: ["@supabase/supabase-js"],
  variants: [
    {
      key: "supabasejs",
      label: "supabase-js",
      files: (k) => [
        plainEnv(".env.local", k),
        {
          name: "src/utility/supabaseClient.ts",
          language: "ts",
          code: `import { createClient } from "@refinedev/supabase";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: {
    schema: "public",
  },
  auth: {
    persistSession: true,
  },
});`,
        },
        {
          name: "src/App.tsx",
          language: "tsx",
          code: `import { Refine } from "@refinedev/core";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";
import routerProvider, {
  DocumentTitleHandler,
  NavigateToResource,
  UnsavedChangesNotifier,
} from "@refinedev/react-router";
import { dataProvider, liveProvider } from "@refinedev/supabase";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import "./App.css";
import authProvider from "./authProvider";
import { supabaseClient } from "./utility";
import { CountriesCreate, CountriesEdit, CountriesList, CountriesShow } from "./pages/countries";

function App() {
  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <Refine
          dataProvider={dataProvider(supabaseClient)}
          liveProvider={liveProvider(supabaseClient)}
          authProvider={authProvider}
          routerProvider={routerProvider}
          options={{
            syncWithLocation: true,
            warnWhenUnsavedChanges: true,
          }}
          resources={[{
            name: "countries",
            list: "/countries",
            create: "/countries/create",
            edit: "/countries/edit/:id",
            show: "/countries/show/:id"
          }]}>
          <Routes>
            <Route index
              element={<NavigateToResource resource="countries" />}
            />
            <Route path="/countries">
              <Route index element={<CountriesList />} />
              <Route path="create" element={<CountriesCreate />} />
              <Route path="edit/:id" element={<CountriesEdit />} />
              <Route path="show/:id" element={<CountriesShow />} />
            </Route>
          </Routes>
          <RefineKbar />
          <UnsavedChangesNotifier />
          <DocumentTitleHandler />
        </Refine>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;`,
        },
      ],
    },
  ],
};
