# ── Build Stage ────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy shared modules first (changes less often → better cache)
COPY shared/ ./shared/

# Copy agent package files for dependency install
COPY agents/agent-write/package.json agents/agent-write/package-lock.json* ./agents/agent-write/

WORKDIR /app/agents/agent-write
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy agent source code
WORKDIR /app
COPY agents/agent-write/ ./agents/agent-write/

# ── Production Stage ──────────────────────────────────────────────────────────
FROM node:20-slim AS production

WORKDIR /app

# Copy everything from builder
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/agents/agent-write ./agents/agent-write
RUN mv ./agents/agent-write/node_modules ./node_modules

# Create non-root user
RUN groupadd -r inso && useradd -r -g inso -d /app -s /sbin/nologin inso \
    && chown -R inso:inso /app

USER inso

WORKDIR /app/agents/agent-write

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "index.js"]
