# OpenMemory Integration Plan

This plan adds OpenMemory as a long‑term, per‑user memory layer to enhance personalization, recall, and ranking in the existing searchbot and RAG flows.

## Objectives
- Improve answer relevance via memory‑aware context and re‑ranking.
- Persist user preferences, prior resolutions, and recurring intents.
- Keep latency low and tokens down on repeat/intent‑similar queries.
- Maintain clear boundaries with the existing KB/RAG (no replacement).

## Scope (Phase 1 → Phase 2)
- Phase 1 (Read + Light Write):
  - Query OpenMemory for top matches and prepend to LLM context.
  - Write back compact memory summaries for successful answers.
  - Reinforce memories that contributed to the final answer.
- Phase 2 (Deeper Fusion):
  - Re‑rank KB/web results using OpenMemory score as a feature.
  - Use OpenMemory sector hints for routing/tools selection.

## High‑Level Flow
- Pre‑query:
  - Classify query (existing classifier) → determine possible sector hints.
  - Query OpenMemory `/memory/query` with `{ query, k, filters: { user_id, sector? } }`.
  - Add top memory snippets to the LLM system/context block.
- Post‑answer:
  - If answer is accepted or confidence high, call `/memory/add` with a brief summary and metadata.
  - For any memory IDs used, call `/memory/reinforce`.

## Key OpenMemory Features Used
- Multi‑sector embeddings (semantic, episodic, procedural, emotional, reflective).
- Composite ranking: similarity + token overlap + waypoint connectivity + recency.
- Per‑user isolation via `user_id` filter.
- Dedup (simhash), decay, reinforcement, waypoints.

## Config
- `.env`:
  - `OM_BASE_URL=https://openmemory.your-domain.tld` (or `http://localhost:8080`)
  - Optional: `OM_API_KEY` if deployed behind an auth proxy.

## New Module: OpenMemory Client
- File: `src/shared/openmemory.js`
- Responsibilities:
  - `queryMemories({ query, k, userId, sector, minScore })`
  - `addMemory({ content, userId, tags, metadata })`
  - `reinforceMemory(id, boost)`
- Example skeleton:

```js
// src/shared/openmemory.js
const BASE = process.env.OM_BASE_URL;
const API_KEY = process.env.OM_API_KEY;

function headers() {
  const h = { 'content-type': 'application/json' };
  if (API_KEY) h.authorization = `Bearer ${API_KEY}`;
  return h;
}

async function omFetch(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenMemory ${path} ${res.status}`);
  return res.json();
}

exports.queryMemories = async ({ query, k = 5, userId, sector, minScore }) => {
  if (!BASE) return { query, matches: [] };
  return omFetch('/memory/query', {
    query,
    k,
    filters: { user_id: userId, sector, min_score: minScore },
  });
};

exports.addMemory = async ({ content, userId, tags, metadata }) => {
  if (!BASE) return { skipped: true };
  return omFetch('/memory/add', { content, user_id: userId, tags, metadata });
};

exports.reinforceMemory = async (id, boost) => {
  if (!BASE) return { skipped: true };
  return omFetch('/memory/reinforce', { id, boost });
};
```

## Code Touchpoints
- `src/app/modules/search/search.controller.js`
  - Before KB/web retrieval, call `queryMemories` with `{ query, userId, sector? }`.
  - Attach memory matches onto the request context (e.g., `req.memoryContext`).
- `src/app/modules/search/llm.js`
  - Read `memoryContext` and inject top N snippets into the system/context prompt section
    under a label like “Known user context and prior resolutions”.
  - Keep to a compact format (1–2 lines per memory); truncate as needed.
- `src/app/modules/search/search.helper.js`
  - If you re‑rank results, include memory score/recency as a feature.
- `src/app/modules/search/services/queryClassifier.js`
  - Optional: map classifier labels to OpenMemory sectors (`procedural`, `semantic`, `episodic`, etc.).
  - Pass `sector` hint into `queryMemories` to reduce noise/latency.
- `src/app/modules/conversations/conversation.service.js`
  - After a successful answer, write a compact memory:
    - `content`: concise summary (not full transcript!)
    - `metadata`: `{ query, chosen_sources, confidence, assistant: 'searchbot' }`
    - `user_id`: from auth/session.
  - For any memory IDs surfaced and actually used, call `reinforceMemory`.

## Prompt Injection Template (LLM)
- System block add‑on:
```
You have access to user‑specific memory snippets. Prefer them for preferences/history.
Memory snippets (higher score is more relevant):
{{#each memory.matches}}
- [{{score.toFixed(2)}}] {{content}}
{{/each}}
```
- Keep max 3–6 items; if long, summarize to ~120–200 chars each.

## Data & Privacy
- Store only compact summaries; avoid raw PII.
- Tag metadata minimally; prefer opaque IDs for internal linkage.
- Respect tenant/user segregation by always supplying `user_id`.

## Testing Plan
- Unit
  - Mock OpenMemory client; verify controller merges memory context.
  - LLM prompt builder includes memory block only when matches exist.
- Integration
  - Spin local OpenMemory (Docker) → seed a few memories per test user → verify `/search` returns better top‑1/top‑3 on repeat queries.
- E2E/Regression
  - Measure latency impact (<50 ms added P50 goal with k≤5, sector‑scoped).
  - Token usage before/after on repeated queries.

## Rollout & Flags
- Feature flag: `SEARCH_USE_OPENMEMORY=true|false`.
- Default k=3–5; sector hint when available; minScore gate (e.g., 0.2).
- Fallbacks: if OpenMemory down or errors, proceed without memory.

## Observability
- Log memory hit rate, average memory score of injected snippets.
- Compare CTR/select rate on first result with/without memory.
- Track reinforce calls per session and error rate from OpenMemory.

## Risks & Mitigations
- Prompt bloat → summarize aggressively; cap items.
- Cross‑user leakage → enforce `user_id` on every request.
- Over‑personalization → weight memory as a tie‑breaker in ranking.

## Phase 2 Ideas
- Stronger re‑ranking: weighted blend of KB score and memory score.
- Sector‑aware tool/route selection (procedural → web/tool; episodic → memory‑first).
- MCP mode for desktop clients (optional) to share context with assistants.

## Acceptance Criteria
- Memory context shows up in prompts when available.
- Successful answers persist concise memories tied to `user_id`.
- Reinforcement increments on used memories.
- No degradation in latency > ~50 ms P50 at k≤5 with sector hint.

## Tasks Checklist
- [ ] Add `OM_BASE_URL` (and `OM_API_KEY` if needed) to `.env` and config loader.
- [ ] Create `src/shared/openmemory.js` wrapper.
- [ ] Update `search.controller.js` to fetch memory context.
- [ ] Inject memory context in `llm.js` prompt builder.
- [ ] Persist compact memory in `conversation.service.js` after success.
- [ ] Reinforce contributing memory IDs.
- [ ] Add feature flag and configuration knobs (k, minScore, sector usage).
- [ ] Add basic unit/integration tests with a local OpenMemory instance.

---

Owner: Search/AI Team
Status: Draft

