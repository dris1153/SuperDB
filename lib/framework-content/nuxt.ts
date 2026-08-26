import { plainEnv, type Framework } from "./types.ts";

export const nuxt: Framework = {
  key: "nuxt",
  label: "Nuxt",
  icon: "NuxtJs",
  guide: "https://supabase.com/docs/guides/getting-started/quickstarts/nuxtjs",
  packages: ["@supabase/supabase-js"],
  variants: [
    {
      key: "supabasejs",
      label: "supabase-js",
      files: (k) => [
        plainEnv(".env.local", k),
        {
          name: "nuxt.config.ts",
          language: "ts",
          code: `export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_KEY,
    },
  },
})`,
        },
        {
          name: "app.vue",
          language: "html",
          code: `<script setup>
import { ref, onMounted } from 'vue'
import { createClient } from '@supabase/supabase-js'

const config = useRuntimeConfig()
const supabase = createClient(config.public.supabaseUrl, config.public.supabaseKey)

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
