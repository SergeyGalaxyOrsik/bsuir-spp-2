import { GraphQLError } from "graphql";
import type { Fragment, Sql } from "./db.ts";

export const MAX_PAGE_SIZE = 100;

export interface SortOption {
  /** Trusted SQL expression (never user input). Must be non-null for keyset pagination. */
  expr: string;
  /** Postgres type used to cast cursor values. */
  cast: "float8" | "int8" | "timestamptz" | "text";
}

export interface Cursor {
  v: string | number;
  id: string | number;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(raw: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Cursor;
    if (parsed && "v" in parsed && "id" in parsed) return parsed;
  } catch {
    // fall through
  }
  throw new GraphQLError("Invalid pagination cursor", { extensions: { code: "BAD_USER_INPUT" } });
}

export function clampFirst(first: number | null | undefined, fallback = 25): number {
  const value = first ?? fallback;
  if (value < 0) throw new GraphQLError("`first` must be non-negative", { extensions: { code: "BAD_USER_INPUT" } });
  return Math.min(value, MAX_PAGE_SIZE);
}

export interface PageArgs {
  first?: number | null;
  after?: string | null;
}

export interface Connection<T> {
  edges: { cursor: string; node: T }[];
  nodes: T[];
  pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean; startCursor: string | null; endCursor: string | null };
  totalCount: () => Promise<number>;
}

/**
 * Keyset (seek) pagination: `ORDER BY expr, id` with a row-value comparison against the
 * cursor, so deep pages cost the same as the first one.
 */
export async function keysetConnection<T extends Record<string, unknown>>(opts: {
  sql: Sql;
  from: Fragment;
  where: Fragment;
  sort: SortOption;
  idColumn: string;
  descending: boolean;
  args: PageArgs;
  select?: Fragment;
  mapRow?: (row: Record<string, unknown>) => T;
}): Promise<Connection<T>> {
  const { sql, from, where, sort, idColumn, descending, args } = opts;
  const first = clampFirst(args.first);
  const dir = sql.unsafe(descending ? "desc" : "asc");
  const cmp = sql.unsafe(descending ? "<" : ">");
  const sortExpr = sql.unsafe(sort.expr);
  const idExpr = sql.unsafe(idColumn);
  const cursor = args.after ? decodeCursor(args.after) : null;
  const seek = cursor
    ? sql`(${sortExpr}, ${idExpr}) ${cmp} (${cursor.v}::${sql.unsafe(sort.cast)}, ${cursor.id})`
    : sql`true`;

  const rows = await sql`
    select ${opts.select ?? sql`*`}, ${sortExpr} as __sort, ${idExpr} as __id
    from ${from}
    where ${where} and ${seek}
    order by ${sortExpr} ${dir}, ${idExpr} ${dir}
    limit ${first + 1}`;

  const page = rows.slice(0, first);
  const edges = page.map((row) => {
    const sortValue = row.__sort instanceof Date ? row.__sort.toISOString() : (row.__sort as string | number);
    return {
      cursor: encodeCursor({ v: sortValue, id: row.__id as string | number }),
      node: (opts.mapRow ? opts.mapRow(row) : row) as T,
    };
  });

  let total: Promise<number> | undefined;
  return {
    edges,
    nodes: edges.map((e) => e.node),
    pageInfo: {
      hasNextPage: rows.length > first,
      hasPreviousPage: cursor !== null,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges.at(-1)?.cursor ?? null,
    },
    totalCount: () => {
      total ??= sql`select count(*)::int as n from ${from} where ${where}`.then((r) => r[0]!.n as number);
      return total;
    },
  };
}
