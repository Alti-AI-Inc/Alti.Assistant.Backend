FROM node:20-alpine

# Install git
RUN apk add --no-cache git

# Create app directory
WORKDIR /usr/src/app

# We'll rely on the parent package.json since this is part of the monorepo, 
# or we can assume the whole backend folder is mounted. 
# For a standalone deployment, copy root package files.
COPY package*.json ./

# Install dependencies (only production if possible, but we need vitest for testing)
RUN npm ci

# Copy the rest of the application
COPY . .

# Set environment variables
ENV NODE_ENV=production

# Run the autonomous agent script
CMD ["node", "scripts/autonomous_agent/index.js"]
