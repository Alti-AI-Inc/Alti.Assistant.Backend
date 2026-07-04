# Changelog

All notable changes to Inso AI are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) — Semantic Versioning.

## [1.27.191] — 2026-06-20

### 🚀 Added — Phase 18: Smart Routing Code Swarms & Multi-Agent Coding Orchestration
- **Specialized Coding Agents Registry**: Registered 110 specialized coding micro-agents spanning languages, framework environments, database tuners, task handlers, coding styles/standards, cloud infrastructure, and swarm roles.
- **Smart Routing & Swarm Orchestration**: Implemented a dynamic Vertex AI router determining agent configurations and executing collaborative swarms (Architect -> Coder -> Tester -> Reviewer -> Documenter) for complex tasks.
- **LangGraph State Channels Expansion**: Added `selectedAgent`, `selectedStyle`, `selectedPurpose`, and `isSwarm` state channels, integrating state updates with the MongoDB saver checkpointer.
- **Node Integration**: Updated the asynchronous task offloader nodes to route user requests and attach routing variables to enqueued GCP Pub/Sub payloads.

---

## [Unreleased] — 2026-06-17

### 🚀 Added — Phase 17: Autonomous GCP Cost & Efficiency Optimizer

A non-stop autonomous optimization engine (`gcp-optimizer/`) that continuously audits
and reduces Google Cloud costs, compute waste, and carbon emissions.

#### Optimizer Modules
- **`billing.js`** — Cloud Billing API integration: budget alert creation (80%/100%/120% thresholds),
  cost anomaly detection via Cloud Monitoring, Cloud Run monthly cost breakdown
- **`compute.js`** — Idle VM detection (CPU < 5% over 24h), auto-stop capability,
  Spot/Preemptible conversion recommendations (70% savings), Recommender API right-sizing
- **`storage.js`** — Automated GCS lifecycle tiering (Standard→Nearline→Coldline→Archive),
  object version cleanup, public bucket security audit
- **`vertex.js`** — Idle Vertex AI endpoint detection and undeployment ($0.40/node-hour saved),
  stale Reasoning Engine session cleanup, model selection audit (Flash vs Pro)
- **`run.js`** — Cloud Run right-sizing: min-instances reduction ($176+/month),
  CPU-always-on toggle, memory allocation optimization
- **`redis.js`** — Cache hit rate analysis, TTL coverage audit, eviction pattern detection,
  AI API call savings calculation from cache hits
- **`network.js`** — Cloud CDN auto-enablement (76% egress savings), compression recommendations
- **`carbon.js`** — Google Carbon Footprint API integration, carbon-aware scheduling,
  GCP region CO₂ ranking, Cloud Scheduler job carbon-aware rescheduling
- **`bigquery.js`** — Unpartitioned table detection (80% query cost reduction),
  expensive query analysis, daily/monthly cost projections
- **`alerts.js`** — Pub/Sub cost-alerts topic provisioning, Cloud Monitoring alert
  policies for Vertex AI request spikes and Cloud Run CPU saturation

#### Optimizer Infrastructure
- **`index.js`** — Non-stop perpetual loop: independent error boundaries per module,
  exponential backoff on failure, heartbeat logs, graceful shutdown with final summary,
  `--once` flag for single audit runs
- **`logger.js`** — Cloud Logging-compatible structured JSON logger with color output locally
- **`ledger.js`** — Persistent savings ledger (JSON) with monthly Markdown report generation
- **`auth.js`** — Google Auth factory: ADC / SA key / Cloud Run auto-detection
- **`config.js`** — Centralized thresholds, schedules, carbon region data
- **`Dockerfile`** — node:20-alpine Cloud Run Job container (non-root, production-ready)
- **`deploy.ps1`** — One-command deployment: build → Artifact Registry → Cloud Run Job
  → Cloud Scheduler (every 15 minutes, serverless, pay-per-execution)

#### Run Modes
```bash
node index.js --once      # Full audit, exit (safe, DRY_RUN=true default)
node index.js             # Perpetual loop
DRY_RUN=false node index.js  # Live mode — applies safe changes
.\deploy.ps1              # Deploy to Cloud Run Jobs + Cloud Scheduler
```

---

### 🚀 Added — Phase 14–16: New GCP Native Services

Three new production-grade services added to the `gcp_native` module:

#### `gcp-reasoning-engine.service.js` (Phase 14)
- Full Vertex AI Reasoning Engine lifecycle: deploy, list, delete
- Interactive session management: create, query, stream, history, delete
- `oneShot()` helper: auto-creates and destroys sessions for stateless calls
- Streaming query with async iterator support
- Session history retrieval with role-based message formatting

#### `gcp-gemini-live.service.js` (Phase 15)
- Gemini Live API (real-time bidirectional multimodal streaming)
- WebSocket session configuration builder (audio + video + text modalities)
- Voice configuration (Aoede, Charon, Fenrir, Kore, Puck)
- Connection credential generator for frontend WebSocket proxy
- Audio output parser and message type classifier
- REST text fallback for non-streaming contexts
- Model constants for `gemini-2.0-flash-live-001`, `gemini-2.0-flash-exp`

#### `gcp-vertex-pipeline.service.js` (Phase 16)
- Vertex AI Pipelines (Kubeflow Pipelines v2) full lifecycle
- Pipeline run list, get, create from GCS template, cancel, delete
- Polling with configurable exponential backoff
- Custom training pipeline spec builder for ML training jobs
- Parameter injection for pipeline runs

#### Controller & Routes
- **`gcp-native.controller.js`** — 14 new handler functions across all 3 services
- **`gcp-native.route.js`** — 17 new routes:
  - `POST   /gcp/reasoning-engine` — Deploy new Reasoning Engine
  - `GET    /gcp/reasoning-engines` — List all engines
  - `DELETE /gcp/reasoning-engine/:id` — Delete engine
  - `POST   /gcp/reasoning-engine/session` — Create session
  - `POST   /gcp/reasoning-engine/query` — Synchronous query
  - `POST   /gcp/reasoning-engine/query/stream` — Streaming query
  - `GET    /gcp/reasoning-engine/session/:id/history` — Session history
  - `DELETE /gcp/reasoning-engine/session/:id` — Delete session
  - `POST   /gcp/gemini-live/session` — Create Live session config
  - `POST   /gcp/gemini-live/text` — REST text fallback
  - `GET    /gcp/gemini-live/voices` — List available voices
  - `GET    /gcp/vertex-pipelines` — List pipeline runs
  - `GET    /gcp/vertex-pipelines/:id` — Get pipeline run
  - `POST   /gcp/vertex-pipelines` — Create pipeline run
  - `POST   /gcp/vertex-pipelines/:id/cancel` — Cancel pipeline run
  - `DELETE /gcp/vertex-pipelines/:id` — Delete pipeline run
  - `POST   /gcp/vertex-pipelines/training` — Create training pipeline

---

### ⬆️ Changed — Gemini Model Upgrade (Platform-Wide)

Upgraded all Gemini model references across the entire codebase to the latest
available models as of June 2026:

| Tier | Previous | Updated |
|------|----------|---------|
| **Flash** (fast, cost-efficient) | `gemini-2.5-flash` | **`gemini-3.5-flash`** |
| **Pro** (deep reasoning) | `gemini-2.5-pro` | **`gemini-3.1-pro`** |

**Scope:** 88 files updated (65 source + 23 test files) including:
- All module constants (`document_analysis`, `document_drafting`, `document_review`,
  `knowledge`, `legal_contract`, `plan_generator`, `report`, `rewrite`, `transcription`)
- All service files (knowledgebase, conversations, brainstorm, search, swarm agents,
  workflow automation, writing, translation, image, summary)
- All script files (autonomous_agent, autonomous_documenter, autonomous_optimizer,
  autonomous_swarm, autonomous_tester, preflight-check)
- GCP native services (vertex-grounding, gemini-live)
- All corresponding test files updated to match

**Architecture:** `config/index.js` consolidated into a single source of truth:
```js
gemini_model:     process.env.GEMINI_MODEL     || 'gemini-3.5-flash',
gemini_pro_model: process.env.GEMINI_PRO_MODEL || 'gemini-3.1-pro',
gemini: {
  model_name: process.env.GEMINI_MODEL     || 'gemini-3.5-flash',
  pro_model:  process.env.GEMINI_PRO_MODEL || 'gemini-3.1-pro',
}
```
Future upgrades require only environment variable changes — no code edits.

---

## [Previous] — 2026-06-16

### Added — Phase 14–16 (GCP Native Deep Integration)
See commit `1f9ee910` — Reasoning Engine, Gemini Live, Vertex Pipelines

### Fixed — Infrastructure
- Sandbox VM (35.239.9.215): cleared disk, reconnected Redis + MongoDB Atlas
- Docker Compose simplified to 2-service stack (Redis + Backend) to fit 10GB VM disk
- Backend health endpoint verified: `GET /health` → `{ status: "ok" }`

---

*Inso AI — 100% Google Cloud Native — Apache 2.0 / MIT licensed dependencies only*
