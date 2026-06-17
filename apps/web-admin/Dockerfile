# syntax=docker/dockerfile:1.7
# Multi-stage build for apps/web-admin (pnpm workspace).
# Build context: monorepo root. Admin surface — further hardening (CSP, IP allow-list)
# lands in Sprint 3 per 07_SprintDevelopmentPlan §Sprint 3.

ARG NODE_VERSION=20-alpine
ARG NGINX_VERSION=1.27-alpine

FROM node:${NODE_VERSION} AS build
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /repo

COPY pnpm-workspace.yaml package.json ./
COPY pnpm-lock.yaml* ./
COPY packages/design-system/package.json ./packages/design-system/
COPY packages/auth-client/package.json ./packages/auth-client/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/ui/package.json ./packages/ui/
COPY apps/web-student/package.json ./apps/web-student/
COPY apps/web-portal/package.json ./apps/web-portal/
COPY apps/web-admin/package.json ./apps/web-admin/

RUN pnpm install --frozen-lockfile=false

COPY packages/design-system ./packages/design-system
COPY packages/auth-client ./packages/auth-client
COPY packages/api-client ./packages/api-client
COPY packages/ui ./packages/ui
COPY apps/web-admin ./apps/web-admin

RUN pnpm --filter=@alp/design-system build \
 && pnpm --filter=@alp/auth-client build \
 && pnpm --filter=@alp/api-client build \
 && pnpm --filter=@alp/ui build \
 && pnpm --filter=@alp/web-admin build

FROM nginx:${NGINX_VERSION} AS runtime
COPY apps/web-admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web-admin/dist /usr/share/nginx/html

RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx \
 && touch /var/run/nginx.pid \
 && chown nginx:nginx /var/run/nginx.pid
USER nginx

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
