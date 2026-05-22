# Build stage
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app/alti-core-service

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci --legacy-peer-deps && npm cache clean --force

# Copy application code
COPY . .

# Production stage
FROM node:20-alpine

# Install only runtime dependencies needed for native modules
RUN apk add --no-cache python3

WORKDIR /app/alti-core-service

# Copy package files
COPY package*.json ./

# Install ONLY production dependencies
RUN npm ci --only=production --legacy-peer-deps && npm cache clean --force

# Copy only necessary application files from builder
COPY --from=builder /app/alti-core-service/src ./src
COPY --from=builder /app/alti-core-service/config ./config
# test/ intentionally excluded from production image
COPY --from=builder /app/alti-core-service/index.js ./
COPY --from=builder /app/alti-core-service/server.js ./
COPY --from=builder /app/alti-core-service/alti_gcp.json ./
COPY --from=builder /app/alti-core-service/imagegen.json ./
COPY --from=builder /app/alti-core-service/env.yaml ./
COPY --from=builder /app/alti-core-service/output ./output

# Create necessary directories
RUN mkdir -p logs/errors logs/successes uploads/ragsystem

# Cloud Run sets PORT=8080 by default; app reads process.env.PORT
EXPOSE 8080

COPY --from=builder /app/alti-core-service/preload.cjs ./

# Use node instead of nodemon in production
CMD ["node", "--require", "./preload.cjs", "--dns-result-order=ipv4first", "index.js"]