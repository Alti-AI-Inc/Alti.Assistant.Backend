FROM node:20-slim AS builder

WORKDIR /app

COPY shared/ ./shared/
COPY agents/agent-review/package.json agents/agent-review/package-lock.json* ./agents/agent-review/

WORKDIR /app/agents/agent-review
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

WORKDIR /app
COPY agents/agent-review/ ./agents/agent-review/

FROM node:20-slim AS production

WORKDIR /app

COPY --from=builder /app/shared ./shared
COPY --from=builder /app/agents/agent-review ./agents/agent-review
RUN mv ./agents/agent-review/node_modules ./node_modules

RUN groupadd -r inso && useradd -r -g inso -d /app -s /sbin/nologin inso \
    && chown -R inso:inso /app

USER inso
WORKDIR /app/agents/agent-review

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "index.js"]
