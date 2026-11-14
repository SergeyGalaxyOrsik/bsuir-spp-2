import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { DATABASE_URL } from "./env.ts";
import type { Logger } from "./logger.ts";

export type Sql = postgres.Sql<Record<string, unknown>>;
export type Fragment = postgres.PendingQuery<postgres.Row[]>;

export function createDb(service: string, max = 10): Sql {
  return postgres(DATABASE_URL(), {
    max,
    idle_timeout: 30,
    connect_timeout: 10,
    connection: { application_name: service, statement_timeout: 15_000 },
    onnotice: () => undefined,
    transform: { undefined: null },
  }) as Sql;
}

export async function waitForDb(sql: Sql, log: Logger, attempts = 30): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await sql`select 1`;
      return;
    } catch (error) {
      if (attempt >= attempts) throw error;
      log.warn({ attempt, err: (error as Error).message }, "database not ready, retrying");
      await new Promise((r) => setTimeout(r, Math.min(1000 * attempt, 5000)));
    }
  }
}

/**
 * Applies `*.sql` files from `dir` in lexical order, once each. Every service owns its own
 * schema and its own migration table, so services can be deployed independently.
 */
export async function migrate(sql: Sql, schema: string, dir: string, log: Logger): Promise<void> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  await sql.begin(async (tx) => {
    // Serialize concurrent replicas booting at the same time.
    await tx`select pg_advisory_xact_lock(hashtext(${`migrate:${schema}`}))`;
    await tx.unsafe(`create schema if not exists ${schema}`);
    await tx.unsafe(
      `create table if not exists ${schema}.schema_migrations (name text primary key, applied_at timestamptz not null default now())`,
    );
    const applied = new Set(
      (await tx.unsafe(`select name from ${schema}.schema_migrations`)).map((r) => r.name as string),
    );
    for (const file of files) {
      if (applied.has(file)) continue;
      const body = await readFile(path.join(dir, file), "utf8");
      await tx.unsafe(body);
      await tx.unsafe(`insert into ${schema}.schema_migrations (name) values ($1)`, [file]);
      log.info({ schema, file }, "migration applied");
    }
  });
}

/** Joins SQL fragments with AND; an empty list yields `true`. */
export function and(sql: Sql, parts: Fragment[]): Fragment {
  if (parts.length === 0) return sql`true`;
  return parts.reduce((acc, part) => sql`${acc} and ${part}`);
}
