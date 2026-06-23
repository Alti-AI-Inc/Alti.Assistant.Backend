# ── Build Stage ────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

# sharp requires build tools for native bindings
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy shared modules first (changes less often → better cache)
COPY shared/ ./shared/

# Copy agent package files for dependency install
COPY agents/agent-image/package.json agents/agent-image/package-lock.json* ./agents/agent-image/

WORKDIR /app/agents/agent-image
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy agent source code
WORKDIR /app
COPY agents/agent-image/ ./agents/agent-image/

# ── Production Stage ──────────────────────────────────────────────────────────
FROM node:20-slim AS production

WORKDIR /app

# Copy everything from builder
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/agents/agent-image ./agents/agent-image
RUN mv ./agents/agent-image/node_modules ./node_modules

# Create non-root user
RUN groupadd -r alti && useradd -r -g alti -d /app -s /sbin/nologin alti \
    && chown -R alti:alti /app

USER alti

WORKDIR /app/agents/agent-image

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 8080) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "index.js"]
