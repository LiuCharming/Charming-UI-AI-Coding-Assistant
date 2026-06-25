# ─── Charming UI Frontend ──────────────────────────────────
# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace root config
COPY package.json package-lock.json tsconfig.base.json ./

# Copy workspace packages (package.json for dep install)
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/
COPY packages/frontend/package.json packages/frontend/tsconfig.json packages/frontend/
COPY packages/frontend/vite.config.ts packages/frontend/
COPY packages/frontend/index.html packages/frontend/

# Install dependencies
RUN npm ci --workspaces --include-workspace-root

# Copy source code
COPY packages/shared/src packages/shared/src
COPY packages/frontend/src packages/frontend/src
COPY packages/frontend/index.html packages/frontend/

# Build shared types then frontend (tsc -b && vite build)
RUN npm run build -w packages/shared
RUN npm run build -w packages/frontend

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built frontend assets
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html

# Nginx config with API + WebSocket proxy
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
