# Pricing Plan Implementation - Gap Analysis (Updated)

**Analysis Date:** February 24, 2026  
**Status:** 🔄 Models Updated, Enforcement Missing  
**Last Updated:** February 24, 2026 - Post-Model Update Analysis

---

## 📊 Executive Summary

Database models and scripts have been updated with the new RAG-focused pricing structure, but **zero enforcement logic exists**. The old middleware checks obsolete limits, and the new subscription features are not being enforced anywhere in the application.

### Current Pricing Structure

| Plan        | Price | Requests/Day | RAG Features         | Storage/User | Team Invites |
| ----------- | ----- | ------------ | -------------------- | ------------ | ------------ |
| **Free**    | $0    | 10           | None                 | 0GB          | ❌ No        |
| **Explore** | $20   | 1,000        | Basic Text Document  | 10GB         | ✅ Yes       |
| **Execute** | $50   | 5,000        | Advanced Multi-Modal | 50GB         | ✅ Yes       |
| **Command** | $100  | 15,000       | Premium Agentic      | 100GB        | ✅ Yes       |

---

## ✅ What Currently Exists (Working)

### Database Models - UPDATED ✅

- ✅ **Product Model** ([products.model.js](src/app/modules/stripe/products/products.model.js))
  - New schema with `dailyRequestLimit`, `ragType`, `storagePerUser`, `canInviteTeam`
  - Stripe product/price IDs linked
  - Feature lists for display
- ✅ **Subscription Model** ([payment.model.js](src/app/modules/payment/payment.model.js))

  - `limits` object only: `dailyRequestLimit`, `ragType`, `storagePerUser`, `canInviteTeam`
  - Billing fields: plan_name, price, duration, expiresAt, paymentStatus
  - Stripe fields: stripeSubscriptionId, stripeCustomerId, stripePriceId, billing period
  - Multi-tenant support (userId and tenantId fields)
  - **No usage tracking** — usage is now in a dedicated model

- ✅ **UserUsage Model** ([userUsage.model.js](src/app/modules/usage/userUsage.model.js)) — NEW
  - One document per user (+ tenantId) per day
  - `requestsUsed` — counter for the current day, resets naturally on new day (new document)
  - `storageUsed` — cumulative bytes, updated on upload/delete
  - Static methods:
    - `getOrCreateToday(userId, tenantId)` - Get/create today's record
    - `incrementRequest(userId, tenantId)` - Increment and return updated doc
    - `getTodayRequests(userId, tenantId)` - Current day count
    - `updateStorage(userId, tenantId, bytes)` - Add/subtract storage bytes
    - `getTotalStorage(userId, tenantId)` - Latest storage value
  - Unique index on `{ userId, tenantId, date }` prevents duplicates
  - Daily reset is automatic — just insert new doc each day (no cron needed to zero fields)

### Scripts - READY ✅

- ✅ **update-stripe-products.js** - Updates existing Stripe products without creating duplicates
- ✅ **seed-products-to-db.js** - Seeds MongoDB Product collection from config
- ✅ Environment variables fixed (uses DATABASE_LOCAL)
- ✅ npm scripts added (`update:products`, `seed:products-db`)

### Infrastructure - EXISTING ✅

- ✅ Stripe integration working (customers, payment intents, subscriptions)
- ✅ Dual customer system: Users + Tenants both have Stripe customer IDs
- ✅ Multi-tenant context detection (`extractTenantContext` middleware)
- ✅ Public Product API: `GET /products` and `GET /prices`

---

## 🚨 Critical Gaps - What's Missing

### 1. OLD MIDDLEWARE USES WRONG LIMITS ❌

**Current Implementation:**

```javascript
// src/app/middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js
const checkDailyRequestLimit = async (req, res, next) => {
  // ❌ Checks user.isSubscribed - gives unlimited to ALL paid users
  if (user.isSubscribed && user.subscription.status === 'paid') {
    return next(); // UNLIMITED regardless of plan!
  }

  // ❌ Hardcoded 10 requests/day for everyone else
  if (!user.dailyRequestLimit) {
    user.dailyRequestLimit = {
      requestsUsed: 0,
      maxRequests: 10, // ❌ HARDCODED
      lastResetAt: new Date(),
    };
  }

  // ❌ Uses User model fields, not Subscription model
  if (user.dailyRequestLimit.requestsUsed >= 10) {
    throw new ApiError(429, 'Daily request limit exceeded');
  }
};
```

**Problems:**

1. ❌ **Paid users get "unlimited"** - No differentiation between Explore (1K), Execute (5K), Command (15K)
2. ❌ **Uses `User` model** - should read limits from `SubscriptionModel.limits.dailyRequestLimit`
3. ❌ **Hardcoded 10/day** - doesn't read plan-specific limits from Subscription
4. ❌ **Doesn't query `UserUsageModel`** - should call `UserUsageModel.getTodayRequests()` and `UserUsageModel.incrementRequest()`
5. ❌ **No context awareness** - doesn't differentiate personal mode vs org mode (`tenantId`)

**Impact:**

- Free users might exceed limits (using User model's separate counter)
- Paid users have no limits (defeating revenue model)
- Explore vs Execute vs Command plans are identical

---

### 2. NO RAG FEATURE ENFORCEMENT ❌

**Expected Behavior:**

- Free: `ragType: 'none'` → Block all RAG/knowledge bank operations
- Explore: `ragType: 'basic_text'` → Allow text document RAG only
- Execute: `ragType: 'advanced_multimodal'` → Allow images, PDFs, tables
- Command: `ragType: 'premium_agentic'` → Full agentic RAG with code execution

**Current Reality:**

```javascript
// No checks anywhere in codebase for ragType
// Knowledge bank routes have no feature checks:
router.post('/knowledge-bank/upload', auth(), uploadController.upload);
router.post('/knowledge-bank/query', auth(), queryController.search);
```

**Problems:**

1. ❌ **No middleware checks `ragType` feature**
2. ❌ **Free users can upload documents** (should be blocked)
3. ❌ **No differentiation** between basic_text vs advanced_multimodal
4. ❌ **Premium features not gated** (code execution, agentic behavior)

**Missing Implementation:**

- No `checkRAGFeature` middleware
- No document type validation based on plan
- No code execution gating for premium_agentic

**Impact:**

- Free users access premium features for free
- No reason to upgrade for RAG capabilities
- Primary product differentiator not enforced

---

### 3. NO STORAGE LIMIT ENFORCEMENT ❌

**Expected Behavior:**

- Free: 0GB → Block all uploads
- Explore: 10GB per user → Track and enforce
- Execute: 50GB per user
- Command: 100GB per user

**Current Reality:**

```javascript
// File upload endpoints have no storage checks
router.post('/upload', auth(), multer.upload, controller.handleUpload);
// No check for UserUsageModel.getTotalStorage() vs subscription.limits.storagePerUser
```

**Problems:**

1. ❌ **No storage tracking** - Files uploaded but `UserUsageModel.storageUsed` never updated
2. ❌ **No limit checks** before file upload
3. ❌ **No error when limit exceeded**
4. ❌ **No cleanup of files** when user downgrades or cancels

**Missing Implementation:**

- Middleware to check available storage before upload
- Hook to update `subscription.usage.storageUsed` after successful upload
- Delete file webhook when storage exceeded
- Background job to clean up files on downgrade/cancellation

**Impact:**

- Users can upload unlimited files regardless of plan
- Storage costs for free users
- No incentive to upgrade for storage

---

### 4. NO TEAM INVITATION ENFORCEMENT ❌

**Expected Behavior:**

- Free: `canInviteTeam: false` → Block all invitations
- All Paid: `canInviteTeam: true` → Allow team building

**Current Reality:**

```javascript
// tenantInvitation.service.js
const createInvitation = async (invitationData) => {
  // ❌ No check for subscription.limits.canInviteTeam
  const invitation = await TenantInvitation.create({ ... });
  await sendInvitationEmail({ ... });
};
```

**Problems:**

1. ❌ **Free users can send invitations**
2. ❌ **No feature flag check** before creating invitation
3. ❌ **Invitation emails sent** even when feature blocked
4. ❌ **Users can accept invitations** to free plan orgs (should be blocked)

**Missing Implementation:**

- Check `canInviteTeam` before calling `createInvitation()`
- Block invitation acceptance for free plan tenants
- Clear error message: "Team collaboration requires a paid plan"

**Impact:**

- Free users build teams without paying
- "Single user only" restriction not enforced
- Revenue loss from multi-user free accounts

---

### 5. NO DAILY USAGE RESET CRON JOB ❌ (Simplified by new model)

**Current State:**

- ✅ Cron job exists: `src/app/cron/tenant/resetUsage.js`
- ❌ **BUT** it only resets tenant-level `apiCallsUsed` (unrelated)

**With the new `UserUsage` model, daily reset is automatic by design:**

```javascript
// UserUsage uses per-day documents { userId, tenantId, date }
// A new day = a new document = requestsUsed starts at 0
// No cron needed just to reset request counters!

// But a lightweight cron is still useful to delete old records:
cron.schedule('0 2 * * *', async () => {
  // Delete usage docs older than 90 days (keep history, save disk space)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const result = await UserUsageModel.deleteMany({ date: { $lt: cutoff } });
  logger.info(`Cleaned up ${result.deletedCount} old usage records`);
});
```

**What still needs building:**

1. ❌ The optional cleanup cron above
2. ❌ A cron to handle subscription **expiry** (set `paymentStatus = 'expired'` once `expiresAt` passes)

**Impact:**

- No danger of users being permanently blocked by stale counters
- Historical usage data available (query `UserUsage` by date range)

---

### 6. NO STRIPE WEBHOOK HANDLERS ❌

**Required Webhooks:**
When Stripe subscription changes, database must sync:

```javascript
// MISSING: Webhook handlers for:
// 1. customer.subscription.created → Create subscription in DB
// 2. customer.subscription.updated → Update limits/status
// 3. customer.subscription.deleted → Cancel subscription
// 4. invoice.payment_succeeded → Extend subscription period
// 5. invoice.payment_failed → Handle failed payment
```

**Current State:**

- ❌ No webhook endpoint exists
- ❌ Subscriptions created in Stripe don't auto-create in MongoDB
- ❌ Plan upgrades in Stripe Dashboard don't update limits in database
- ❌ Cancellations in Stripe don't revoke access

**Problems:**

1. Manual subscription creation required (error-prone)
2. Database and Stripe out of sync
3. Users pay but don't get upgraded limits
4. Canceled users retain access

**Impact:**

- Revenue recognition issues
- Support burden (manual syncing)
- Users pay but features don't unlock

---

### 7. NO CONTEXT-AWARE LIMIT CHECKING ❌

**Multi-Tenant Architecture:**
Your app has two modes:

- **Personal Mode**: `req.currentTenantId === null` → Use user's personal subscription
- **Organization Mode**: `req.currentTenantId === ObjectId` → Use tenant/org subscription

**Current Middleware:**

```javascript
// checkDailyRequestLimit doesn't check context
// Always looks at user.dailyRequestLimit (wrong!)
const user = await UserModel.findById(userId);
// ❌ Should check: req.currentTenantId to determine which subscription to use
```

**Missing Logic (correct approach with two-model design):**

```javascript
import SubscriptionModel from '../modules/payment/payment.model.js';
import UserUsageModel from '../modules/usage/userUsage.model.js';

// 1. Get the right subscription based on context
const filter = req.currentTenantId
  ? { tenantId: req.currentTenantId, paymentStatus: 'paid' }
  : { userId: req.user.id, tenantId: null, paymentStatus: 'paid' };

const subscription = await SubscriptionModel.findOne(filter);
const dailyLimit = subscription?.limits.dailyRequestLimit ?? 10; // 10 = free plan default

// 2. Get today's usage from UserUsage (separate collection)
const todayCount = await UserUsageModel.getTodayRequests(
  req.user.id,
  req.currentTenantId ?? null
);

// 3. Enforce
if (todayCount >= dailyLimit) {
  throw new ApiError(429, `Daily limit of ${dailyLimit} requests reached.`);
}

// 4. Increment usage
await UserUsageModel.incrementRequest(req.user.id, req.currentTenantId ?? null);
```

**Impact:**

- Organization subscriptions not enforced
- Personal subscriptions not enforced
- Users in organizations might use personal limits (wrong)

---

### 8. NO USAGE STATS API ❌

**Users Need Visibility:**
How much have I used? How much is left?

**Missing Endpoint:**

```javascript
// MISSING: GET /api/v1/usage/stats
// Implementation queries two models:
//   - SubscriptionModel → limits (dailyRequestLimit, storagePerUser, ragType, canInviteTeam)
//   - UserUsageModel    → today's count (requestsUsed, storageUsed)

// Response:
{
  "requestsUsedToday": 47,
  "requestsLimit": 1000,
  "remainingRequests": 953,
  "percentageUsed": 4.7,
  "storageUsed": 2147483648,  // 2GB in bytes (from UserUsage.storageUsed)
  "storageLimit": 10737418240, // 10GB (from Subscription.limits.storagePerUser)
  "storageUsedGB": 2,
  "storageLimitGB": 10,
  "resetsAt": "2026-02-25T00:00:00.000Z",   // next UTC midnight
  "plan": "explore",
  "features": {
    "ragType": "basic_text",
    "canInviteTeam": true
  }
}
```

**Impact:**

- Users don't know when they'll hit limits
- No proactive upgrade prompts
- Confusion and frustration
- Support tickets: "Why am I blocked?"

---

## 📋 Implementation Checklist

### 🔴 Phase 1: Critical (Fix Enforcement) - 3-5 days

- [ ] **1. Rewrite checkDailyRequestLimit Middleware**

  - [ ] File: `src/app/middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js`
  - [ ] Check context: personal (`tenantId = null`) vs organization mode
  - [ ] Get plan limits from: `SubscriptionModel.findOne({ userId, tenantId, paymentStatus: 'paid' })`
  - [ ] Get today's usage from: `UserUsageModel.getTodayRequests(userId, tenantId)`
  - [ ] Compare: `todayCount >= subscription.limits.dailyRequestLimit`
  - [ ] On pass: call `UserUsageModel.incrementRequest(userId, tenantId)`
  - [ ] Return 429 with clear upgrade prompt when limit hit
  - [ ] Note: No manual reset logic needed — UserUsage is per-day by design

- [ ] **2. Create RAG Feature Check Middleware**

  - [ ] File: `src/app/middlewares/checkRAGFeature.js`
  - [ ] Get subscription (context-aware)
  - [ ] Check `subscription.limits.ragType`
  - [ ] Block if `ragType === 'none'`
  - [ ] Validate document type for `basic_text` (text only)
  - [ ] Return 403 with upgrade message

- [ ] **3. Apply Middleware to Routes**

  - [ ] All search routes → Keep `checkDailyRequestLimit` (now fixed)
  - [ ] Knowledge bank routes → Add `checkRAGFeature`
  - [ ] Document upload routes → Add `checkRAGFeature` + storage check
  - [ ] Translation routes → Keep existing (standard requests)
  - [ ] Workflow automation → Keep existing (standard requests)

- [ ] **4. Add Storage Check Middleware**

  - [ ] File: `src/app/middlewares/checkStorageLimit.js`
  - [ ] Get subscription limits: `SubscriptionModel.findOne({ userId, tenantId })`
  - [ ] Get current storage: `UserUsageModel.getTotalStorage(userId, tenantId)`
  - [ ] Compare: `storageUsed + incomingFileSize > subscription.limits.storagePerUser`
  - [ ] Block if exceeds limit
  - [ ] Return 413 Payload Too Large with upgrade prompt

- [ ] **5. Add Storage Tracking Hook**

  - [ ] After successful file upload
  - [ ] Call `UserUsageModel.updateStorage(userId, tenantId, +fileSize)` to add bytes
  - [ ] On file delete: `UserUsageModel.updateStorage(userId, tenantId, -fileSize)` to subtract
  - [ ] Track in knowledge bank upload controller
  - [ ] Track in document upload controller
  - [ ] Track in image upload endpoints

- [ ] **6. Team Invitation Feature Check**

  - [ ] Update `tenant.service.js` (inviteUser method)
  - [ ] Before creating invitation, get subscription
  - [ ] Check `subscription.limits.canInviteTeam`
  - [ ] If false, throw error: "Team collaboration requires paid plan"
  - [ ] Return clear upgrade CTA

- [ ] **7. Create Cleanup Cron Job** (optional, not blocking)

  - [ ] File: `src/app/cron/usage/cleanupOldUsage.js`
  - [ ] Schedule: `0 2 * * *` (2am daily)
  - [ ] Delete `UserUsage` docs older than 90 days
  - [ ] Also expire subscriptions where `expiresAt < now`
  - [ ] Register in `index.js` or `server.js`
  - [ ] Note: **No daily counter reset needed** — new day = new UserUsage document automatically

- [ ] **8. Test End-to-End**
  - [ ] Free user: 10 requests/day → blocked at 11
  - [ ] Free user: No RAG → blocked on knowledge bank
  - [ ] Free user: No team invites → blocked on invite
  - [ ] Explore user: 1,000 requests/day → works
  - [ ] Explore user: Basic RAG → text docs only
  - [ ] Explore user: 10GB storage → blocked at limit
  - [ ] Execute user: higher limits work correctly
  - [ ] Midnight rollover → counters reset

---

### 🟡 Phase 2: Webhooks & Sync - 2-3 days

- [ ] **9. Create Stripe Webhook Endpoint**

  - [ ] File: `src/app/modules/stripe/stripe.webhook.js`
  - [ ] Route: `POST /api/v1/stripe/webhook`
  - [ ] Verify Stripe signature
  - [ ] Handle event types (see below)

- [ ] **10. Handle customer.subscription.created**

  - [ ] Create subscription in MongoDB
  - [ ] Lookup product features from Product model
  - [ ] Copy features to subscription.limits
  - [ ] Initialize usage counters
  - [ ] Log creation

- [ ] **11. Handle customer.subscription.updated**

  - [ ] Find subscription by stripeSubscriptionId
  - [ ] Update plan_name, stripePriceId
  - [ ] Lookup new product features
  - [ ] Update subscription.limits
  - [ ] Reset usage if downgrade (don't carry over excess usage)
  - [ ] Log update

- [ ] **12. Handle customer.subscription.deleted**

  - [ ] Find subscription by stripeSubscriptionId
  - [ ] Set paymentStatus = 'canceled'
  - [ ] Set canceledAt = new Date()
  - [ ] Optionally downgrade to free plan
  - [ ] Log cancellation

- [ ] **13. Handle invoice.payment_succeeded**

  - [ ] Update currentPeriodStart, currentPeriodEnd
  - [ ] Set paymentStatus = 'paid'
  - [ ] Log successful payment

- [ ] **14. Handle invoice.payment_failed**
  - [ ] Set paymentStatus = 'pending' or 'expired'
  - [ ] Send notification to user
  - [ ] Log failed payment
  - [ ] Optionally pause access after grace period

---

### 🟢 Phase 3: User Experience - 2-3 days

- [ ] **15. Create Usage Stats API**

  - [ ] Route: `GET /api/v1/usage/stats`
  - [ ] Auth required
  - [ ] Get subscription (context-aware: personal vs org)
  - [ ] Return: requests used/limit, storage used/limit, plan info
  - [ ] Calculate percentage used
  - [ ] Return reset time (next midnight)

- [ ] **16. Create Upgrade Prompts**

  - [ ] When limit reached (429/403 errors)
  - [ ] Include: current plan, usage, recommended plan
  - [ ] Add upgrade URL: `/pricing` or direct Stripe checkout link
  - [ ] Track conversion metrics

- [ ] **17. Usage Warning Emails**

  - [ ] At 80% usage → Send warning email
  - [ ] At 100% usage → Send limit reached email
  - [ ] Include upgrade CTA
  - [ ] Schedule with cron or check on each request

- [ ] **18. Frontend Integration**

  - [ ] Display usage stats in dashboard
  - [ ] Progress bars for requests and storage
  - [ ] Upgrade buttons when approaching limits
  - [ ] Plan comparison modal

- [ ] **19. Admin Dashboard**
  - [ ] View all subscriptions
  - [ ] Manual limit adjustments (emergency override)
  - [ ] Usage analytics charts
  - [ ] Audit logs for limit changes

---

## 💰 Revenue Risk Analysis

### Current State

- ✅ Models updated with new structure
- ✅ Scripts ready to sync Stripe
- ❌ **Zero enforcement** = Zero differentiation

### Potential Losses

**Scenario 1: Free Rider Problem**

- 1,000 users discover no limits are enforced
- Each would pay $20-100/month on paid plans
- **Loss: $20,000-100,000/month = $240K-1.2M/year**

**Scenario 2: Paid Users Get No Value**

- Users upgrade expecting higher limits
- Discover limits aren't enforced (everyone unlimited)
- Request refunds, leave negative reviews
- **Reputational damage + churn**

**Scenario 3: RAG Feature Bypass**

- Free users access RAG/knowledge bank features
- No incentive to upgrade for primary differentiator
- **Loss: 500 users × $20/month = $10K/month = $120K/year**

**Scenario 4: Storage Overload**

- Free users upload unlimited files (0GB limit not enforced)
- Cloud storage costs spiral
- **Cost: 1,000 users × 50GB × $0.02/GB = $1,000/month**

### Estimated Total Risk

**$300,000 - $1,500,000 annual revenue loss** from enforcement gaps  
**Plus** ongoing cloud storage costs for free users

---

## 🎯 Recommended Action Plan

### Week 1: Fix Critical Enforcement (Days 1-5)

**Goal:** Limits actually enforced

1. ✅ Day 1: Rewrite checkDailyRequestLimit middleware (use Subscription model)
2. ✅ Day 2: Create checkRAGFeature middleware + apply to knowledge bank routes
3. ✅ Day 3: Create checkStorageLimit middleware + add storage tracking
4. ✅ Day 4: Add team invitation checks + test all enforcement
5. ✅ Day 5: Create daily reset cron job + deploy to staging

### Week 2: Webhooks & Sync (Days 6-10)

**Goal:** Stripe and database auto-sync

6. ✅ Day 6: Create webhook endpoint with signature verification
7. ✅ Day 7: Handle subscription created/updated/deleted events
8. ✅ Day 8: Handle invoice payment events
9. ✅ Day 9: Test webhook flow end-to-end
10. ✅ Day 10: Deploy webhooks to production

### Week 3: User Experience (Days 11-15)

**Goal:** Users see their usage and upgrade prompts

11. ✅ Day 11: Create usage stats API
12. ✅ Day 12: Add upgrade prompts to limit errors
13. ✅ Day 13: Usage warning emails (80%, 100%)
14. ✅ Day 14: Frontend dashboard integration
15. ✅ Day 15: Marketing push + monitoring

---

## 📁 Files Requiring Changes

### **New Files to Create:**

1. `src/app/middlewares/checkRAGFeature.js` → RAG feature gating
2. `src/app/middlewares/checkStorageLimit.js` → Storage enforcement
3. `src/app/cron/usage/cleanupOldUsage.js` → Old usage record cleanup + subscription expiry
4. `src/app/modules/stripe/stripe.webhook.js` → Webhook handlers
5. `src/app/modules/usage/usage.controller.js` → Usage stats API
6. `src/app/modules/usage/usage.route.js` → Usage endpoints

> **Already Created:**
>
> - `src/app/modules/usage/userUsage.model.js` ✅ — daily usage counter (per user per day)

### **Existing Files to Update:**

#### Middleware

- `src/app/middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js` → **Complete rewrite** (use `UserUsageModel.incrementRequest` + `SubscriptionModel.limits`)

#### Routes

- `src/app/modules/search/search.route.js` → Keep existing middleware (fixed)
- `src/app/modules/knowledge/knowledge.route.js` → Add `checkRAGFeature`
- `src/app/modules/documents/document.route.js` → Add storage checks

#### Services

- `src/app/modules/tenant/tenant.service.js` → Add `canInviteTeam` check

#### Controllers

- Knowledge bank upload controller → Add storage tracking
- Document upload controller → Add storage tracking

#### Configuration

- `index.js` or `server.js` → Register daily reset cron job
- `index.js` → Register webhook route

---

## 🧪 Testing Checklist

### Unit Tests

- [ ] `UserUsageModel.incrementRequest()` creates doc if none exists, increments if exists
- [ ] `UserUsageModel.getTodayRequests()` returns 0 for new day / correct count otherwise
- [ ] `UserUsageModel.updateStorage()` adds/subtracts, clamps to 0 on negative
- [ ] `UserUsageModel.getTotalStorage()` returns latest storageUsed
- [ ] Middleware: checkDailyRequestLimit reads from `UserUsageModel` not `Subscription.usage`
- [ ] Middleware: checkRAGFeature for each plan type
- [ ] Middleware: checkStorageLimit reads `UserUsageModel.getTotalStorage`

### Integration Tests

- [ ] Free user blocked at 10 requests
- [ ] Explore user blocked at 1,000 requests
- [ ] Free user blocked from knowledge bank (RAG)
- [ ] Explore user can upload text docs only
- [ ] Execute user can upload multimodal docs
- [ ] Storage limit blocks upload when exceeded
- [ ] Storage tracking (`UserUsageModel.storageUsed`) increments on upload, decrements on delete
- [ ] Team invitations blocked for free plan
- [ ] Daily reset is automatic (new day creates new `UserUsage` doc, counter starts at 0)
- [ ] Context switching: personal vs organization uses correct subscription + usage record

### Webhook Tests

- [ ] subscription.created creates DB record
- [ ] subscription.updated changes limits
- [ ] subscription.deleted revokes access
- [ ] Payment success extends subscription
- [ ] Payment failure handles gracefully

### End-to-End Tests

- [ ] Signup → Free plan → Hit limit → Shown upgrade prompt
- [ ] Upgrade → Limits increase immediately
- [ ] Upload files → Storage tracked → Limit enforced
- [ ] Create team → Blocked on free → Upgrade → Works
- [ ] Midnight passes → Counters reset automatically

---

## 📞 User-Facing Messaging

### When Daily Limit Reached (429)

```
You've reached your daily request limit (10/10 used).

Your limit resets at midnight.

Want more? Upgrade to:
• Explore: 1,000 requests/day ($20/month)
• Execute: 5,000 requests/day ($50/month)
• Command: 15,000 requests/day ($100/month)

[View Plans]
```

### When RAG Feature Blocked (403)

```
Knowledge Bank & RAG features require a paid plan.

Your plan: Free (No RAG)

Upgrade to:
• Explore: Basic Text Document RAG + 10GB storage ($20/month)
• Execute: Advanced Multi-Modal RAG + 50GB storage ($50/month)
• Command: Premium Agentic RAG + 100GB storage ($100/month)

[Upgrade Now]
```

### When Storage Limit Reached (413)

```
Storage limit exceeded (10.2GB / 10GB used).

Free up space by deleting old files, or upgrade to:
• Execute: 50GB storage ($50/month)
• Command: 100GB storage ($100/month)

[Manage Files] [Upgrade]
```

### When Team Invite Blocked (403)

```
Team collaboration requires a paid plan.

Your plan: Free (Single user only)

Upgrade to any paid plan for unlimited team members:
• Explore: $20/month
• Execute: $50/month
• Command: $100/month

[Upgrade to Invite Team]
```

---

## 🔐 Security Considerations

1. **Server-Side Only:** All limit checks on server (never trust client)
2. **Signature Verification:** Validate Stripe webhook signatures
3. **Rate Limiting:** Keep existing rate limiters as DoS protection
4. **Audit Logging:** Log all limit checks and overrides
5. **Admin Override:** Require 2FA for manual limit increases
6. **Context Isolation:** Ensure personal/org subscriptions don't leak

---

## 📈 Success Metrics

### Track These KPIs (Post-Implementation):

1. **Limit Hit Rate:** % of users hitting daily limits (target: 20-30%)
2. **Conversion Rate:** Free → Paid after hitting limit (target: 10-15%)
3. **Upgrade Timing:** Days until upgrade after limit hit (target: <7 days)
4. **Plan Distribution:** % users in each tier
   - Free: 60-70%
   - Explore: 20-25%
   - Execute: 8-12%
   - Command: 3-5%
5. **Revenue Per User:** MRR / Total Users (target: $25-35)
6. **Churn Rate:** % downgrades/cancellations (target: <5%)
7. **Feature Adoption:** % paid users using RAG features (target: >60%)
8. **Storage Usage:** Average storage per paid user (track costs)

---

## 🆘 Emergency Rollback Plan

If enforcement causes major issues:

1. **Feature Flag:** Add `ENFORCE_PLAN_LIMITS=false` to env
2. **Middleware Bypass:** Check flag in all middlewares, skip if disabled
3. **Revert Deployment:** Keep previous version ready for instant rollback
4. **Communication:** Email all users 48 hours before enabling enforcement
5. **Gradual Rollout:**
   - Day 1: Enable for 10% of users
   - Day 3: Enable for 50% of users
   - Day 7: Enable for 100% of users
6. **Monitor:** Watch error rates, support tickets, churn

---

## ✅ Next Steps

1. **Run update:products script** → Sync Stripe products with new metadata

```bash
npm run update:products
```

2. **Review this document** with product & engineering teams

3. **Assign ownership** for each Phase 1 task

4. **Sprint Planning:** Allocate 3-5 days for Phase 1 (critical)

5. **Set deadline:** Target Phase 1 completion in 1 week

6. **Schedule daily standup:** Track progress, unblock issues

7. **Prepare rollback plan:** Document how to disable enforcement if needed

8. **Communicate to users:** "We're improving our service tiers" email before launch

---

**Document Version:** 2.0  
**Last Updated:** February 24, 2026  
**Owner:** Engineering Team  
**Status:** 🔄 Models Updated, Enforcement Pending
