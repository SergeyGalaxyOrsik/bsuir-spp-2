import type { TypedDocumentString } from "@/graphql/gen/graphql"

export const GRAPHQL_URL =
  typeof window === "undefined"
    ? (process.env.GRAPHQL_URL ?? "http://localhost:4000/graphql")
    : (import.meta.env.VITE_GRAPHQL_URL ?? "http://localhost:4000/graphql")

export interface GraphQLErrorShape {
  message: string
  path?: (string | number)[]
  extensions?: Record<string, unknown>
}

export interface OperationTrace {
  id: number
  name: string
  kind: "query" | "mutation"
  durationMs: number
  cost?: number
  cacheHit?: boolean
  errors: number
  status: number
  at: number
}

export class GraphQLRequestError extends Error {
  constructor(
    message: string,
    readonly errors: GraphQLErrorShape[],
    readonly status: number,
  ) {
    super(message)
  }
}

type Listener = (trace: OperationTrace) => void
const listeners = new Set<Listener>()
let traceId = 0

/** Subscribe to every executed operation (used by the in-app GraphQL inspector). */
export function onOperation(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function operationName(query: string) {
  const match = /(query|mutation)\s+(\w+)/.exec(query)
  return { kind: (match?.[1] ?? "query") as "query" | "mutation", name: match?.[2] ?? "anonymous" }
}

export interface ExecuteResult<T> {
  data: T
  /** Non-fatal errors: the federated response still has data (e.g. one subgraph is down). */
  errors: GraphQLErrorShape[]
  extensions?: Record<string, unknown>
}

/** Executes a typed document against the federated gateway. */
export async function executeRaw<TResult, TVariables>(
  document: TypedDocumentString<TResult, TVariables> | string,
  variables?: TVariables,
  signal?: AbortSignal,
): Promise<ExecuteResult<TResult>> {
  const query = document.toString()
  const started = performance.now()
  const { kind, name } = operationName(query)
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/graphql-response+json, application/json" },
    body: JSON.stringify({ query, variables }),
    signal,
  })
  let body: { data?: TResult | null; errors?: GraphQLErrorShape[]; extensions?: Record<string, unknown> }
  try {
    body = await res.json()
  } catch {
    throw new GraphQLRequestError(`Gateway responded with HTTP ${res.status}`, [], res.status)
  }
  const errors = body.errors ?? []
  const ext = body.extensions as { cost?: { estimated?: number }; responseCache?: { hit?: boolean } } | undefined
  const trace: OperationTrace = {
    id: ++traceId,
    name,
    kind,
    durationMs: Math.round(performance.now() - started),
    cost: ext?.cost?.estimated,
    cacheHit: ext?.responseCache?.hit,
    errors: errors.length,
    status: res.status,
    at: Date.now(),
  }
  listeners.forEach((l) => l(trace))
  if (body.data == null) {
    const message = errors[0]?.message ?? `Gateway responded with HTTP ${res.status}`
    throw new GraphQLRequestError(message, errors, res.status)
  }
  return { data: body.data, errors, extensions: body.extensions }
}

export async function execute<TResult, TVariables>(
  document: TypedDocumentString<TResult, TVariables>,
  variables?: TVariables,
): Promise<TResult> {
  return (await executeRaw(document, variables)).data
}

export function isRetryable(error: unknown) {
  if (error instanceof GraphQLRequestError) {
    if (error.status === 429 || error.status >= 500) return true
    return error.errors.length === 0
  }
  return true
}
