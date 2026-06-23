# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy shared modules first (agents reference ../../shared via relative imports)
COPY shared/ ./shared/

# Copy agent-specific files
COPY agents/agent-write/package*.json ./agents/agent-write/

WORKDIR /app/agents/agent-write

RUN npm ci --omit=dev && npm cache clean --force

# Copy agent source code
COPY agents/agent-write/ ./

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Preserve directory structure for relative imports to shared/
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/agents/agent-write ./agents/agent-write

WORKDIR /app/agents/agent-write

# Run as non-root user
RUN chown -R node:node /app
USER node

# Cloud Run sets PORT=8080 by default
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 8080) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "index.js"]
