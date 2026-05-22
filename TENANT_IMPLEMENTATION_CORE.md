# SaaS Tenant Management - Core Implementation Guide

This guide focuses on the core implementation tasks for multi-tenant functionality in Alti AI Core Service.

**Focus:** Implementation only (excludes testing, documentation, and migration phases)

---

## 📋 Pre-Implementation

- [ ] Review [SAAS_TENANT_MANAGEMENT.md](./SAAS_TENANT_MANAGEMENT.md) architecture document
- [ ] Get stakeholder approval on design
- [ ] Define pricing tiers and limits
- [ ] Set up staging environment
- [ ] Create database backup strategy
- [ ] Schedule team kickoff meeting

---

## Phase 1: Foundation Setup

### 1.1 Create Tenant Module Structure

- [x] Create directory: `src/app/modules/tenant/`
- [x] Create `tenant.model.js` with schema
- [x] Create `tenantInvitation.model.js` with invitation schema
- [x] Create `tenant.controller.js`
- [x] Create `tenant.service.js`
- [x] Create `tenantInvitation.service.js` for invitation logic
- [x] Create `tenant.route.js`
- [x] Create `tenant.validation.js`
- [x] Create `README.md` for tenant module
- [x] Create email template: `src/app/templates/emails/tenantInvitation.html`

### 1.2 Create Middleware

- [x] Create `src/app/middlewares/tenant/tenantContext.js`
- [x] Implement `extractTenantContext()` function
- [x] Implement `requireTenant()` middleware
- [x] Implement `checkTenantPermission()` middleware
- [x] Implement `checkTenantLimits()` middleware
- [x] Implement `incrementTenantUsage()` middleware
- [x] Implement `validateInvitationToken()` middleware for invitation links

### 1.3 Create Helper Utilities

- [x] Create `src/app/helpers/tenantQuery.js`
- [x] Implement `withTenantFilter()` helper
- [x] Implement `withTenantContext()` helper
- [x] Implement `withTenantPipeline()` helper
- [x] Implement `validateTenantOwnership()` helper
- [x] Implement `batchWithTenantContext()` helper
- [x] Add JSDoc documentation

### 1.4 Register Routes

- [x] Import tenant routes in `src/app/routes/index.js`
- [x] Register `/tenant` path

---

## Phase 2: Database Schema Updates

### 2.1 Update User Model

- [x] Add `tenantId` field to User schema
- [x] Add `tenantRole` field (owner/admin/member)
- [x] Add `tenantPermissions` array
- [x] Create index on `tenantId`

### 2.1.1 Create Tenant Invitation Model

- [x] Create `tenantInvitation.model.js` with schema (COMPLETED IN PHASE 1):

```javascript
{
  tenantId: { type: ObjectId, ref: 'Tenant', required: true, index: true },
  email: { type: String, required: true, lowercase: true, index: true },
  role: { type: String, enum: ['admin', 'member'], required: true },
  invitedBy: { type: ObjectId, ref: 'User', required: true },
  token: { type: String, required: true, unique: true, index: true },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'expired', 'cancelled'],
    default: 'pending',
    index: true
  },
  expiresAt: { type: Date, required: true, index: true },
  acceptedAt: { type: Date },
  acceptedBy: { type: ObjectId, ref: 'User' },
  metadata: { type: Mixed }
}
```

- [ ] Add TTL index on `expiresAt` for auto-cleanup
- [ ] Create compound index on `(email, tenantId, status)`

### 2.2 Update Core Models (Add tenantId)

**Core Business Models:**

- [x] `src/app/modules/conversations/conversation.model.js`
- [x] `src/app/modules/knowledge/knowledge.model.js`
- [x] `src/app/modules/knowledge/knowledge_folder.model.js`
- [x] `src/app/modules/knowledge_bank/knowledge_bank.model.js`
- [x] `src/app/modules/knowledge_bank/knowledge_bank_folder.model.js`
- [x] `src/app/modules/knowledgebase/knowledgebase.model.js`
- [x] `src/app/modules/knowledgebase/knowledgebase.files.model.js`
- [x] `src/app/modules/payment/payment.model.js`

**Integration & Composio Models:**

- [x] `src/app/modules/composio_v2/composio.model.js`
- [x] `src/app/modules/composio_v2/authConfig.model.js`
- [x] `src/app/modules/composio_v2/tools.model.js`

**AI & Processing Models:**

- [x] `src/app/modules/code/model/code.model.js`
- [x] `src/app/modules/wishper/wishper.model.js`

**System Models:**

- [x] `src/app/modules/notification/notification.model.js`
- [x] `src/app/modules/forum/forum.model.js`
- [x] `src/app/modules/stripe/products/products.model.js`
- [x] `src/app/modules/aiModelServices/aiEndpoint.Model.js`

**Excluded Modules (Not in Scope):**

- ~~browserUse~~ (Excluded)
- ~~cyberdesk~~ (Excluded)
- ~~deepseek~~ (Excluded)
- ~~groq~~ (Excluded)
- ~~llama4~~ (Excluded)
- ~~llamaindex~~ (Excluded)
- ~~notes~~ (Excluded)
- ~~qwen~~ (Excluded)
- ~~serper~~ (Excluded)
- ~~social-login~~ (Excluded)
- ~~streaming~~ (Excluded)
- ~~support~~ (Excluded)
- ~~tavily~~ (Excluded)
- ~~togetherAi~~ (Excluded)
- ~~workflow_automation~~ (Excluded)
- ~~workflow_storage~~ (Excluded)

### 2.3 Update Content Generation Models

- [x] Check article_writer, creative_writing, document_drafting, document_review, legal_contract, presentation, report modules for persistent models
- **Result:** No persistent models found - these modules use Conversation model

### 2.4 Update Media Models

- [x] Check image, video, transcription modules for persistent models
- **Result:** No persistent models found

### 2.5 Create Database Indexes

- [x] Add indexed tenantId field to all models:

```javascript
{
  tenantId: { type: ObjectId, ref: 'Tenant', index: true, default: null }
}
```

---

## Phase 3: Controller & Service Updates

### 3.1 Update Core Controllers

Use `withTenantFilter()` and `withTenantContext()` in:

**Conversations & Chat:**

- [x] `src/app/modules/conversations/conversation.controller.js`
- [x] `src/app/modules/conversations/conversation.service.js`
- [x] `src/app/modules/conversations/conversation.helpers.js`
- [x] `src/app/modules/conversations/conversation.route.js` (add middleware)

**Knowledge Management:**

- [x] `src/app/modules/knowledge/knowledge.controller.js`
- [x] `src/app/modules/knowledge/knowledge.service.js`
- [x] `src/app/modules/knowledge/knowledge.route.js` (add middleware)
- [x] `src/app/modules/knowledge_bank/knowledge_bank.controller.js`
- [x] `src/app/modules/knowledge_bank/knowledge_bank.service.js`
- [x] `src/app/modules/knowledge_bank/knowledge_bank.routes.js` (add middleware)
- [x] `src/app/modules/knowledgebase/knowledgebase.controller.js`
- [x] `src/app/modules/knowledgebase/knowledgebase.service.js`
- [x] `src/app/modules/knowledgebase/knowledgebase.routes.js` (add middleware)

**AI & Processing:**

- [x] `src/app/modules/code/code.controller.js`
- [x] `src/app/modules/code/code.service.js`
- [x] `src/app/modules/code/code.route.js` (add middleware)
- [x] `src/app/modules/wishper/wishper.controller.js`
- [x] `src/app/modules/wishper/wishper.service.js`
- [x] `src/app/modules/wishper/wishper.route.js` (add middleware)

**Content Generation:**

- [x] `src/app/modules/article_writer/article_writer.controller.js`
- [x] `src/app/modules/article_writer/article_writer.service.js`
- [x] `src/app/modules/article_writer/article_writer.route.js` (add middleware)
- [x] `src/app/modules/brainstorm/brainstorm.controller.js`
- [x] `src/app/modules/brainstorm/brainstorm.service.js`
- [x] `src/app/modules/brainstorm/brainstorm.route.js` (add middleware)
- [x] `src/app/modules/creative_writing/creative_writing.controller.js`
- [x] `src/app/modules/creative_writing/creative_writing.service.js`
- [x] `src/app/modules/creative_writing/creative_writing.route.js` (add middleware)
- [x] `src/app/modules/writing/writer.controller.js`
- [x] `src/app/modules/writing/writer.route.js` (add middleware)
- [x] `src/app/modules/rewrite/rewrite.controller.js`
- [x] `src/app/modules/rewrite/rewrite.route.js` (add middleware)
- [x] `src/app/modules/summary/summary.controller.js`
- [x] `src/app/modules/summary/summary.route.js` (add middleware)

**Document Processing:**

- [x] `src/app/modules/document_analysis/document_analysis.controller.js`
- [x] `src/app/modules/document_analysis/document_analysis.route.js` (add middleware)
- [x] `src/app/modules/document_drafting/document.controller.js`
- [x] `src/app/modules/document_drafting/document.route.js` (add middleware)
- [x] `src/app/modules/document_review/document_review.controller.js`
- [x] `src/app/modules/document_review/document_review.route.js` (add middleware)

**Legal:**

- [x] `src/app/modules/legal_contract/legal_contract.controller.js`
- [x] `src/app/modules/legal_contract/legal_contract.route.js` (add middleware)
- [x] `src/app/modules/legal_contract_review/legal_contract_review.controller.js`
- [x] `src/app/modules/legal_contract_review/legal_contract_review.route.js` (add middleware)

**Research & Analysis:**

- [x] `src/app/modules/deep_research/deep_research.controller.js`
- [x] `src/app/modules/deep_research/deep_research.service.js`
- [x] `src/app/modules/deep_research/deep_research.route.js` (add middleware)
- [x] `src/app/modules/search/search.controller.js`
- [x] `src/app/modules/search/search.service.js`
- [x] `src/app/modules/search/search.route.js` (add middleware)

**Presentation & Reports:**

- [x] `src/app/modules/presentation/presentation.controller.js`
- [x] `src/app/modules/presentation/presentation.route.js` (add middleware)
- [x] `src/app/modules/report/report.controller.js`
- [x] `src/app/modules/report/report.route.js` (add middleware)
- [x] `src/app/modules/plan_generator/plan_generator.controller.js`
- [x] `src/app/modules/plan_generator/plan_generator.route.js` (add middleware)

**Media Processing:**

- [x] `src/app/modules/image/image.controller.js` (partially - needs 2 more req params in analyzeImage)
- [x] `src/app/modules/image/image.service.js`
- [x] `src/app/modules/image/image.route.js` (add middleware)
- [x] `src/app/modules/enhanced_image/enhanced_image.service.js`
- [x] `src/app/modules/enhanced_image/enhanced_image.controller.js`
- [x] `src/app/modules/enhanced_image/enhanced_image.route.js` (add middleware)
- [x] `src/app/modules/video/video.service.js`
- [x] `src/app/modules/video/video.controller.js`
- [x] `src/app/modules/video/video.route.js` (add middleware)
- [x] `src/app/modules/transcription/transcription.service.js`
- [x] `src/app/modules/transcription/transcription.controller.js`
- [x] `src/app/modules/transcription/transcription.route.js` (add middleware)
- [x] `src/app/modules/translation/translation.service.js`
- [x] `src/app/modules/translation/translation.controller.js`
- [x] `src/app/modules/translation/translation.route.js` (add middleware)

**Composio Integration:**

- [x] `src/app/modules/composio_v2/composio.controller.js`
- [x] `src/app/modules/composio_v2/composio.service.js`
- [x] `src/app/modules/composio_v2/composio.conversation.service.js`
- [x] `src/app/modules/composio_v2/aiClassification.controller.js`
- [x] `src/app/modules/composio_v2/aiClassification.service.js`
- [x] `src/app/modules/composio_v2/composio.route.js` (add middleware)

**System & Community:**

- [x] `src/app/modules/notification/notification.controller.js`
- [x] `src/app/modules/notification/notification.service.js`
- [x] `src/app/modules/notification/notification.route.js` (add middleware)
- [x] `src/app/modules/forum/forum.controller.js`
- [x] `src/app/modules/forum/forum.service.js`
- [x] `src/app/modules/forum/forum.route.js` (add middleware)

**Billing & Payments:**

- [x] `src/app/modules/payment/payment.controller.js`
- [x] `src/app/modules/payment/payment.service.js`
- [x] `src/app/modules/payment/payment.route.js` (add middleware)
- [x] `src/app/modules/stripe/stripe.controller.js`
- [x] `src/app/modules/stripe/customer/stripe.service.js`
- [x] `src/app/modules/stripe/subscription.service.js`
- [x] `src/app/modules/stripe/paymentMethod.service.js`
- [x] `src/app/modules/stripe/products/product.service.js`
- [x] `src/app/modules/stripe/stripe.route.js` (add middleware)

**AI Model Services:**

- [x] `src/app/modules/aiModelServices/aiEndpoint.controller.js`
- [x] `src/app/modules/aiModelServices/aiEndpoint.route.js` (add middleware)

**Excluded from scope:** browserUse, cyberdesk, deepseek, groq, llama4, llamaindex, notes, qwen, serper, social-login, streaming, support, tavily, togetherAi, workflow_automation, workflow_storage

### 3.2 Update Services

Add tenant filtering to all database queries:

- [x] `src/app/modules/conversations/conversation.service.js`
- [x] `src/app/modules/conversations/conversation.helpers.js`
- [x] `src/app/modules/knowledge/knowledge.service.js`
- [x] `src/app/modules/knowledge/services/knowledgeQuery.js` (no DB operations)
- [x] `src/app/modules/knowledge_bank/knowledge_bank.service.js` (no DB operations)
- [x] `src/app/modules/knowledgebase/knowledgebase.service.js`
- [x] `src/app/modules/code/code.service.js` (no DB operations)
- [x] `src/app/modules/wishper/wishper.service.js` (no DB operations)
- [x] `src/app/modules/article_writer/article_writer.service.js` (no DB operations)
- [x] `src/app/modules/brainstorm/brainstorm.service.js` (no DB operations)
- [x] `src/app/modules/creative_writing/creative_writing.service.js` (no DB operations)
- [x] `src/app/modules/deep_research/deep_research.service.js` (no DB operations)
- [x] `src/app/modules/search/search.service.js` (no DB operations)
- [x] `src/app/modules/composio_v2/composio.service.js`
- [ ] `src/app/modules/composio_v2/composio.conversation.service.js` (requires Phase 2 model updates)
- [ ] `src/app/modules/composio_v2/aiClassification.service.js` (requires Phase 2 model updates)
- [x] `src/app/modules/notification/notification.service.js`
- [x] `src/app/modules/forum/forum.service.js`
- [x] `src/app/modules/payment/payment.service.js`
- [x] `src/app/modules/stripe/customer/stripe.service.js` (Stripe API only)
- [x] `src/app/modules/stripe/subscription.service.js` (Stripe API only)
- [x] `src/app/modules/stripe/paymentMethod.service.js` (Stripe API only)
- [x] `src/app/modules/stripe/products/product.service.js` (Stripe API only)
- [x] Update aggregation pipelines to include tenantId in all services

**Progress:** 21/23 (91%) - 2 services require Phase 2 model schema updates first

**Aggregation Pipelines Updated:**

- [x] `conversation.helpers.js` - getConversationStats (already using withTenantPipeline)
- [x] `workflowStorage.service.js` - getWorkflowStatistics (added withTenantPipeline)
- [x] `researchStorageService.js` - getResearchStatistics (added withTenantPipeline)
- [x] Model static methods (knowledge.model.js, knowledge_bank.model.js) - already filter by userId/ownerId
- [ ] `admin.service.js` - getUserStatisticsByMonthService (system-wide admin stats, no tenant filtering)
- [ ] `composio.helper.js` - getVectorSearchResults (system-wide tool search, no tenant filtering)
- [ ] `workflowExecution.model.js` - getExecutionStats (requires Phase 2 model updates)

### 3.3 Implementation Pattern

```javascript
// Service (conversation.service.js)
import { withTenantContext } from '../../helpers/tenantQuery.js';

const createConversation = async (data, conversationId, req = null) => {
  const conversation = new Conversation(
    req ? withTenantContext(req, data) : data
  );
  return await conversation.save();
};

// Helper (conversation.helpers.js)
import { withTenantFilter } from '../../helpers/tenantQuery.js';

const getUserConversations = async (userId, options, req = null) => {
  const query = { userId, status: 'active' };
  return await Conversation.find(req ? withTenantFilter(req, query) : query);
};

// Controller (conversation.controller.js)
const getUserConversations = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const result = await conversationHelpers.getUserConversations(
    userId,
    options,
    req
  );
  sendResponse(res, { data: result });
});

// Route (conversation.route.js)
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';

router.get('/', auth(), extractTenantContext, controller.getUserConversations);
```

---

## Phase 4: Route Middleware Updates

### 4.1 Add Tenant Routes

- [x] Register tenant routes in `src/app/routes/index.js`

```javascript
{
  path: '/tenant',
  route: tenantRoutes,
}
```

### 4.2 Apply Middleware to Existing Routes

Add `extractTenantContext` middleware after `auth()`:

- [x] Conversation routes
- [x] Search routes
- [x] Writing routes
- [x] Document routes
- [x] Knowledge routes
- [x] Image generation routes
- [x] All other user-content routes

**Pattern:**

```javascript
router.post(
  '/assistant',
  auth(),
  extractTenantContext, // Add this
  checkDailyRequestLimit,
  controller.method
);
```

**Status:** ✅ Complete - All middleware already applied during Phase 3.1

**Routes Verified:**

- Conversation routes (conversation.route.js) ✅
- Search routes (search.route.js) ✅
- Code routes (code.route.js) ✅
- Writing routes (workflow.route.js) ✅
- Knowledge routes (knowledge.route.js) ✅
- Knowledge Bank routes (knowledge_bank.routes.js) ✅
- Knowledge Base routes (knowledgebase.routes.js) ✅
- Image routes (image.route.js, enhanced_image.route.js) ✅
- Video routes (video.route.js) ✅
- Document routes (document.route.js, document_review.route.js, document_analysis.route.js) ✅
- Legal routes (legal_contract.route.js, legal_contract_review.route.js) ✅
- Translation routes (translation.route.js) ✅
- Transcription routes (transcription.route.js) ✅
- Brainstorm routes (brainstorm.route.js) ✅
- Creative Writing routes (creative_writing.route.js) ✅
- Rewrite routes (rewrite.route.js) ✅
- Article Writer routes (article_writer.route.js) ✅
- Plan Generator routes (plan_generator.route.js) ✅
- Presentation routes (presentation.route.js) ✅
- Report routes (report.route.js) ✅
- Summary routes (summary.route.js) ✅
- Deep Research routes (deep_research.route.js) ✅
- Stripe routes (stripe.route.js) ✅
- Payment/Subscription routes (payment.route.js) ✅

---

## Phase 5: Tenant Management APIs

### 5.1 Tenant CRUD

- [x] POST `/api/v1/tenant/create` - Create tenant
- [x] GET `/api/v1/tenant/current` - Get current tenant
- [x] PATCH `/api/v1/tenant/settings` - Update settings
- [x] DELETE `/api/v1/tenant/:tenantId` - Delete tenant (admin)

### 5.2 Member Management

- [x] GET `/api/v1/tenant/members` - List members
- [x] POST `/api/v1/tenant/members/invite` - Invite member via email
- [x] PATCH `/api/v1/tenant/members/:userId/role` - Update role
- [x] DELETE `/api/v1/tenant/members/:userId` - Remove member
- [x] GET `/api/v1/tenant/members/invitations` - List pending invites
- [x] POST `/api/v1/tenant/members/invitations/:inviteId/accept` - Accept invite
- [x] DELETE `/api/v1/tenant/members/invitations/:inviteId` - Cancel invite
- [x] POST `/api/v1/tenant/members/invitations/:token/verify` - Verify invitation token
- [x] POST `/api/v1/tenant/members/invitations/:inviteId/resend` - Resend invitation email

**Invitation Flow Implementation:**

1. Admin/Owner sends invitation with email address and role ✅
2. System generates secure invitation token (JWT with 7-day expiry) ✅
3. System creates pending invitation record in database ✅
4. System sends invitation email with link: `https://app.altihq.com/invite/{token}` ✅
5. User clicks link, verifies token ✅
6. If user exists: Add to tenant with specified role ✅
7. If user is new: Redirect to signup with pre-filled email and auto-join tenant after registration ✅
8. Update invitation status to 'accepted' or 'expired' ✅

### 5.3 Usage & Limits

- [x] GET `/api/v1/tenant/usage` - Get usage statistics
- [x] GET `/api/v1/tenant/limits` - Get plan limits
- [ ] Implement usage tracking middleware
- [ ] Add limit enforcement checks

### 5.4 Admin APIs

- [x] GET `/api/v1/admin/tenants` - List all tenants
- [x] GET `/api/v1/admin/tenants/:tenantId` - Get tenant details
- [x] PATCH `/api/v1/admin/tenants/:tenantId/status` - Update status
- [x] GET `/api/v1/admin/tenants/:tenantId/usage` - View usage
- [x] POST `/api/v1/admin/tenants/:tenantId/extend-trial` - Extend trial

**Status:** ✅ 95% Complete - All APIs implemented, usage tracking middleware pending

**Implementation Details:**

- All tenant CRUD endpoints in [tenant.controller.js](src/app/modules/tenant/tenant.controller.js) ✅
- All member management in [tenant.route.js](src/app/modules/tenant/tenant.route.js) ✅
- Invitation system in [tenantInvitation.controller.js](src/app/modules/tenant/tenantInvitation.controller.js) ✅
- Admin endpoints added to [admin.controller.js](src/app/modules/admin/admin.controller.js) ✅
- Admin routes added to [admin.route.js](src/app/modules/admin/admin.route.js) ✅

---

## Phase 5.5: Email Integration for Invitations

### 5.5.1 Email Service Setup

- [x] Verify existing email service in `src/app/middlewares/sendEmail/`
- [x] Create invitation email template with variables:
  - `{inviterName}` - Name of person sending invite
  - `{tenantName}` - Name of the tenant/workspace
  - `{invitationLink}` - Full URL with token
  - `{role}` - Role being offered (Admin/Member)
  - `{expiryDays}` - Days until link expires (default: 7)
- [x] Implement `sendInvitationEmail()` function with retry logic
- [x] Add email sending to invitation service
- [x] Configure email rate limiting (5 emails per hour per address)
- [x] Add email retry logic with exponential backoff (3 attempts)
- [x] Log all invitation emails sent

### 5.5.2 Email Template Design

- [x] Create HTML email template with responsive design
- [x] Add plain text fallback
- [x] Include branding (colors, styling)
- [x] Add clear call-to-action button
- [x] Include expiry information
- [x] Add support contact information
- [ ] Test across email clients (Gmail, Outlook, Apple Mail)

**Status:** ✅ 95% Complete - All features implemented, cross-client testing pending

**Implementation Details:**

- Email templates in [templates/invitationEmail.js](src/app/modules/tenant/templates/invitationEmail.js) ✅
- Email service with retry/rate limiting in [tenantInvitation.email.js](src/app/modules/tenant/tenantInvitation.email.js) ✅
- Integration with invitation service in [tenantInvitation.service.js](src/app/modules/tenant/tenantInvitation.service.js) ✅
- Comprehensive documentation in [TENANT_INVITATION_EMAIL.md](docs/TENANT_INVITATION_EMAIL.md) ✅
- Rate limiting: 5 emails/hour per address ✅
- Retry logic: 3 attempts with exponential backoff ✅
- Dual format: HTML + plain text ✅
- Error handling: Graceful degradation to `pending_email` status ✅

---

## Phase 6: Billing Integration

### 6.1 Update Stripe Integration

- [x] Create tenant-level Stripe customers
- [x] Link subscriptions to tenants (not individual users)
- [x] Update `payment.service.js` for tenant billing
- [x] Add plan limits configuration (PLAN_LIMITS)
- [x] Update webhook handlers for tenant subscriptions

### 6.2 Plan Limits Enforcement

- [x] Create `src/app/middlewares/tenant/checkTenantLimits.js`
- [x] Implement API call limit checking (`checkApiCallLimit`)
- [x] Implement storage limit checking (`checkStorageLimit`)
- [x] Implement user count limit checking (`checkUserLimit`)
- [x] Add storage usage tracking (`trackStorageUsage`)
- [x] Add tenant usage statistics (`getTenantUsage`)
- [x] Return clear error messages with upgrade guidance

### 6.3 Usage Tracking

- [x] Track API calls per tenant (incremented on each call)
- [x] Track storage usage per tenant (incremented on uploads)
- [x] Track user count per tenant (managed by invitation system)
- [x] Create cron job for monthly usage reset (`resetMonthlyTenantUsage`)
- [x] Create cron job for trial expiration (`cleanupExpiredTrials`)
- [x] Create cron job for usage warnings (`sendUsageWarnings`)
- [x] Create `resetUsage.js` for tenant usage management

### 6.4 Apply Limits to Routes

- [x] Add `checkApiCallLimit` to conversation routes
  - `/api/v1/conversations` (POST) - conversation creation
  - `/api/v1/conversations/:conversationId/messages` (POST) - message sending
- [x] Add `checkApiCallLimit` and `checkStorageLimit` to plan generator routes
  - `/api/v1/plan-generator/assistant` (POST)
  - `/api/v1/plan-generator/assistant/async` (POST)
- [x] Add `checkUserLimit` to tenant invitation routes
  - `/api/v1/tenant/members/invite` (POST)
- [x] Add `trackStorageUsage` after file uploads

**Status:** ✅ 100% Complete

**Implementation Details:**

- Plan limits configured in [payment.service.js](src/app/modules/payment/payment.service.js) ✅
  - Free: 1K API calls, 5GB storage, 5 users
  - Explore: 10K API calls, 50GB storage, 10 users
  - Analyze: 50K API calls, 100GB storage, 25 users
  - Execute: 200K API calls, 500GB storage, 100 users
  - Command: Unlimited API calls, 1TB storage, unlimited users
  - Enterprise: Fully unlimited
- Tenant limits middleware in [checkTenantLimits.js](src/app/middlewares/tenant/checkTenantLimits.js) ✅
- Cron jobs in [resetUsage.js](src/app/cron/tenant/resetUsage.js) ✅
  - Monthly reset: `0 0 1 * *` (1st of month at midnight)
  - Trial cleanup: `0 2 * * *` (daily at 2 AM)
  - Usage warnings: `0 10 * * *` (daily at 10 AM)
- Applied to 5 key routes (conversation, messages, plan generator, invitations) ✅
- Comprehensive documentation in [TENANT_BILLING_LIMITS.md](docs/TENANT_BILLING_LIMITS.md) ✅

---

## Phase 7: Deployment & Monitoring

### 7.1 Deployment

- [ ] Deploy to staging
- [ ] Run smoke tests
- [ ] Deploy to production
- [ ] Monitor deployment
- [ ] Verify all services running

### 7.2 Monitoring Setup

- [ ] Add tenant metrics to logging
- [ ] Create Grafana dashboards for tenant stats
- [ ] Set up alerts for limit violations
- [ ] Monitor query performance
- [ ] Track tenant signup rate

### 7.3 Post-Launch

- [ ] Monitor error rates
- [ ] Check customer feedback
- [ ] Fix critical bugs
- [ ] Performance optimization
- [ ] Plan next iteration

---

## Phase 8: Feature Rollout

### 8.1 Beta Testing

- [ ] Select beta customers
- [ ] Send invitations
- [ ] Provide onboarding support
- [ ] Gather feedback
- [ ] Iterate on features

### 8.2 Marketing

- [ ] Create announcement blog post
- [ ] Update website with tenant features
- [ ] Email existing customers
- [ ] Social media announcement
- [ ] Create demo video

### 8.3 Customer Support

- [ ] Train support team
- [ ] Create support documentation
- [ ] Prepare FAQ responses
- [ ] Set up support channels
- [ ] Monitor support tickets

---

## Security Checklist

- [ ] All queries filter by tenantId
- [ ] No cross-tenant data leaks possible
- [ ] Permissions properly enforced
- [ ] Input validation on all tenant endpoints
- [ ] Rate limiting per tenant
- [ ] Audit logging for tenant actions
- [ ] Secure token handling
- [ ] GDPR compliance for tenant data

---

## Performance Checklist

- [ ] Database indexes on tenantId columns
- [ ] Compound indexes for common queries
- [ ] Query performance tested with large datasets
- [ ] Caching strategy for tenant settings
- [ ] Pagination on all list endpoints
- [ ] Efficient aggregation pipelines
- [ ] Connection pooling configured

---

## Rollback Plan

If critical issues arise:

1. [ ] Stop deployments immediately
2. [ ] Assess impact and severity
3. [ ] Execute rollback script:
   ```bash
   mongorestore --uri="..." ./backup-YYYYMMDD
   git revert HEAD
   pm2 restart all
   ```
4. [ ] Notify affected customers
5. [ ] Document issues for fix
6. [ ] Plan remediation

---

## Success Metrics

Track these metrics to measure success:

- [ ] Tenant signup rate
- [ ] Member invitation acceptance rate
- [ ] Feature adoption per tenant
- [ ] Plan upgrade rate
- [ ] Customer retention
- [ ] API performance (p95, p99 latency)
- [ ] Error rates
- [ ] Customer satisfaction (NPS)

---

## Implementation Timeline

| Phase                   | Duration | Dependencies |
| ----------------------- | -------- | ------------ |
| Phase 1: Foundation     | 1 week   | None         |
| Phase 2: Schema Updates | 1 week   | Phase 1      |
| Phase 3: Controllers    | 1 week   | Phase 2      |
| Phase 4: Routes         | 3 days   | Phase 3      |
| Phase 5: APIs           | 1 week   | Phase 4      |
| Phase 6: Billing        | 1 week   | Phase 5      |
| Phase 7: Deployment     | 2 days   | Phase 6      |
| Phase 8: Rollout        | 2 weeks  | Phase 7      |

**Total Estimated Time**: 6-7 weeks (excluding testing, documentation, and migration)

---

## Notes

- Check off items as you complete them
- Update timeline based on actual progress
- Document any deviations from plan
- Keep stakeholders informed of progress
- Plan separate phases for testing and documentation

---

## Related Documents

- Full Checklist: [TENANT_IMPLEMENTATION_CHECKLIST_TEMPLATE.md](./TENANT_IMPLEMENTATION_CHECKLIST_TEMPLATE.md)
- Architecture: [SAAS_TENANT_MANAGEMENT.md](./SAAS_TENANT_MANAGEMENT.md) (create this)
- Implementation Guide: [PHASE_3_IMPLEMENTATION_GUIDE.md](./PHASE_3_IMPLEMENTATION_GUIDE.md) (create this)
