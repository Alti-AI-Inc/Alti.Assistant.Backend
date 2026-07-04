# ── Build Stage ────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy shared modules first (changes less often → better cache)
COPY shared/ ./shared/

# Copy agent package files for dependency install
COPY agents/agent-code/package.json agents/agent-code/package-lock.json* ./agents/agent-code/

WORKDIR /app/agents/agent-code
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy agent source code
WORKDIR /app
COPY agents/agent-code/ ./agents/agent-code/

# ── Production Stage ──────────────────────────────────────────────────────────
FROM node:20-slim AS production

WORKDIR /app

# Copy everything from builder
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/agents/agent-code ./agents/agent-code
RUN mv ./agents/agent-code/node_modules ./node_modules

# Create non-root user
RUN groupadd -r insoai && useradd -r -g insoai -d /app -s /sbin/nologin insoai \
    && chown -R insoai:insoai /app

USER insoai

WORKDIR /app/agents/agent-code

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "index.js"]
