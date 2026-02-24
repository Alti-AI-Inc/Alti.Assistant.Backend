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

### 1. Rewrite `checkDailyRequestLimit` Middleware
**File:** `src/app/middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js`

- [ ] Detect context: personal (`tenantId = null`) vs org (`tenantId = ObjectId`) from `req.currentTenantId`
- [ ] Get limits: `SubscriptionModel.findOne({ userId, tenantId, paymentStatus: 'paid' })` → fallback to free (10/day)
- [ ] Get today's count: `UserUsageModel.getTodayRequests(userId, tenantId)`
- [ ] Block if `todayCount >= subscription.limits.dailyRequestLimit` → return 429
- [ ] On pass: `UserUsageModel.incrementRequest(userId, tenantId)`
- [ ] No reset logic needed — new day = new `UserUsage` document automatically

---

### 2. Create `checkRAGFeature` Middleware
**File:** `src/app/middlewares/checkRAGFeature.js`

- [ ] Get subscription (context-aware: personal vs org)
- [ ] Read `subscription.limits.ragType`
- [ ] Block if `ragType === 'none'` → return 403
- [ ] For `basic_text`: validate uploaded file is text/document (no images, video)
- [ ] For `advanced_multimodal`: allow images, PDFs, tables
- [ ] For `premium_agentic`: allow all types

---

### 3. Create `checkStorageLimit` Middleware
**File:** `src/app/middlewares/checkStorageLimit.js`

- [ ] Get subscription (context-aware)
- [ ] Get current storage: `UserUsageModel.getTotalStorage(userId, tenantId)`
- [ ] Calculate if `storageUsed + incomingFileSize > subscription.limits.storagePerUser`
- [ ] Block if exceeded → return 413 with upgrade prompt
- [ ] Pass file size via `req.fileSize` for the middleware to read

---

### 4. Apply Middleware to Routes

- [ ] `search.route.js` — keep `checkDailyRequestLimit` (rewritten)
- [ ] `translation.route.js` — keep `checkDailyRequestLimit`
- [ ] `workflow_automation/chat.routes.js` — keep `checkDailyRequestLimit`
- [ ] Knowledge bank routes — add `checkRAGFeature`
- [ ] Document upload routes — add `checkRAGFeature` + `checkStorageLimit`
- [ ] Image upload routes — add `checkStorageLimit`

---

### 5. Storage Tracking Hooks

- [ ] After **upload success**: `UserUsageModel.updateStorage(userId, tenantId, +fileSize)`
- [ ] After **file delete**: `UserUsageModel.updateStorage(userId, tenantId, -fileSize)`
- [ ] Add to: knowledge bank upload controller
- [ ] Add to: document upload controller
- [ ] Add to: image upload endpoint

---

### 6. Team Invitation Check
**File:** `src/app/modules/tenant/tenant.service.js` (inviteUser method)

- [ ] Before calling `createInvitation()`, fetch the tenant's subscription
- [ ] Check `subscription.limits.canInviteTeam`
- [ ] If `false` → throw error: `"Team collaboration requires a paid plan"`
- [ ] Include upgrade plan options in error response

---

### 7. Cleanup Cron Job *(optional — not blocking)*
**File:** `src/app/cron/usage/cleanupOldUsage.js`

- [ ] Schedule: `0 2 * * *` (2am daily)
- [ ] Delete `UserUsage` docs older than 90 days
- [ ] Expire subscriptions where `expiresAt < now` (set `paymentStatus = 'expired'`)
- [ ] Register in `index.js` or `server.js`

---

### 8. Phase 1 Testing

- [ ] Free user hits limit at request 11 → 429 returned
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
| 🔴 TODO | `src/app/middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js` | Complete rewrite |
| 🔴 TODO | `src/app/middlewares/checkRAGFeature.js` | New middleware |
| 🔴 TODO | `src/app/middlewares/checkStorageLimit.js` | New middleware |
| 🔴 TODO | `src/app/modules/tenant/tenant.service.js` | Add `canInviteTeam` check |
| 🟡 TODO | `src/app/modules/stripe/stripe.webhook.js` | New webhook handler |
| 🟡 TODO | `src/app/cron/usage/cleanupOldUsage.js` | New cleanup cron |
| 🟢 TODO | `src/app/modules/usage/usage.controller.js` | Usage stats API |
| 🟢 TODO | `src/app/modules/usage/usage.route.js` | Usage route |
