FROM oven/bun:1.4.3 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY services/geo/package.json services/geo/
COPY services/seismic/package.json services/seismic/
COPY services/hazards/package.json services/hazards/
COPY services/ops/package.json services/ops/
COPY apps/gateway/package.json apps/gateway/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile --ignore-scripts --filter '@geopulse/web'
COPY apps/web apps/web
WORKDIR /app/apps/web
# Nothing environment-specific is baked in: the browser calls same-origin /graphql, which
# server.mjs proxies to GRAPHQL_URL at runtime.
RUN bun run build

FROM node:24-slim
ENV NODE_ENV=production PORT=3000
# The SSR bundle keeps npm dependencies external, so the installed workspace comes along.
COPY --from=build /app /app
WORKDIR /app/apps/web
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
