# ─── Charming UI Backend ───────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace root config
COPY package.json package-lock.json tsconfig.base.json ./

# Copy workspace packages (package.json for dep install)
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/
COPY packages/backend/package.json packages/backend/tsconfig.json packages/backend/

# Install all workspace dependencies
RUN npm ci --workspaces --include-workspace-root

# Copy source code
COPY packages/shared/src packages/shared/src
COPY packages/backend/src packages/backend/src

# Build shared types then backend
RUN npm run build -w packages/shared
RUN npm run build -w packages/backend

# ─── Production stage ──────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Copy only what's needed at runtime
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/shared/package.json /app/packages/shared/
COPY --from=builder /app/packages/shared/dist /app/packages/shared/dist
COPY --from=builder /app/packages/backend/package.json /app/packages/backend/
COPY --from=builder /app/packages/backend/dist /app/packages/backend/dist

# Data directory
RUN mkdir -p /data
ENV CHARMING_HOME=/data

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "packages/backend/dist/index.js"]
