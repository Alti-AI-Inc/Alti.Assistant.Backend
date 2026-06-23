# ── Build Stage ────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy shared modules first (changes less often → better cache)
COPY shared/ ./shared/

# Copy agent package files for dependency install
COPY agents/agent-audio/package.json agents/agent-audio/package-lock.json* ./agents/agent-audio/

WORKDIR /app/agents/agent-audio
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy agent source code
WORKDIR /app
COPY agents/agent-audio/ ./agents/agent-audio/

# ── Production Stage ──────────────────────────────────────────────────────────
FROM node:20-slim AS production

WORKDIR /app

# Copy everything from builder
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/agents/agent-audio ./agents/agent-audio
RUN mv ./agents/agent-audio/node_modules ./node_modules

# Create non-root user
RUN groupadd -r alti && useradd -r -g alti -d /app -s /sbin/nologin alti \
    && chown -R alti:alti /app

USER alti

WORKDIR /app/agents/agent-audio

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "index.js"]
