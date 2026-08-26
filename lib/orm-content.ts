import type { SourceFile } from "./guide-steps";

/**
 * ORM quickstarts, transcribed from Supabase's own Connect sheet
 * (ConnectSheet/content/{prisma,drizzle}).
 *
 * Supabase branches this content six ways — CLI, self-hosted, high availability, dedicated pooler,
 * shared-with-dedicated-alternative, and shared. SuperDB reaches hosted projects through the
 * Management API and never learns which of the other five applies, so only the shared-pooler case
 * is rendered. Guessing here would hand someone a DATABASE_URL that fails in production.
 */
export type PoolerStrings = { transaction: string; session: string };

export type Orm = {
  key: string;
  label: string;
  /** Export name in `developer-icons`. Null falls back to a lettered tile. */
  icon: string | null;
  install: string[];
  files: (pooler: PoolerStrings) => SourceFile[];
};

/** Prisma routes migrations around the pooler, so its transaction URL needs the pgbouncer flag. */
const withPgbouncer = (uri: string) => `${uri}${uri.includes("?") ? "&" : "?"}pgbouncer=true`;

export const ORMS: Orm[] = [
  {
    key: "prisma",
    label: "Prisma",
    icon: "Prisma",
    install: ["npm install prisma --save-dev", "npx prisma init"],
    files: (pooler) => [
      {
        name: ".env.local",
        language: "bash",
        code: `# Connect to Postgres via the shared transaction-mode pooler (IPv4-only)
DATABASE_URL="${withPgbouncer(pooler.transaction)}"

# Connect to Postgres via the shared session-mode pooler (used for migrations)
DIRECT_URL="${pooler.session}"
`,
      },
      {
        name: "prisma/schema.prisma",
        language: "bash",
        code: `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}`,
      },
    ],
  },
  {
    key: "drizzle",
    label: "Drizzle",
    // developer-icons ships no Drizzle logo.
    icon: null,
    install: ["npm install drizzle-orm", "npm install drizzle-kit --save-dev"],
    files: (pooler) => [
      {
        name: ".env",
        language: "bash",
        code: `# Connect to Postgres via the shared transaction-mode pooler (IPv4-only)
DATABASE_URL="${pooler.transaction}"
`,
      },
      {
        name: "drizzle/schema.ts",
        language: "tsx",
        code: `import { pgTable, serial, text, varchar } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  fullName: text('full_name'),
  phone: varchar('phone', { length: 256 }),
});`,
      },
      {
        name: "index.tsx",
        language: "tsx",
        code: `import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { users } from './drizzle/schema'

const connectionString = process.env.DATABASE_URL

// Disable prefetch as it is not supported for "Transaction" pool mode
const client = postgres(connectionString, { prepare: false })
const db = drizzle(client);

const allUsers = await db.select().from(users);`,
      },
    ],
  },
];

export const ormFor = (key: string) => ORMS.find((o) => o.key === key);
