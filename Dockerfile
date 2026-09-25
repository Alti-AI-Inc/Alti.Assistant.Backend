FROM node:20-alpine AS base
WORKDIR /app
# Install Python, build tools, and Docker CLI (for ephemeral sandbox agent)
RUN apk add --no-cache python3 py3-pip make g++ docker-cli

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .

ENV NODE_ENV production
EXPOSE 3001
CMD ["npm", "start"]
