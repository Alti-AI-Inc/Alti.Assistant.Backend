# Implementation Task List
**Updated:** February 24, 2026

---

## Architecture

| Model | Purpose |
|---|---|
| `Subscription` (`payment.model.js`) | Plan limits only — `dailyRequestLimit`, `ragType`, `storagePerUser`, `canInviteTeam` |
| `UserUsage` (`userUsage.model.js`) | Daily counters — `requestsUsed` per day, cumulative `storageUsed` |
| `Product` (`products.model.js`) | Stripe product catalog with feature definitions |

---

## 🔴 Phase 1 — Enforcement (3-5 days)

### 1. ~~Rewrite `checkDailyRequestLimit` Middleware~~ ✅
**File:** `src/app/middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js`

- [x] Detect context: personal (`tenantId = null`) vs org (`tenantId = ObjectId`) from `req.currentTenantId`
- [x] Get limits: `SubscriptionModel.findOne({ userId, tenantId, paymentStatus: 'paid' })` → fallback to free (10/day)
- [x] Get today's count: `UserUsageModel.getTodayRequests(userId, tenantId)`
- [x] Block if `todayCount >= subscription.limits.dailyRequestLimit` → return 429
- [x] On pass: `UserUsageModel.incrementRequest(userId, tenantId)`
- [x] No reset logic needed — new day = new `UserUsage` document automatically

---

### 2. ~~Create `checkRAGFeature` Middleware~~ ✅
**File:** `src/app/middlewares/checkRAGFeature/checkRAGFeature.js`

- [x] Get subscription (context-aware: personal vs org)
- [x] Read `subscription.limits.ragType`
- [x] Block if `ragType === 'none'` → return 403
- [x] For `basic_text`: validate uploaded file is text/document (no images, video)
- [x] For `advanced_multimodal`: allow images, PDFs, tables
- [x] For `premium_agentic`: allow all types

---

### 3. ~~Create `checkStorageLimit` Middleware~~ ✅
**File:** `src/app/middlewares/checkStorageLimit/checkStorageLimit.js`

- [x] Get subscription (context-aware)
- [x] Get current storage: `UserUsageModel.getTotalStorage(userId, tenantId)`
- [x] Calculate if `storageUsed + incomingFileSize > subscription.limits.storagePerUser`
- [x] Block if exceeded → return 413 with upgrade prompt
- [x] Pass file size via `req.fileSize` for the middleware to read

---

### 4. ~~Apply Middleware to Routes~~ ✅

- [x] `code.route.js` — added `checkDailyRequestLimit`
- [x] `writing/workflow.route.js` — added `checkDailyRequestLimit`
- [x] `deep_research.route.js` — added `checkDailyRequestLimit`
- [x] `summary.route.js` — added DRL + STG + RAG (order: DRL → STG → upload → RAG)
- [x] `enhanced_image.route.js` — added DRL to 5 generation routes; fixed duplicate `extractTenantContext`
- [x] `video.route.js` — added DRL to `/generate`
- [x] `transcription.route.js` — added DRL + STG + RAG on `/assistant`
- [x] `knowledge_bank.routes.js` — added STG + RAG on `/upload`; RAG on `/process` and `/folders` (create)
- [x] `knowledgebase.routes.js` — added STG + RAG on `/upload`; RAG on `/chat`, `/invoke-rag`, `/create`; added `extractTenantContext` to previously missing routes
- [x] `article_writer.route.js` — added STG + RAG on `/assistant`
- [x] `document_analysis.route.js` — added STG + RAG on `/analyze`
- [x] `document_review.route.js` — added STG + RAG on `/assistant` and `/review`; added DRL to `/review`
- [x] `legal_contract.route.js` — added STG + RAG on `/assistant`
- [x] `legal_contract_review.route.js` — added STG + RAG on `/assistant` and `/review`; added DRL to `/review`
- [x] `rewrite.route.js` — added DRL + STG + RAG on `/rewrite`
- [x] `report.route.js` — added STG + RAG on `/assistant` and `/analyze`; added DRL + extractTenantContext to `/analyze`
- [x] `plan_generator.route.js` — replaced old `checkStorageLimit(10485760)` + `checkApiCallLimit` + `trackStorageUsage` with new `checkStorageLimit` + `checkRAGFeature`

---

### 5. Storage Tracking Hooks ✅

- [x] After **upload success**: `UserUsageModel.updateStorage(userId, tenantId, +fileSize)`
- [x] After **file delete**: `UserUsageModel.updateStorage(userId, tenantId, -fileSize)`
- [x] Add to: knowledge bank upload controller (`knowledge_bank.controller.js`)
- [x] Add to: knowledgebase upload/delete controller (`knowledgebase.controller.js`)
- [x] Note: image/document endpoints use `memoryStorage()` — not persisted, no quota tracking needed

---

### 6. Team Invitation Check ✅
**File:** `src/app/modules/tenant/tenant.service.js` (inviteMember method)

- [x] Before calling `createInvitation()`, fetch the tenant's subscription
- [x] Check `subscription.limits.canInviteTeam`
- [x] If `false` → throw 403 error: `"Team collaboration requires a paid plan (current: <plan>). Upgrade to Explore ($20/mo), Execute ($50/mo), or Command ($100/mo) to invite team members."`
- [x] Fallback: no paid subscription found → `canInviteTeam = false` (free plan default)

---

### 7. Cleanup Cron Job ✅
**File:** `src/app/cron/usage/cleanupOldUsage.js`

- [x] Schedule: `0 2 * * *` (2am daily)
- [x] Delete `UserUsage` docs older than 90 days
- [x] Expire subscriptions where `expiresAt < now` (set `paymentStatus = 'expired'`)
- [x] Registered in `index.js` as side-effect import (same pattern as `resetUsage.js`)

---

### 8. Phase 1 Testing

- [x] Free user hits limit at request 11 → 429 returned
- [ ] Free user blocked from knowledge bank (ragType = none)
- [ ] Free user cannot send team invitation
- [ ] Explore user: 1,000 requests/day allowed
- [ ] Explore user: text-only RAG, image upload blocked
- [ ] Explore user: blocked when storage exceeds 10GB
- [ ] Execute user: multimodal RAG and 50GB storage work
- [ ] New day → request counter resets (new `UserUsage` doc)
- [ ] Personal mode and org mode route to correct subscription

---

## 🟡 Phase 2 — Stripe Webhooks (2-3 days)

### 9. Webhook Endpoint
**File:** `src/app/modules/stripe/stripe.webhook.js`  
**Route:** `POST /api/v1/stripe/webhook`

- [ ] Verify Stripe webhook signature (`stripe.webhooks.constructEvent`)
- [ ] Route to handler by event type

---

### 10. `customer.subscription.created`

- [ ] Create subscription document in MongoDB
- [ ] Look up plan features from `Product` model by `stripePriceId`
- [ ] Copy features into `subscription.limits`
- [ ] Set `paymentStatus = 'paid'`, billing period fields

---

### 11. `customer.subscription.updated`

- [ ] Find subscription by `stripeSubscriptionId`
- [ ] Update `plan_name`, `stripePriceId`
- [ ] Look up new product features from `Product` model
- [ ] Update `subscription.limits` with new values

---

### 12. `customer.subscription.deleted`

- [ ] Find subscription by `stripeSubscriptionId`
- [ ] Set `paymentStatus = 'canceled'`, `canceledAt = new Date()`
- [ ] Downgrade limits to free plan defaults

---

### 13. `invoice.payment_succeeded`

- [ ] Find subscription, set `paymentStatus = 'paid'`
- [ ] Update `currentPeriodStart`, `currentPeriodEnd`

---

### 14. `invoice.payment_failed`

- [ ] Set `paymentStatus = 'pending'`
- [ ] Send notification to user
- [ ] Optionally pause access after a grace period

---

### 15. Phase 2 Testing

- [ ] Stripe subscription created → DB record created with correct limits
- [ ] Plan upgrade in Stripe → `subscription.limits` updated in DB
- [ ] Subscription canceled in Stripe → `paymentStatus = 'canceled'`
- [ ] Successful payment → period extended
- [ ] Failed payment handled without breaking access immediately

---

## 🟢 Phase 3 — User Experience (2-3 days)

### 16. Usage Stats API
**Route:** `GET /api/v1/usage/stats`

- [ ] Auth required
- [ ] Get subscription (context-aware)
- [ ] Get today's usage from `UserUsageModel.getTodayRequests()`
- [ ] Get storage from `UserUsageModel.getTotalStorage()`
- [ ] Return: `requestsUsed`, `requestsLimit`, `remaining`, `%used`, `storageUsed`, `storageLimit`, `plan`, `features`, `resetsAt`
- [ ] Wire up route in `src/app/modules/usage/usage.route.js`

---

### 17. Upgrade Prompts in Error Responses

- [ ] 429 response body includes: current plan, usage, recommended plan, upgrade URL
- [ ] 403 (RAG blocked) response body includes: feature comparison, upgrade URL
- [ ] 413 (storage) response body includes: current usage, plan limits, upgrade URL

---

### 18. Usage Warning Emails

- [ ] On each request: check if `requestsUsed / dailyRequestLimit >= 0.8`
- [ ] If first time hitting 80% → send warning email
- [ ] On limit hit (100%) → send limit reached email with upgrade CTA
- [ ] Track sent state to avoid duplicate emails (flag on `UserUsage` doc or separate record)

---

### 19. Admin Dashboard

- [ ] View all subscriptions with current plan and status
- [ ] Manual limit override per user/tenant
- [ ] Usage history charts (query `UserUsage` by date range)
- [ ] Audit log for manual overrides

---

## Files Summary

| Status | File | Change |
|---|---|---|
| ✅ Done | `src/app/modules/payment/payment.model.js` | Limits only, no usage fields |
| ✅ Done | `src/app/modules/usage/userUsage.model.js` | New — daily usage per user per day |
| ✅ Done | `src/app/modules/stripe/products/products.model.js` | New schema with RAG features |
| ✅ Done | `scripts/update-stripe-products.js` | Update existing Stripe products |
| ✅ Done | `scripts/seed-products-to-db.js` | Seed Product collection |
| ✅ Done | `src/app/middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js` | Complete rewrite |
| ✅ Done | `src/app/middlewares/checkRAGFeature/checkRAGFeature.js` | New middleware |
| ✅ Done | `src/app/middlewares/checkStorageLimit/checkStorageLimit.js` | New middleware |
| ✅ Done | `src/app/modules/tenant/tenant.service.js` | Add `canInviteTeam` check |
| 🟡 TODO | `src/app/modules/stripe/stripe.webhook.js` | New webhook handler |
| ✅ Done | `src/app/cron/usage/cleanupOldUsage.js` | New cleanup cron |
| 🟢 TODO | `src/app/modules/usage/usage.controller.js` | Usage stats API |
| 🟢 TODO | `src/app/modules/usage/usage.route.js` | Usage route |
