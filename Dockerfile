# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=26.13.0
FROM node:${NODE_VERSION}-trixie-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
USER node
RUN mkdir -p /home/node/app
WORKDIR /home/node/app

FROM base AS build
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 npm ci
COPY --chown=node:node . .
RUN BUILD_STANDALONE=1 npm run build

FROM base AS production
ARG NODE_VERSION
LABEL org.opencontainers.image.authors="Sayak Mukhopadhyay" \
      org.opencontainers.image.url="https://github.com/orgs/kode-blox/packages/container/package/autodidact" \
      org.opencontainers.image.documentation="https://autodidact.kodeblox.com" \
      org.opencontainers.image.vendor="kode-blox" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.title="AutoDidact" \
      org.opencontainers.image.description="Self-hosted course reader for personal learning" \
      org.opencontainers.image.base.name="docker.io/library/node:${NODE_VERSION}-trixie-slim"

ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=8080
COPY --from=build --chown=node:node /home/node/app/.next/standalone ./
COPY --from=build --chown=node:node /home/node/app/.next/static ./.next/static
COPY --from=build --chown=node:node /home/node/app/public ./public
COPY --chown=node:node LICENSE ./
EXPOSE 8080 9090
CMD ["node", "server.js"]
