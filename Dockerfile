# Build stage
FROM node:20-slim AS builder

# Install build dependencies for native modules (toobusy-js, bcrypt, etc.)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app/alti-core-service

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
# Native addons are compiled here where build tools are available
RUN npm ci --legacy-peer-deps && npm cache clean --force

# Prune devDependencies so we can copy a production-only node_modules
RUN npm prune --production --legacy-peer-deps

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
# test/ intentionally excluded from production image
COPY --from=builder /app/alti-core-service/index.js ./
COPY --from=builder /app/alti-core-service/server.js ./
COPY --from=builder /app/alti-core-service/package.json /app/alti-core-service/alti_gcp.jso[n] ./
COPY --from=builder /app/alti-core-service/imagegen.json ./
COPY --from=builder /app/alti-core-service/env.yaml ./
COPY --from=builder /app/alti-core-service/output ./output
COPY --from=builder /app/alti-core-service/preload.cjs ./

# Create necessary directories
RUN mkdir -p logs/errors logs/successes uploads/ragsystem storage/ragsystem

# Cloud Run sets PORT=8080 by default; app reads process.env.PORT
EXPOSE 8080

# Use node instead of nodemon in production
CMD ["node", "--require", "./preload.cjs", "--dns-result-order=ipv4first", "index.js"]