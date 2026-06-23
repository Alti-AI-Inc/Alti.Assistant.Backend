# ── Build Stage ────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy workspace root config (needed for pnpm workspace resolution)
COPY pnpm-workspace.yaml ./
COPY package.json ./

# Copy shared library
COPY shared/ ./shared/

# Copy agent package files
COPY agents/agent-code/package.json ./agents/agent-code/

# Install dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile --filter @alti/agent-code --filter @alti/shared

# Copy agent source code
COPY agents/agent-code/ ./agents/agent-code/

# ── Production Stage ──────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Copy everything from builder
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/agents/agent-code ./agents/agent-code
RUN mv ./agents/agent-code/node_modules ./node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/agents/agent-code/node_modules ./agents/agent-code/node_modules

# Run as non-root user for security
RUN chown -R node:node /app
USER node

WORKDIR /app/agents/agent-code

# Cloud Run sets PORT=8080 by default
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 8080) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "index.js"]
