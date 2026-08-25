import { keyVar, prefixedEnv, type Framework } from "./types.ts";

export const vue: Framework = {
  key: "vue",
  label: "Vue.JS",
  icon: "VueJs",
  guide: "https://supabase.com/docs/guides/getting-started/quickstarts/vue",
  packages: ["@supabase/supabase-js"],
  shadcnRegistry: "@supabase/supabase-client-vue",
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
          name: "App.vue",
          language: "html",
          code: `<script setup>
  import { ref, onMounted } from 'vue'
  import { supabase } from '../utils/supabase'

  const todos = ref([])

  async function getTodos() {
    const { data } = await supabase.from('todos').select()
    todos.value = data
  }

  onMounted(() => {
    getTodos()
  })
</script>

<template>
  <ul>
    <li v-for="todo in todos" :key="todo.id">{{ todo.name }}</li>
  </ul>
</template>`,
        },
      ],
    },
  ],
};
