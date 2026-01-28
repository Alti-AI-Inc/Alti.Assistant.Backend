# SaaS Tenant Management - Implementation Checklist

This checklist provides a step-by-step guide for implementing multi-tenant functionality in ASON AI Core Service.

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
- [ ] Create directory: `src/app/modules/tenant/`
- [ ] Create `tenant.model.js` with schema
- [ ] Create `tenantInvitation.model.js` with invitation schema
- [ ] Create `tenant.controller.js`
- [ ] Create `tenant.service.js`
- [ ] Create `tenantInvitation.service.js` for invitation logic
- [ ] Create `tenant.route.js`
- [ ] Create `tenant.validation.js`
- [ ] Create `README.md` for tenant module
- [ ] Create email template: `src/app/templates/emails/tenantInvitation.html`
- [ ] Add tests: `test/tenant.test.js`
- [ ] Add tests: `test/tenantInvitation.test.js`

### 1.2 Create Middleware
- [ ] Create `src/app/middlewares/tenant/tenantContext.js`
- [ ] Implement `extractTenantContext()` function
- [ ] Implement `requireTenant()` middleware
- [ ] Implement `checkTenantPermission()` middleware
- [ ] Implement `checkTenantLimits()` middleware
- [ ] Implement `incrementTenantUsage()` middleware
- [ ] Implement `validateInvitationToken()` middleware for invitation links
- [ ] Add tests for middleware

### 1.3 Create Helper Utilities
- [ ] Create `src/app/helpers/tenantQuery.js`
- [ ] Implement `withTenantFilter()` helper
- [ ] Implement `withTenantContext()` helper
- [ ] Implement `withTenantPipeline()` helper
- [ ] Implement `validateTenantOwnership()` helper
- [ ] Implement `batchWithTenantContext()` helper
- [ ] Add JSDoc documentation

### 1.4 Register Routes
- [ ] Import tenant routes in `src/app/routes/index.js`
- [ ] Register `/tenant` path

---

## Phase 2: Database Schema Updates

### 2.1 Update User Model
- [ ] Add `tenantId` field to User schema
- [ ] Add `tenantRole` field (owner/admin/member)
- [ ] Add `tenantPermissions` array
- [ ] Create index on `tenantId`
- [ ] Update existing user-related tests

### 2.1.1 Create Tenant Invitation Model
- [ ] Create `tenantInvitation.model.js` with schema:
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
- [ ] `src/app/modules/conversations/conversation.model.js`
- [ ] `src/app/modules/knowledge/knowledge.model.js`
- [ ] `src/app/modules/knowledge/knowledge_folder.model.js`
- [ ] `src/app/modules/knowledge_bank/knowledge_bank.model.js`
- [ ] `src/app/modules/knowledge_bank/knowledge_bank_folder.model.js`
- [ ] `src/app/modules/knowledgebase/knowledgebase.model.js`
- [ ] `src/app/modules/knowledgebase/knowledgebase.files.model.js`
- [ ] `src/app/modules/payment/payment.model.js`

**Integration & Composio Models:**
- [ ] `src/app/modules/composio_v2/composio.model.js`
- [ ] `src/app/modules/composio_v2/authConfig.model.js`
- [ ] `src/app/modules/composio_v2/tools.model.js`

**AI & Processing Models:**
- [ ] `src/app/modules/code/model/code.model.js`
- [ ] `src/app/modules/groq/groq.model.js`
- [ ] `src/app/modules/wishper/wishper.model.js`

**System Models:**
- [ ] `src/app/modules/notification/notification.model.js`
- [ ] `src/app/modules/forum/forum.model.js`
- [ ] `src/app/modules/stripe/products/products.model.js`
- [ ] `src/app/modules/aiModelServices/aiEndpoint.Model.js`

**Excluded Modules (Not in Scope):**
- ~~browserUse~~ (Excluded)
- ~~cyberdesk~~ (Excluded)
- ~~deepseek~~ (Excluded)
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
- [ ] Check article_writer, creative_writing, document_drafting, document_review, legal_contract, presentation, report modules for persistent models

### 2.4 Update Media Models
- [ ] Check image, video, transcription modules for persistent models

### 2.5 Create Database Indexes
- [ ] Add indexed tenantId field to all models:
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
- [ ] `src/app/modules/conversations/conversation.controller.js`
- [ ] `src/app/modules/conversations/conversation.service.js`
- [ ] `src/app/modules/conversations/conversation.helpers.js`
- [ ] `src/app/modules/conversations/conversation.route.js` (middleware)

**Knowledge Management:**
- [ ] `src/app/modules/knowledge/knowledge.controller.js`
- [ ] `src/app/modules/knowledge/knowledge.service.js`
- [ ] `src/app/modules/knowledge/knowledge.route.js` (middleware)
- [ ] `src/app/modules/knowledge_bank/knowledge_bank.controller.js`
- [ ] `src/app/modules/knowledge_bank/knowledge_bank.service.js`
- [ ] `src/app/modules/knowledgebase/knowledgebase.controller.js`
- [ ] `src/app/modules/knowledgebase/knowledgebase.service.js`

**Core Services:**
- [ ] `src/app/modules/code/code.controller.js`
- [ ] `src/app/modules/notification/notification.controller.js`
- [ ] `src/app/modules/groq/groq.controller.js`
- [ ] `src/app/modules/wishper/wishper.controller.js`

**Excluded from scope:** browserUse, cyberdesk, deepseek, llama4, llamaindex, notes, qwen, serper, social-login, streaming, support, tavily, togetherAi, workflow_automation, workflow_storage

### 3.2 Update Services
- [ ] `src/app/modules/conversations/conversation.service.js`
- [ ] `src/app/modules/conversations/conversation.helpers.js`
- [ ] `src/app/modules/knowledge/services/knowledgeQuery.js`
- [ ] `src/app/modules/knowledge/knowledge.service.js`
- [ ] Add tenant filtering to all database queries in remaining services
- [ ] Update aggregation pipelines to include tenantId

### 3.3 Pattern to Apply
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
  return await Conversation.find(
    req ? withTenantFilter(req, query) : query
  );
};

// Controller (conversation.controller.js)
const getUserConversations = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const result = await conversationHelpers.getUserConversations(userId, options, req);
  sendResponse(res, { data: result });
});

// Route (conversation.route.js)
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';

router.get('/', auth(), extractTenantContext, controller.getUserConversations);
```

**See**: [PHASE_3_IMPLEMENTATION_GUIDE.md](./PHASE_3_IMPLEMENTATION_GUIDE.md) for detailed patterns and examples.

---

## Phase 4: Route Middleware Updates

### 4.1 Add Tenant Routes
- [ ] Register tenant routes in `src/app/routes/index.js`
```javascript
{
  path: '/tenant',
  route: tenantRoutes,
}
```

### 4.2 Apply Middleware to Existing Routes
Add `extractTenantContext` middleware after `auth()`:
- [ ] Conversation routes
- [ ] Search routes
- [ ] Writing routes  
- [ ] Document routes
- [ ] Knowledge routes
- [ ] Image generation routes
- [ ] Workflow routes
- [ ] All other user-content routes

Pattern:
```javascript
router.post(
  '/assistant',
  auth(),
  extractTenantContext,  // Add this
  checkDailyRequestLimit,
  controller.method
);
```

---

## Phase 5: Tenant Management APIs

### 5.1 Tenant CRUD
- [ ] POST `/api/v1/tenant/create` - Create tenant
- [ ] GET `/api/v1/tenant/current` - Get current tenant
- [ ] PATCH `/api/v1/tenant/settings` - Update settings
- [ ] DELETE `/api/v1/tenant/:tenantId` - Delete tenant (admin)

### 5.2 Member Management
- [ ] GET `/api/v1/tenant/members` - List members
- [ ] POST `/api/v1/tenant/members/invite` - Invite member via email
- [ ] PATCH `/api/v1/tenant/members/:userId/role` - Update role
- [ ] DELETE `/api/v1/tenant/members/:userId` - Remove member
- [ ] GET `/api/v1/tenant/members/invitations` - List pending invites
- [ ] POST `/api/v1/tenant/members/invitations/:inviteId/accept` - Accept invite
- [ ] DELETE `/api/v1/tenant/members/invitations/:inviteId` - Cancel invite
- [ ] POST `/api/v1/tenant/members/invitations/:token/verify` - Verify invitation token
- [ ] POST `/api/v1/tenant/members/invitations/:token/resend` - Resend invitation email

**Invitation Flow Implementation:**
1. Admin/Owner sends invitation with email address and role
2. System generates secure invitation token (JWT with 7-day expiry)
3. System creates pending invitation record in database
4. System sends invitation email with link: `https://app.asonai.com/invite/{token}`
5. User clicks link, verifies token
6. If user exists: Add to tenant with specified role
7. If user is new: Redirect to signup with pre-filled email and auto-join tenant after registration
8. Update invitation status to 'accepted' or 'expired'

### 5.3 Usage & Limits
- [ ] GET `/api/v1/tenant/usage` - Get usage statistics
- [ ] GET `/api/v1/tenant/limits` - Get plan limits
- [ ] Implement usage tracking middleware
- [ ] Add limit enforcement checks

### 5.4 Admin APIs
- [ ] GET `/api/v1/admin/tenants` - List all tenants
- [ ] GET `/api/v1/admin/tenants/:tenantId` - Get tenant details
- [ ] PATCH `/api/v1/admin/tenants/:tenantId/status` - Update status
- [ ] GET `/api/v1/admin/tenants/:tenantId/usage` - View usage
- [ ] POST `/api/v1/admin/tenants/:tenantId/extend-trial` - Extend trial

---

## Phase 5.5: Email Integration for Invitations

### 5.5.1 Email Service Setup
- [ ] Verify existing email service in `src/app/middlewares/sendEmail/`
- [ ] Create invitation email template with variables:
  - `{inviterName}` - Name of person sending invite
  - `{tenantName}` - Name of the tenant/workspace
  - `{invitationLink}` - Full URL with token
  - `{role}` - Role being offered (Admin/Member)
  - `{expiryDays}` - Days until link expires (default: 7)
- [ ] Implement `sendInvitationEmail()` function
- [ ] Add email sending to invitation service
- [ ] Test email delivery in staging
- [ ] Configure email rate limiting (prevent spam)
- [ ] Add email retry logic for failed sends
- [ ] Log all invitation emails sent

### 5.5.2 Email Template Design
- [ ] Create HTML email template
- [ ] Add plain text fallback
- [ ] Include branding (logo, colors)
- [ ] Add clear call-to-action button
- [ ] Include expiry information
- [ ] Add support contact information
- [ ] Test across email clients (Gmail, Outlook, Apple Mail)

---

## Phase 6: Billing Integration

### 6.1 Update Stripe Integration
- [ ] Create tenant-level Stripe customers
- [ ] Link subscriptions to tenants (not individual users)
- [ ] Update `payment.service.js` for tenant billing
- [ ] Update `stripe.service.js` for tenant context

### 6.2 Plan Limits Enforcement
- [ ] Create `src/app/middlewares/tenant/checkTenantLimits.js`
- [ ] Check API call limits
- [ ] Check storage limits
- [ ] Check user count limits
- [ ] Return clear error messages

### 6.3 Usage Tracking
- [ ] Track API calls per tenant
- [ ] Track storage usage per tenant
- [ ] Track user count per tenant
- [ ] Create cron job for usage reset
- [ ] Update `resetUsage.js` for tenant usage

---

## Phase 7: Migration

### 7.1 Create Migration Script
- [ ] Create `scripts/migrate-to-multi-tenant.js`
- [ ] Create default tenant
- [ ] Assign all users to default tenant
- [ ] Set tenant owner
- [ ] Update all collections with tenantId
- [ ] Add rollback functionality

### 7.2 Test Migration
- [ ] Test on local dev environment
- [ ] Test on staging with production copy
- [ ] Verify data integrity
- [ ] Test queries performance
- [ ] Test all major features

### 7.3 Production Migration
- [ ] Backup production database
- [ ] Schedule maintenance window
- [ ] Run migration script
- [ ] Verify migration success
- [ ] Monitor for errors
- [ ] Have rollback plan ready

---

## Phase 8: Testing

### 8.1 Unit Tests
- [ ] Tenant model tests
- [ ] Tenant service tests
- [ ] Middleware tests
- [ ] Helper function tests
- [ ] Validation tests

### 8.2 Integration Tests
- [ ] Tenant creation flow
- [ ] Member invitation flow:
  - [ ] Test invitation email sending
  - [ ] Test token generation and validation
  - [ ] Test invitation acceptance for existing users
  - [ ] Test invitation acceptance with new user signup
  - [ ] Test invitation expiry (7 days)
  - [ ] Test duplicate invitation prevention
  - [ ] Test invitation cancellation
  - [ ] Test resend invitation functionality
  - [ ] Test invalid token handling
- [ ] Data isolation tests
- [ ] Permission enforcement tests
- [ ] Billing integration tests

### 8.3 E2E Tests
- [ ] Complete tenant signup flow
- [ ] Multi-user collaboration
- [ ] Subdomain routing
- [ ] Plan upgrade/downgrade
- [ ] Member management

### 8.4 Performance Tests
- [ ] Query performance with tenantId filters
- [ ] Multi-tenant load testing
- [ ] Database index effectiveness
- [ ] API response times

---

## Phase 9: Documentation

### 9.1 API Documentation
- [ ] Update Postman collections
- [ ] Create "Tenant Management" collection
- [ ] Document all new endpoints
- [ ] Add example requests/responses
- [ ] Publish to Postman documentation

### 9.2 Developer Documentation
- [ ] Update README.md with multi-tenant info
- [ ] Create TENANT_SETUP_GUIDE.md
- [ ] Document query patterns
- [ ] Document middleware usage
- [ ] Add code examples

### 9.3 User Documentation
- [ ] Create tenant onboarding guide
- [ ] Document member invitation process:
  - [ ] How to invite team members via email
  - [ ] How to accept an invitation
  - [ ] What to do if invitation link expired
  - [ ] How to resend invitations
  - [ ] Understanding roles (Owner/Admin/Member)
  - [ ] Invitation troubleshooting guide
- [ ] Explain plan limits
- [ ] Create FAQ:
  - [ ] "How do I invite my team?"
  - [ ] "What happens if someone hasn't signed up yet?"
  - [ ] "Can I change someone's role after they join?"
  - [ ] "How long do invitation links last?"
- [ ] Video tutorials (optional)

---

## Phase 10: Deployment & Monitoring

### 10.1 Deployment
- [ ] Deploy to staging
- [ ] Run smoke tests
- [ ] Deploy to production
- [ ] Monitor deployment
- [ ] Verify all services running

### 10.2 Monitoring Setup
- [ ] Add tenant metrics to logging
- [ ] Create Grafana dashboards for tenant stats
- [ ] Set up alerts for limit violations
- [ ] Monitor query performance
- [ ] Track tenant signup rate

### 10.3 Post-Launch
- [ ] Monitor error rates
- [ ] Check customer feedback
- [ ] Fix critical bugs
- [ ] Performance optimization
- [ ] Plan next iteration

---

## Phase 11: Feature Rollout

### 11.1 Beta Testing
- [ ] Select beta customers
- [ ] Send invitations
- [ ] Provide onboarding support
- [ ] Gather feedback
- [ ] Iterate on features

### 11.2 Marketing
- [ ] Create announcement blog post
- [ ] Update website with tenant features
- [ ] Email existing customers
- [ ] Social media announcement
- [ ] Create demo video

### 11.3 Customer Support
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

## Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Foundation | 1 week | None |
| Phase 2: Schema Updates | 1 week | Phase 1 |
| Phase 3: Controllers | 1 week | Phase 2 |
| Phase 4: Routes | 3 days | Phase 3 |
| Phase 5: APIs | 1 week | Phase 4 |
| Phase 6: Billing | 1 week | Phase 5 |
| Phase 7: Migration | 3 days | Phase 2-6 |
| Phase 8: Testing | 1 week | Phase 7 |
| Phase 9: Documentation | 3 days | Phase 8 |
| Phase 10: Deployment | 2 days | Phase 9 |
| Phase 11: Rollout | 2 weeks | Phase 10 |

**Total Estimated Time**: 8-10 weeks

---

## Notes

- Check off items as you complete them
- Update timeline based on actual progress
- Document any deviations from plan
- Keep stakeholders informed of progress
- Don't skip testing phases!

---

## Resources

- Main Documentation: [SAAS_TENANT_MANAGEMENT.md](./SAAS_TENANT_MANAGEMENT.md)
- Migration Scripts: `/scripts/migrate-to-multi-tenant.js`
- Test Files: `/test/tenant*.test.js`
- Postman Collection: `/postman_collections/Tenant_Management_API.postman_collection.json`
