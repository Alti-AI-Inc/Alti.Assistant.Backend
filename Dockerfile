# Build stage
FROM node:20-slim AS builder

# Install build dependencies for native modules (toobusy-js, bcrypt, etc.)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app/alti-core-service

# Copy package files
COPY package*.json ./

# Install production dependencies directly (omitting devDependencies since there is no compile/transpile build step)
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

# Copy application code
COPY . .

# Production stage
FROM node:20-slim

WORKDIR /app/alti-core-service

# Copy pre-built node_modules from builder (native addons already compiled)
# This avoids re-running npm ci without build tools in the production stage
COPY --from=builder /app/alti-core-service/node_modules ./node_modules

# Copy package files (needed for Node.js module resolution)
COPY package*.json ./

# Copy only necessary application files from builder
COPY --from=builder /app/alti-core-service/src ./src
COPY --from=builder /app/alti-core-service/config ./config
COPY --from=builder /app/alti-core-service/shared ./shared
# test/ intentionally excluded from production image
COPY --from=builder /app/alti-core-service/index.js ./
COPY --from=builder /app/alti-core-service/package.json ./
# alti_gcp.json excluded from image — mount at runtime via secret volume
COPY --from=builder /app/alti-core-service/imagegen.json ./
# env.yaml is gitignored (secrets); Cloud Run injects vars via --set-env-vars/--set-secrets
COPY --from=builder /app/alti-core-service/preload.cjs ./

# Create necessary directories
RUN mkdir -p logs/errors logs/successes uploads/ragsystem uploads/mcp_toolbox storage/ragsystem output

# Run as non-root user for security
RUN chown -R node:node /app/alti-core-service
USER node

# Cloud Run sets PORT=8080 by default; app reads process.env.PORT
EXPOSE 8080

# Docker-level health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=300s --retries=5 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 8080) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Use node instead of nodemon in production
CMD ["node", "--require", "./preload.cjs", "--dns-result-order=ipv4first", "index.js"]