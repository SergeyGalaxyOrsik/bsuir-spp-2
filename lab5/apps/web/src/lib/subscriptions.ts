import { createClient, type Client } from "graphql-sse"
import { useEffect, useRef } from "react"
import { GRAPHQL_URL } from "./graphql"
import type { TypedDocumentString } from "@/graphql/gen/graphql"

let client: Client | undefined

function getClient() {
  // Distinct-connections mode: plain SSE responses to POST requests, as served by Hive Gateway.
  client ??= createClient({ url: GRAPHQL_URL, singleConnection: false, retryAttempts: Infinity })
  return client
}

/** Runs a GraphQL subscription over SSE for the lifetime of the component. */
export function useSubscription<TResult, TVariables>(
  document: TypedDocumentString<TResult, TVariables>,
  variables: TVariables,
  onData: (data: TResult) => void,
  enabled = true,
) {
  const handler = useRef(onData)
  handler.current = onData
  const key = JSON.stringify(variables)

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return
    const dispose = getClient().subscribe<TResult>(
      { query: document.toString(), variables: JSON.parse(key) },
      {
        next: (value) => value.data && handler.current(value.data),
        error: (err) => console.warn("subscription error", err),
        complete: () => undefined,
      },
    )
    return () => dispose()
  }, [document, key, enabled])
}
