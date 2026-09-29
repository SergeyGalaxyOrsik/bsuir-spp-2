FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock turbo.json tsconfig.json ./
COPY packages/contract/package.json packages/contract/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile
COPY packages/contract packages/contract
COPY apps/api apps/api
RUN cd apps/api && bun run build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app/apps/api
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/migrations ./migrations
COPY --from=build /app/apps/api/package.json ./package.json
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3001
CMD ["node", "dist/server.js"]
