# ─────────────────────────────────────────────────────────────────────────────
# Audio Agent Dockerfile
# Build context must be the Backend root (../../) so shared/ is accessible.
#
# Build:
#   docker build -t agent-audio -f agents/agent-audio/Dockerfile .
# ─────────────────────────────────────────────────────────────────────────────

# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy agent package files and install dependencies
COPY agents/agent-audio/package*.json ./agents/agent-audio/
RUN cd agents/agent-audio && npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

# Copy shared modules
COPY shared/ ./shared/

# Copy agent source
COPY agents/agent-audio/ ./agents/agent-audio/

# Production stage
FROM node:20-slim

WORKDIR /app

# Copy pre-built node_modules
COPY --from=builder /app/agents/agent-audio/node_modules ./agents/agent-audio/node_modules

# Copy shared modules (agents import via relative paths)
COPY --from=builder /app/shared ./shared

# Copy agent code
COPY --from=builder /app/agents/agent-audio ./agents/agent-audio
RUN mv ./agents/agent-audio/node_modules ./node_modules

# Run as non-root user for security
RUN chown -R node:node /app
USER node

WORKDIR /app/agents/agent-audio

# Cloud Run sets PORT=8080 by default
EXPOSE 8080

# Docker-level health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 8080) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "--dns-result-order=ipv4first", "index.js"]
