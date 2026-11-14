import type { GatewayPlugin } from "@graphql-hive/gateway-runtime";
import { CircuitBreaker, registry } from "@geopulse/shared";
import { Gauge } from "prom-client";

const breakerState = new Gauge({
  name: "geopulse_gateway_subgraph_circuit_open",
  help: "1 while the gateway fails fast for a subgraph whose circuit is open",
  labelNames: ["subgraph"],
  registers: [registry],
});

class UpstreamUnavailable extends Error {
  constructor(readonly status: number) {
    super(`upstream answered ${status}`);
  }
}

/**
 * A circuit breaker per subgraph. After `threshold` consecutive connection errors or 502–504
 * answers the gateway stops calling that subgraph for `cooldownMs` and fails its part of the plan
 * immediately; then a single request is let through to probe it (half-open).
 *
 * Without it every request touching a dead subgraph pays the full connect/retry time — in
 * Kubernetes a Service with no ready endpoints can leave a TCP connect hanging for 1–3 s.
 * The rest of the response is still served, so the client gets partial data quickly.
 */
export function useSubgraphCircuitBreaker(opts: { threshold: number; cooldownMs: number }): GatewayPlugin {
  const breakers = new Map<string, CircuitBreaker>();
  const breakerFor = (name: string) => {
    let breaker = breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker(`subgraph:${name}`, opts.threshold, opts.cooldownMs);
      breakers.set(name, breaker);
    }
    return breaker;
  };

  return {
    onFetch({ url, executionRequest, fetchFn, setFetchFn }) {
      // Only subgraph calls made while executing an operation (not supergraph polling etc.).
      if (!executionRequest) return;
      const name = new URL(url).hostname;
      const breaker = breakerFor(name);
      setFetchFn((input, init, context, info) =>
        breaker
          .run(async () => {
            const response = await fetchFn(input, init, context, info);
            if (response.status >= 502 && response.status <= 504) throw new UpstreamUnavailable(response.status);
            return response;
          })
          .catch((error) => {
            if (error instanceof UpstreamUnavailable) {
              // Hand the real upstream answer back; the breaker has already counted it.
              return new Response(JSON.stringify({ errors: [{ message: error.message }] }), {
                status: error.status,
                headers: { "content-type": "application/json" },
              });
            }
            throw error;
          })
          .finally(() => breakerState.set({ subgraph: name }, breaker.state === "open" ? 1 : 0)),
      );
    },
  };
}
