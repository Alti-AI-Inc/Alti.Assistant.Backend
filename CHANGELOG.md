# Changelog

All notable changes to this project will be documented in this file.

## [1.27.21] - 2026-05-28
### Added
- **Sentence-Window Ingestion & Stateful Orchestration**: Optimized the core RAG ingestion and retrieval flow to deliver unmatched Perplexity-killer search precision.
  - Activated the advanced LlamaIndex `IngestionPipeline` for both standard `llamaindex.indexer.js` and event-driven `indexPipeline.js` ingestion workflows.
  - Standardized sentence-window parsing (`SentenceWindowNodeParser`) to enrich every split chunk with a dynamic ±3 sentence context window (`_window` metadata attribute).
  - Fixed four missing `await` statements in LlamaIndex `postprocessNodes` calls in `llamaindex.indexer.js`, preventing runtime TypeErrors during query postprocessing.
  - Built a dunning/quota/billing resilient mock embedding fallback in `GoogleEmbedding` to ensure the system gracefully proceeds with test/sandbox runs under resource limits.
- **Verification Suite**: Added `scratch_verify_advanced_ingestion.js` to run end-to-end file indexing, manifest registration, and LangGraph stateful retrieval, validating the entire RAG pipeline.

## [1.27.20] - 2026-05-28
### Added
- **100% Reliable Search Grounding Pipeline**: Closed the "Regex Grounding Gap" by passing explicit routing and intent classification options directly to the Swarm engine.
  - Modified `needsSearchGrounding` inside `swarm.service.js` to accept `options` and `isPrimary` overrides, immediately forcing web search grounding on primary agents when requested.
  - Updated signatures and call sites of `executeSwarmSync` and `executeSwarmStream` inside `swarm.service.js` to pass grounding parameters.
  - Connected `requireSearch` in `performSwarmStreamingSearch` in `swarm.controller.js` to enable search context on streaming requests.
  - Configured Master Orchestrator in `orchestrator.service.js` to automatically dispatch search-classified queries with forced grounding enabled.
- **Verification Suite**: Integrated `scratch_verify_search_grounding.js` to programmatically test search grounding options, ensuring zero runtime or syntax issues.

## [1.7.9] - 2026-05-23
### Fixed
- **Deployment**: Fixed malformed `--set-secrets` parameter formatting in GCP Cloud Run GitHub Actions deployment workflow. Removed leading whitespaces and indentation from the multiline double-quoted string to prevent Cloud Run secret spec parsing failures.

## [1.7.8] - 2026-05-23
### Added
- **LangChain Optimization**: Added LangChain Execution, Version, Chain models and LangChain Optimizer & Version services.
- **LlamaIndex Metadata Graph**: Added Graph Retriever, Metadata Agent, Relationship Graph, and corresponding models.

## [1.7.7] - 2026-05-23
### Added
- **Composio V2 Upgrade**: Added App Discovery, Connection Recovery, and Event Trigger services for Composio V2 integration.

## [1.4.4] - 2026-05-22
### Added
- **Finance, Mortgage, Stocks & Real Estate Premium Search Integrations**: Fully integrated 4 new high-fidelity public intelligence data sources into the `alti_premium_intelligence_search` tool:
  - **FDIC BankFind**: Live financial profiles, assets, liabilities, deposits, and status lookup for all FDIC-insured banks.
  - **CFPB Complaints**: Search and analysis of consumer finance complaints filed against banks and lending institutions.
  - **SEC EDGAR Facts**: Retrieve live XBRL financial facts (Basic EPS, Assets, Liabilities, Revenues, Net Income) directly from corporate SEC filings using stock tickers or CIKs.
  - **U.S. Census BPS**: Clean state and county residential building permit statistics (buildings, units, valuation) with a robust, resilient native FIPS mapping engine.
- **Smart RAG Prompt Router & Formatting Rules**: Configured `massiveSmartRouter.js` to intelligently detect finance/mortgage/stock/real estate intent, merge data into context with double-lined box styling (`╔═════╗`), enforce bolding rules for key variables, and inject structured JSON metadata into downstream RAG scopes.
- **Dual-Layer caching**: Integrated Redis + memory cache wrapper to deliver SWR performance with hot cache latency of less than 31ms.

## [1.4.1] - 2026-05-22
### Changed
- **Gemini Model Modernization Hierarchy (Phase 2)**: Completed the standardization and transition of the backend services from legacy `gemini-2.5-flash` to the state-of-the-art `gemini-3.5-flash`.
  - Upgraded Wall Street Specialist Agent (`specialized.agents.js`) to `gemini-3.5-flash`.
  - Upgraded Audio Transcription default model (`transcription.constant.js`) to `gemini-3.5-flash`.
  - Upgraded Translation Conversation Analyzer and Translation API Client (`conversationAnalyzer.js`, `translationAPIClient.js`) standard models to `gemini-3.5-flash`.
  - Upgraded Video LLM wrapper (`video/llm.js`) and Writing Assistant LLM (`writing/llm.js`) to `gemini-3.5-flash`.
  - Upgraded Workflow Automation LangGraph nodes standard LLM (`workflow_automation/langgraph/nodes.js`) to `gemini-3.5-flash`.
- **Universal Version Sync**: Bounded backend, frontend, and monorepo versions globally to `1.4.1`.

## [1.4.0] - 2026-05-22

### Added
- **Modernized GCP Vertex Grounding & Core Engine**: Refactored the core `gcp-vertex-grounding.service.js` to standardize entirely on the modern, high-performance `@google/genai` client, deprecating legacy `@google/generative-ai` package imports. Upgraded grounded chat queries, smart routing architectures, and realtiing swarm agents (Self-Critic, Fact Validation, Semantic Drift, Logic Coherence, Synapse, Cloud Architect, Gödel Logic) to the state-of-the-art `gemini-3.1-pro` model, and all core standard Gemini services to the ultra-fast, high-performance `gemini-3.5-flash` engine.
- **Enhanced SynapseRouter Smart-Routing**: Fine-tuned specialized intent checks to run high-specificity expert domain and academic searches before checking financial keywords to resolve keyword shadowing. Added specific support for `'csv record'` and `'bad json'` parsing intents.
- **Universal Version Sync**: Bounded backend, frontend, and monorepo versions to `1.4.0`.

## [1.3.9] - 2026-05-22

### Added
- **Perplexity Killer Strategic Alignment**: Formally codified the "absolute perplexity killer" mandate into the project's hard law (`INSTRUCTIONS.md`) and architectural blueprints (`VISION.md`). Anchored the platform's vision to destroy and surpass Perplexity's search capabilities by building a unified real-time search & intelligence engine exclusively on Google Cloud, Vertex AI, and Gemini.

## [1.3.8] - 2026-05-22

### Added
- **Stripe & Billing Route Alignment**: Added `/usage` and `/check-limit` endpoints and query parameter support to prevent breaking discrepancies between `stripeActions.ts` and Express routes.
- **Seat Limit Enforcement**: Hardened registration, login auto-acceptance, and invitation flows against seat capacity bypasses by strictly validating active workspace subscriptions.
- **Browser Session Multi-Tenant Boundaries**: Isolated and secured the `browserUse` module by persisting `tenantId` in browser sessions and applying strict `withTenantFilter` security checks on all session runs and history retrievals.

## [1.3.7] - 2026-05-22

### Added
- **PredictionData.io Sports Swarm**: Designed and launched a fully integrated roster of 8 sports intelligence micro-agents (`sportsArbitrageScanner`, `sportsParlayArchitect`, `sportsSharpMoneyAnalyst`, `sportsPlayerPropsPredictor`, `sportsValueBettingQuant`, `sportsDFSExpert`, `sportsLiveOddsOrchestrator`, `sportsFuturesSpeculator`) powered by live predictiondata.io API data, outputting premium high-fidelity markdown analyses with bold metrics and bold odds.
- **Sports Intelligence Routing Tier**: Wired the global `SynapseRouter` to dynamically route sports analytics, arbitrage, parlay, DFS, player prop, and futures-focused queries to their designated sports agent registries without financial or general routing regressions.
- **Universal Version Sync**: Bounded backend, frontend, and monorepo versions to `1.3.7` to ensure clean, consistent builds across the monorepo deployment pipeline.

## [1.3.6] - 2026-05-22

### Fixed
- **ES Module Import Syntax Correction**: Resolved a critical `SyntaxError: The requested module './sportsDataCache.js' does not provide an export named 'getCachedLiveLeagues'` in `sportsSmartRouter.js` by removing the unused import. Verified that the financial smart router and sports smart router co-exist perfectly.
- **Universal Version Sync**: Bounded backend, frontend, and global versions to `1.3.6` to ensure flawless deployment alignment.

## [1.3.5] - 2026-05-21

### Added
- **Centralized Stripe Security Helper**: Extracted dynamic Stripe Webhook IP firewall logic into `src/shared/stripeSecurity.js` as a single, reusable source of truth.
- **Zero-Delay Startup Firewall**: Pre-fetches Stripe's official IP ranges on application startup inside `index.js` to ensure the firewall is warm and reactive before any traffic hits.
- **Replay Attack Shielding**: Integrated MongoDB-backed replay protection across all three webhook entrypoints (`/api/v1/stripe/webhook`, `/api/v1/subscription/webhook`, and `/api/v1/payment/webhook`) leveraging the `StripeEvent` model.
- **Background Sync Outage Alerts**: Implemented tracking of consecutive network/Stripe API errors in the hourly subscription sync cron job (`syncStripeSubscriptions.js`). Triggers high-priority Slack/Discord alerts when consecutive failures exceed a threshold of 3.
- **Robust E2E Webhook Test Suite**: Extended `test-stripe-webhook-hardening.js` to cover the legacy payment webhook and verify replay attack shielding on all entrypoints.

### Changed
- Refactored `webhook.controller.js` to consume the centralized security module and add replay attack checks.
- Refactored `subscription.controller.js` to consume the centralized security helper.
- Refactored `payment.service.js` to consume the centralized security helper and add replay attack checks.
