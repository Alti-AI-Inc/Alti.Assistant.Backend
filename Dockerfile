# Build stage
FROM node:20-slim AS builder

# Install build dependencies for native modules (bcrypt, etc.)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app/aphura-backend

# Copy package files
COPY package*.json ./

# Install production dependencies (omitting devDependencies)
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

# Copy application code
COPY . .

# Production stage
FROM node:20-slim

WORKDIR /app/aphura-backend

# Copy pre-built node_modules from builder (native addons already compiled)
COPY --from=builder /app/aphura-backend/node_modules ./node_modules

# Copy package files (needed for Node.js module resolution)
COPY package*.json ./

# Copy only necessary application files from builder
COPY --from=builder /app/aphura-backend/src ./src
COPY --from=builder /app/aphura-backend/config ./config
COPY --from=builder /app/aphura-backend/shared ./shared
# test/ intentionally excluded from production image
COPY --from=builder /app/aphura-backend/index.js ./
COPY --from=builder /app/aphura-backend/package.json ./
COPY --from=builder /app/aphura-backend/preload.cjs ./

# Create necessary directories
RUN mkdir -p logs/errors logs/successes uploads/ragsystem uploads/mcp_toolbox storage/ragsystem output

# Run as non-root user for security
RUN chown -R node:node /app/aphura-backend
USER node

# Default port — configurable via PORT env var
EXPOSE 5100

# Docker-level health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=300s --retries=5 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 5100) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Use node in production
CMD ["node", "--require", "./preload.cjs", "--dns-result-order=ipv4first", "index.js"]