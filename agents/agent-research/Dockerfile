# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy shared module first (agent depends on it via relative imports)
COPY shared/package.json shared/package.json
COPY shared/ shared/

# Copy agent package files
COPY agents/agent-research/package*.json agents/agent-research/

# Install dependencies for both shared and agent
WORKDIR /app/shared
RUN npm ci --omit=dev

WORKDIR /app/agents/agent-research
RUN npm ci --omit=dev && npm cache clean --force

# Copy agent source code
COPY agents/agent-research/ .

# ── Production stage ─────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Copy shared module with node_modules
COPY --from=builder /app/shared ./shared

# Copy agent with node_modules
COPY --from=builder /app/agents/agent-research ./agents/agent-research

WORKDIR /app/agents/agent-research

# Create required directories
RUN mkdir -p logs output

# Run as non-root user for security
RUN chown -R node:node /app
USER node

# Cloud Run sets PORT=8080 by default
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 8080) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "index.js"]
