# Inso Assistant: Full Metering and Overage Billing System

This document outlines the hybrid seat-based subscription and monthly metered overage billing architecture for all 11 user-facing features (sidebar toggle tabs, sub-tabs, and knowledge storage).

---

## 🗺️ Metered Features Architecture Map

Every sidebar toggle tab and sub-tab has its own dedicated resource limits and overage prices:

| Tab | Sub-tab / Action | Feature Key | Explore Limit | Execute Limit | Command Limit | Overage Rate |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Chat** | Search | `search` | 1,000 / mo | 5,000 / mo | 20,000 / mo | **$0.01** / search |
| **Chat** | Research | `research` | 100 / mo | 500 / mo | 2,000 / mo | **$0.02** / query |
| **Text** | Write | `write` | 500 / mo | 2,500 / mo | 10,000 / mo | **$0.02** / query |
| **Text** | Code | `code` | 200 / mo | 1,000 / mo | 4,000 / mo | **$0.02** / query |
| **Media** | Image | `image` | 20 / mo | 100 / mo | 500 / mo | **$0.05** / image |
| **Media** | Video | `video` | 2 / mo | 10 / mo | 50 / mo | **$0.50** / video |
| **Workspace** | Projects | `projects` | 5 / mo | 25 / mo | 100 / mo | **$0.50** / project |
| **Workspace** | Models | `models` | 2 / mo | 10 / mo | 50 / mo | **$1.00** / model |
| **Actions** | Tasks | `task` | 100 / mo | 500 / mo | 2,500 / mo | **$0.01** / task |
| **Actions** | Flows | `workflow` | 5 / mo | 25 / mo | 100 / mo | **$0.10** / flow |
| **Knowledge** | Storage Upload | `knowledge` | 10 GB | 50 GB | 100 GB | **$0.05** / MB |

---

## 🛠️ Architecture & Implementation Details

### 1. Database Configuration Seeding
Subscription limits and Stripe metered price IDs for all 11 features are synced into MongoDB from [stripe-products.json](file:///c:/Users/hyper/workspace/Inso.Assistant/Inso.Assistant.Backend/config/stripe-products.json) by running:
```bash
node scripts/seed-products-to-db.js
```

### 2. Gating Middlewares
* **Plan Limit Gating**: Enforced in [planLimit.middleware.js](file:///c:/Users/hyper/workspace/Inso.Assistant/Inso.Assistant.Backend/src/app/modules/billing/planLimit.middleware.js).
  * Automatically handles guest bypass when `req.isGuest || req.user?.isGuest || !req.user` is true (allowing optional authentication routes to function without blocking guest access).
  * Resolves `chatbot` limit checks dynamically to `models` (if shared/model, i.e., `isShared === true`) or `projects` (if personal/project).
  * Resolves `search` limit checks dynamically to `research` (if deep research, i.e., `deepSearch === true`).
* **Storage Gating**: Enforced in [checkStorageLimit.js](file:///c:/Users/hyper/workspace/Inso.Assistant/Inso.Assistant.Backend/src/app/middlewares/checkStorageLimit/checkStorageLimit.js).
  * Uses the new subscription model querying with `status: 'active'`.
  * Checks cumulative storage against `limits.knowledgeLimit` or `limits.storagePerUser`.

### 3. Usage Tracking Hooks
* Metered usage is incremented in DB counters (monthly cycle resets are tracked on `cycleStartedAt` inside subscription usage) and overages are asynchronously pushed to Stripe usage records using `stripe.subscriptionItems.createUsageRecord`.
* **Knowledge uploads (bytes-to-MB)**: File sizes are uploaded in bytes, converted to MBs (`Math.ceil(bytes / (1024 * 1024))`), and reported as an integer to Stripe.
