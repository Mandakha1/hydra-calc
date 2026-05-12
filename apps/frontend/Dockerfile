# syntax=docker/dockerfile:1.6
# ---- build ----
FROM node:20-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY apps/frontend/package.json apps/frontend/
COPY packages/shared/package.json packages/shared/
RUN pnpm fetch --prod=false
COPY . .
RUN pnpm install --frozen-lockfile --offline
WORKDIR /repo/apps/frontend
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm build

# ---- runtime — tiny static server ----
FROM nginx:alpine AS runtime
COPY --from=build /repo/apps/frontend/dist /usr/share/nginx/html
RUN rm /etc/nginx/conf.d/default.conf
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O - http://localhost/ >/dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
