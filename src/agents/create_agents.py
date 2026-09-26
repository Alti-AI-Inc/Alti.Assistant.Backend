import os

agents = [
    ("search", 4001, "search.routes.js"),
    ("research", 4002, "research.routes.js"),
    ("write", 4003, "write.routes.js"),
    ("code", 4004, "code.routes.js"),
    ("design", 4005, "design.routes.js"),
    ("video", 4006, "video.routes.js"),
    ("audio", 4007, "audio.routes.js")
]

template = """import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Specialized isolated route for {capitalized_name}
// import Routes from '../app/routes/{routes_file}';
// app.use('/api/v1/{name}', Routes);

app.get('/health', (req, res) => res.json({{ status: 'ok', agent: '{name}' }}));

const PORT = process.env.PORT || {port};
app.listen(PORT, () => {{
  console.log(`[ISOLATED AGENT] {capitalized_name} Engine running natively on Liberty Center One bare-metal, powered by Together AI + Exa + Composio + Zenrows + LangChain on port ${{PORT}}`);
}});
"""

for name, port, routes_file in agents:
    capitalized_name = name.capitalize()
    content = template.format(name=name, port=port, routes_file=routes_file, capitalized_name=capitalized_name)
    with open(f"Aphura Backend/src/agents/{name}_agent.js", "w") as f:
        f.write(content)

# Generate Dockerfiles
dockerfile_template = """FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
ENV NODE_ENV=production
ENV PORT={port}
EXPOSE {port}
CMD ["node", "src/agents/{name}_agent.js"]
"""

for name, port, _ in agents:
    content = dockerfile_template.format(name=name, port=port)
    with open(f"Aphura Backend/Dockerfile.{name}", "w") as f:
        f.write(content)

