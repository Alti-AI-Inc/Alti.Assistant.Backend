# OpenMemory Integration Guide for the Search Module

This guide walks you through integrating [OpenMemory](https://github.com/CaviraOSS/OpenMemory) into the `src/app/modules/search` stack so every search run can leverage long-term, per-user memory. Follow the steps in order; each builds on the previous one.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Bring Up OpenMemory](#2-bring-up-openmemory)
3. [Expose OpenMemory Config in Alti](#3-expose-openmemory-config-in-alti)
4. [Add the OpenMemory Client](#4-add-the-openmemory-client)
5. [Augment Search Retrieval (`intelligentSearch.js`)](#5-augment-search-retrieval-intelligentsearchjs)
6. [Register an OpenMemory ReAct Tool (`reactAgent.js`)](#6-register-an-openmemory-react-tool-reactagentjs)
7. [Persist Answers Back to Memory (`search.service.js`)](#7-persist-answers-back-to-memory-searchservicejs)
8. [Optional Enhancements](#8-optional-enhancements)
9. [Testing & Verification](#9-testing--verification)
10. [Monitoring & Troubleshooting](#10-monitoring--troubleshooting)

## 1. Prerequisites

- Node.js 20+ and npm/bun available locally.
- Access to Google Custom Search + Gemini keys already used by the search module.
- New environment variables reserved for OpenMemory (`OPENMEMORY_BASE_URL`, `OPENMEMORY_API_KEY`, etc.).
- Ability to run Docker locally **or** provision a small VM (4 vCPU/8 GB RAM is plenty for SQLite mode).

## 2. Bring Up OpenMemory

Choose either local Node or Docker. For quick iteration, Docker is fastest.

```bash
# Clone once (or vendor via submodule if preferred)
git clone https://github.com/CaviraOSS/OpenMemory.git
cd OpenMemory/backend
cp .env.example .env
```

Adjust `.env`:

- Set `OM_PORT=8080` (or any open port).
- Pick a tier (`OM_TIER=smart` is a good default for production).
- Set `OM_API_KEY=<strong-random-key>`.

Then start the service:

```bash
npm install
npm run dev   # listens on http://localhost:8080 by default
```

**Docker alternative** (runs the same backend + persists SQLite to `/data/openmemory.sqlite`):

```bash
cd OpenMemory
docker compose up --build -d
```

Verify it is reachable:

```bash
curl http://localhost:8080/health
```

Expected: `{ "status": "ok" }`.

## 3. Expose OpenMemory Config in Alti

Update `config/index.js` (or the relevant config module) with a new block:

```javascript
openMemory: {
  enabled: env.OPENMEMORY_ENABLED === 'true',
  baseUrl: env.OPENMEMORY_BASE_URL || 'http://localhost:8080',
  apiKey: env.OPENMEMORY_API_KEY || '',
  defaultNamespace: env.OPENMEMORY_NAMESPACE || 'default',
  defaultTopK: Number(env.OPENMEMORY_TOP_K || 5),
  timeoutMs: Number(env.OPENMEMORY_TIMEOUT_MS || 8000),
},
```

Add the environment variables to your deployment manifests (`.env.local`, Docker secrets, CI/CD vault, etc.):

```
OPENMEMORY_ENABLED=true
OPENMEMORY_BASE_URL=https://memory.internal:8080
OPENMEMORY_API_KEY=<same-as-OM_API_KEY>
OPENMEMORY_TOP_K=6
OPENMEMORY_TIMEOUT_MS=8000
```

## 4. Add the OpenMemory Client

Create `src/app/shared/openMemoryClient.js` (adjust the path if you have a service layer elsewhere):

```javascript
import axios from 'axios';
import config from '../../config/index.js';

class OpenMemoryClient {
  constructor() {
    this.enabled = config.openMemory.enabled;
    this.http = axios.create({
      baseURL: config.openMemory.baseUrl,
      timeout: config.openMemory.timeoutMs,
      headers: config.openMemory.apiKey
        ? { Authorization: `Bearer ${config.openMemory.apiKey}` }
        : {},
    });
  }

  async addMemory({
    content,
    userId,
    tags = [],
    metadata = {},
    sector = 'semantic',
  }) {
    if (!this.enabled || !content) return null;
    const payload = {
      content,
      user_id: userId,
      tags,
      metadata: { ...metadata, sector },
    };
    const { data } = await this.http.post('/memory/add', payload);
    return data;
  }

  async queryMemories({
    query,
    userId,
    k = config.openMemory.defaultTopK,
    filters = {},
  }) {
    if (!this.enabled || !query) return [];
    const payload = {
      query,
      k,
      filters: { user_id: userId, ...filters },
    };
    const { data } = await this.http.post('/memory/query', payload);
    return data?.matches || [];
  }

  async reinforceMemory(memoryId, boost = 0.2) {
    if (!this.enabled || !memoryId) return;
    await this.http.post('/memory/reinforce', { id: memoryId, boost });
  }
}

export const openMemoryClient = new OpenMemoryClient();
```

Key points:

- Toggle everything off when `OPENMEMORY_ENABLED=false` so development users without the service still work.
- Handle `axios` errors with interceptors or call sites (e.g., log + continue without throwing).

## 5. Augment Search Retrieval (`intelligentSearch.js`)

Before the smart-routing block, fetch memories and prepend them to the conversation context so classification + Gemini see persistent knowledge.

```javascript
import { openMemoryClient } from '../../shared/openMemoryClient.js';

// ... inside runIntelligentSearch
const userId = state.userId || state.authUserId;
let memoryContext = [];
try {
  const matches = await openMemoryClient.queryMemories({ query, userId });
  memoryContext = matches.map(
    (m) => `Memory (${m.primary_sector || 'semantic'}): ${m.content}`
  );
  // Optional: reinforce the hits
  matches.forEach((m) =>
    openMemoryClient.reinforceMemory(m.id).catch(() => null)
  );
} catch (err) {
  logger.warn(
    'OpenMemory query failed, continuing without memory context',
    err
  );
}

const augmentedContext = [...memoryContext, ...conversationHistory];
```

Feed `augmentedContext` into `prepareConversationContext` or directly into the prompts (depending on how you want to weight memories versus chat history).

## 6. Register an OpenMemory ReAct Tool (`reactAgent.js`)

Give the ReAct agent first-class access to OpenMemory so it can query memories mid-chain rather than always hitting Google.

1. Implement a LangChain-compatible tool:

```javascript
import { DynamicTool } from '@langchain/core/tools';
import { openMemoryClient } from '../../shared/openMemoryClient.js';

export const openMemoryTool = new DynamicTool({
  name: 'openmemory-query',
  description:
    'Retrieve long-term user memories (filters by user_id). Include the query and optionally a user field.',
  async func(input) {
    const { query, userId } = JSON.parse(input);
    const matches = await openMemoryClient.queryMemories({ query, userId });
    return JSON.stringify(
      matches.map((m) => ({
        id: m.id,
        sector: m.primary_sector,
        content: m.content,
      }))
    );
  },
});
```

2. Bind it alongside Google search + WebBrowser:

```javascript
const toolBasedLlm = llm.bindTools([
  new GoogleCustomSearch(...),
  new WebBrowser(...),
  openMemoryTool,
]);
```

3. When the tool runs, parse `userId` from the conversation state (pass it through `messages` or `state` as JSON so the tool knows which namespace to hit).

## 7. Persist Answers Back to Memory (`search.service.js`)

This is now live in `src/app/modules/search/search.service.js`:

- `addSearchQueryMessage` mirrors every stored user query into OpenMemory as an `episodic` memory with tags `['search','query']` (works for both authenticated and guest users; guests get `isGuest: true` metadata so you can filter later).
- `addSearchResultMessage` mirrors the final assistant answer as a `semantic` memory with tags `['search','answer']`, preserving whatever metadata (references, citation info, etc.) you already attach to the conversation entry.

Key snippet:

```javascript
if (!isGuest && openMemoryClient?.enabled && searchResult) {
  await openMemoryClient.addMemory({
    content: searchResult,
    userId,
    tags: ['search', 'answer'],
    metadata: {
      conversationId,
      ...metadata,
      type: metadata?.type || 'search_result',
    },
    sector: metadata?.sector || 'semantic',
  });
}
```

User queries follow the same pattern but use `sector: 'episodic'`. Because the persistence happens directly inside the conversation helper functions, every endpoint (`performSearch`, `generateCode`, `generateWriting`, etc.) automatically contributes to the user’s memory as soon as it saves a message.

## 8. Optional Enhancements

- **Document ingest**: If users upload PDFs or notes, send them to `/memory/ingest` so they become searchable memories tied to the same `user_id`.
- **User summaries**: Query `/users/:userId/summary` and surface high-level stats in `getSearchStats`.
- **LangGraph/MCP mode**: Set `OM_MODE=langgraph` and reuse OpenMemory’s `/lgm/*` endpoints if you adopt LangGraph elsewhere in the stack.

## 9. Testing & Verification

1. **Unit tests**: mock the `openMemoryClient` and assert `runIntelligentSearch` merges memory context even when OpenMemory is down.
2. **Integration tests**: spin up OpenMemory via Docker in CI (or use GitHub service containers). Seed a few memories, run the search endpoint, and confirm responses mention the seeded data.
3. **Manual sanity**:
   - Run the backend.
   - Hit `/api/v1/search` twice with the same `userId`.
   - Ensure the second response references the stored memory.
4. **Performance**: Monitor token counts before/after memory injection to ensure context doesn’t exceed your LLM’s window. Adjust `OPENMEMORY_TOP_K` accordingly.

## 10. Monitoring & Troubleshooting

- **Health checks**: poll `http://openmemory:8080/health` and alert if it fails.
- **Rate limits**: honor `429` responses; OpenMemory exposes rate-limit headers when enabled.
- **Telemetry**: disable with `OM_TELEMETRY=false` if your compliance policy requires it.
- **Logs**: OpenMemory logs to stdout; ship them to your aggregator to track decay cycles and ingest failures.
- **Backups**: if you stick with SQLite, snapshot `/data/openmemory.sqlite`; for Postgres/pgvector, rely on your DB backups.

Following these steps gives the search module persistent, explainable memory without rewriting the existing workflow. Adjust the paths or naming to match your project conventions, but keep the sequence the same so retrieval, ReAct tooling, and storage stay in sync.
