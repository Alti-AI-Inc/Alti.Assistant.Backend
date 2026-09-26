FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENV PORT=4003
EXPOSE 4003
CMD ["node", "src/agents/workflow_agent.js"]
