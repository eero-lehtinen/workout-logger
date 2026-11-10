# syntax=docker/dockerfile:1

FROM node:24-slim AS build
ENV CI=true
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g "pnpm@$(node -p "require('./package.json').packageManager.slice('pnpm@'.length)")"
# Fetching from the lockfile alone keeps this layer cached until dependencies
# change, and new workspace packages need no Dockerfile change.
RUN pnpm fetch

COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter @workout-logger/web build
# Not --offline: deploy re-checks the release-age policy against registry
# metadata, which pnpm fetch doesn't store.
RUN pnpm --filter @workout-logger/server deploy --prod /out/server


FROM node:24-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app

# main.ts finds the web build at ../../web/dist, as in the repo.
COPY --from=build /out/server server
COPY --from=build /repo/apps/web/dist web/dist

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --start-interval=1s \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/status`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

ARG GIT_COMMIT
ENV GIT_COMMIT=${GIT_COMMIT}

CMD ["node", "server/src/main.ts"]
