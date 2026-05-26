# Alti.Assistant Backend

An enterprise-grade, high-performance Swarm & RAG (Retrieval-Augmented Generation) orchestration backend built with Node.js and Express. It powers autonomous agent routing, multi-tenant vector storage, deep web research workflows, and complex third-party API integrations.

---

## 🚀 Key Systems & Core Features

### 1. Swarm Agent & Grounding Engine
- **Intent Router**: Houses a smart intent classifier routing user requests dynamically to 44 expert specialized domain agents (financial analysis, real estate, arbitrage scanning, sports betting odds, legal compliance, etc.).
- **100% Google Grounding Entrenchment**: Completely purged of external proprietary branding (such as Tavily), utilizing native Google Search and custom grounding engines for reliable real-time ground-truth verification.
- **Dynamic SSE Token Streaming**: Implements real-time token streaming over Server-Sent Events (SSE) to ensure ultra-low latency, fluid UX responses.

### 2. Advanced LlamaIndex RAG Pipeline
- **Multi-Tenant Index Isolation**: Securely isolates vector databases at the user and tenant levels to ensure absolute corporate data boundaries.
- **Deep Document Processing**: Incorporates `SentenceSplitter` chunking, hierarchy node parsing, and high-fidelity text extraction for PDFs, Word files, and Excel sheets.
- **Strict Inline Citations**: Resolves search answers with explicit page-level and source-level inline references.

### 3. Deep Research & McKinsey-Style Report Swarm
- **Critique Review Loops**: Orchestrates multi-turn adversarial partner critic loops to double-verify crawled web information and filter hallucinated results.
- **Report Compiler**: Automatically outputs high-fidelity, highly analytical McKinsey-style PDF reports with data visualization fallbacks.
- **Telemetry Ingestion Daemon**: Direct background crawling socket systems providing real-time telemetry streaming to the client.

### 4. Billing & Subscription Hardening
- **Stripe Webhook Hardening**: Direct subscription state synchronization with local user balances.
- **Automated Seat Limits**: Restricts active workspace member invitations dynamically based on active billing tiers.
- **Daily Request Quotas**: Integrates robust sliding window rate-limiters enforcing strict daily usage thresholds.

### 5. Native GCP Gemini Entrenchment
- **Gemini Pro/Flash SDK**: Harnesses raw Google Generative AI capabilities for embedding, semantic classifications, and general completions.
- **Embedding Dimensions Realignment**: Resolves standard embedding sizing checks to guarantee 100% compatibility across MongoDB indices.

---

## 🛠️ Technology Stack

- **Core Runtime**: Node.js (Express.js) equipped with pre-load ESM loaders to handle BOM-stripped configurations securely.
- **Database**: MongoDB (Mongoose) for transactions and vector embeddings, Redis for memory rate limits and caching.
- **AI Libraries**: LlamaIndex, `@google/genai` (native Google Generative AI SDK).
- **Billing**: Stripe Node.js SDK.

---

## 🚀 Local Development

### 1. Environment Setup
Create a `.env` file in the root of the project with the following properties:

```env
# Server Port
PORT=5100

# Databases
MONGODB_URI=mongodb+srv://your_mongodb_uri
REDIS_URL=redis://your_redis_url

# AI & API Services
GEMINI_API_KEY=your_google_gemini_api_key
MASSIVE_API_KEY=your_massive_financial_api_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_signing_secret
```

### 2. Launching the Server
Install backend dependencies and run the server:

```bash
npm install
npm run dev
```

The Express API server will start on port `5100`.

---

## 🌐 VM & GCP Cloud Run Deployment

### VM Nginx Configuration
On VM deployments, Express runs inside a Docker container listening on port `5100`. Nginx serves as the reverse proxy in front, routing `/api/v1` traffic to `http://localhost:5100`.

### GCP Secret Manager Setup
Production credentials are secure inside GCP Secret Manager. We utilize a hardened `set-all-secrets.ps1` or `.sh` script during CI/CD to pull credentials on startup without committing clear-text variables.

---

## 🔒 Automated Verification & Tests

Run the complete backend integration test suite to verify arbitrage, sports, real estate, and financial routing components:
```bash
npm run test
```
*Note: Ensure all environment variables are mapped before running live API test assertions.*
