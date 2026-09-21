import httpStatus from 'http-status';
import mongoose from 'mongoose';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { logger } from '../../../shared/logger.js';
import { PLANS, getPromptLimit } from '../subscription/plans.config.js';
import { tenantService } from '../tenant/tenant.service.js';
import { tenantInvitationService } from '../tenant/tenantInvitation.service.js';
import { sendMailWithMailGun } from '../../middlewares/sendEmail/sendMail.js';

// ── Invite Member with Plan ──────────────────────────────────────────────────

/**
 * Invite a new member and assign them a plan paid by the account owner.
 * Creates a subscription with sponsoredBy set to the inviting user.
 *
 * POST /api/v1/auth/team/invite
 * Body: { email, planId, role? }
 */
export const inviteMember = catchAsync(async (req, res) => {
  const inviterId = req.user?._id || req.user?.id;
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;
  const { email, planId, role = 'user' } = req.body;

  if (!email) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Email is required',
    });
  }

  // Validate planId if provided
  if (planId && !PLANS[planId]) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Invalid planId. Valid options: ${Object.keys(PLANS).join(', ')}`,
    });
  }

  // Create tenant invitation
  let invitation;
  if (tenantId) {
    invitation = await tenantService.inviteMember({
      tenantId,
      email,
      role,
      invitedBy: inviterId,
    });
  }

  // Check if user already exists
  const UserModel = mongoose.model('User');
  let invitedUser = await UserModel.findOne({ email: email.toLowerCase() }).lean();

  const selectedPlan = planId || 'free';
  const promptLimit = getPromptLimit(selectedPlan);

  // If user exists, create/update their subscription as sponsored
  const SubscriptionModel = mongoose.model('Subscription');

  if (invitedUser) {
    // Check if already has a subscription
    let existingSub = await SubscriptionModel.findOne({ userId: invitedUser._id });

    if (existingSub) {
      // Update existing subscription to be sponsored
      existingSub.plan = selectedPlan;
      existingSub.sponsoredBy = inviterId;
      existingSub.status = 'active';
      existingSub.limits.promptLimit = promptLimit;
      existingSub.usage.promptsMonthlyUsed = 0;
      await existingSub.save();
    } else {
      // Create new sponsored subscription
      await SubscriptionModel.create({
        userId: invitedUser._id,
        plan: selectedPlan,
        status: 'active',
        sponsoredBy: inviterId,
        tenantId: tenantId || null,
        limits: { promptLimit },
        usage: { promptsMonthlyUsed: 0, promptsUsed: 0 },
      });
    }
  }

  // Send invitation email
  try {
    const planName = PLANS[selectedPlan]?.name || 'Free';
    await sendMailWithMailGun({
      to: email,
      subject: 'You\'ve been invited to Alti AI',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: auto;">
          <h2 style="color: #111;">You've been invited to Alti AI</h2>
          <p>Someone has invited you to join their team on Alti AI and assigned you the <strong>${planName}</strong> plan.</p>
          <p>Your subscription is fully covered — no payment required on your end.</p>
          <p style="margin-top: 24px;">
            <a href="https://altihq.com" style="background: #111; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
              Get Started
            </a>
          </p>
          <hr style="margin-top: 32px;">
          <p style="color: #999; font-size: 12px;">Alti AI — Sovereign Infrastructure</p>
        </div>
      `,
    });
  } catch (emailErr) {
    logger.warn(`Invitation email failed for ${email}: ${emailErr.message}`);
  }

  logger.info(`Member invited: ${email} with plan ${selectedPlan} by user ${inviterId}`);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Invitation sent successfully',
    data: {
      email,
      plan: selectedPlan,
      promptLimit,
      invitation: invitation || null,
    },
  });
});

// Alias
export const inviteTeamMember = inviteMember;

// ── Get Team Members ─────────────────────────────────────────────────────────

/**
 * Get all members invited/sponsored by the current user.
 * Returns each member's email, plan, usage, and status.
 *
 * GET /api/v1/auth/team/members?page=1&limit=20
 */
export const getTeamMembers = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const { page = 1, limit = 20 } = req.query;

  const SubscriptionModel = mongoose.model('Subscription');
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Find all subscriptions sponsored by this user
  const [members, total] = await Promise.all([
    SubscriptionModel.find({ sponsoredBy: userId })
      .populate('userId', 'name email profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    SubscriptionModel.countDocuments({ sponsoredBy: userId }),
  ]);

  const membersData = members.map((sub) => ({
    userId: sub.userId?._id || sub.userId,
    email: sub.userId?.email || 'Pending',
    name: sub.userId?.name || null,
    profileImage: sub.userId?.profileImage || null,
    plan: sub.plan,
    planName: PLANS[sub.plan]?.name || sub.plan,
    price: PLANS[sub.plan]?.price ? PLANS[sub.plan].price / 100 : 0,
    promptLimit: sub.limits?.promptLimit || 25,
    promptsUsed: sub.usage?.promptsMonthlyUsed || 0,
    promptsRemaining: Math.max(0, (sub.limits?.promptLimit || 25) - (sub.usage?.promptsMonthlyUsed || 0)),
    status: sub.status,
    createdAt: sub.createdAt,
  }));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Team members retrieved',
    data: {
      members: membersData,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    },
  });
});

// ── Update Member Plan ───────────────────────────────────────────────────────

/**
 * Change the plan assigned to an invited member.
 * Only the sponsoring user can change the plan.
 *
 * PATCH /api/v1/auth/team/members/:memberId/plan
 * Body: { planId }
 */
export const updateMemberPlan = catchAsync(async (req, res) => {
  const sponsorId = req.user?._id || req.user?.id;
  const { memberId } = req.params;
  const { planId } = req.body;

  if (!planId || !PLANS[planId]) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Invalid planId. Valid options: ${Object.keys(PLANS).join(', ')}`,
    });
  }

  const SubscriptionModel = mongoose.model('Subscription');
  const subscription = await SubscriptionModel.findOne({
    userId: memberId,
    sponsoredBy: sponsorId,
  });

  if (!subscription) {
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'Member not found or you are not their sponsor',
    });
  }

  const promptLimit = getPromptLimit(planId);
  subscription.plan = planId;
  subscription.limits.promptLimit = promptLimit;
  await subscription.save();

  logger.info(`Member ${memberId} plan updated to ${planId} by ${sponsorId}`);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Member plan updated',
    data: {
      userId: memberId,
      plan: planId,
      planName: PLANS[planId].name,
      price: PLANS[planId].price / 100,
      promptLimit,
    },
  });
});

// ── Update Member Role ───────────────────────────────────────────────────────

export const updateTeamMemberRole = catchAsync(async (req, res) => {
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;
  const { userId } = req.params;
  const { role } = req.body;
  const updaterId = req.user?._id || req.user?.id;

  if (tenantId) {
    const result = await tenantService.updateMemberRole(tenantId, userId, role, updaterId);
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Member role updated',
      data: result,
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.BAD_REQUEST,
    success: false,
    message: 'No tenant context. Cannot update role.',
  });
});

// ── Remove Member ────────────────────────────────────────────────────────────

/**
 * Remove a sponsored member. Revokes their sponsored subscription
 * and downgrades them to free tier.
 *
 * DELETE /api/v1/auth/team/members/:memberId
 */
export const removeMember = catchAsync(async (req, res) => {
  const sponsorId = req.user?._id || req.user?.id;
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;
  const { memberId } = req.params;

  const SubscriptionModel = mongoose.model('Subscription');
  const subscription = await SubscriptionModel.findOne({
    userId: memberId,
    sponsoredBy: sponsorId,
  });

  if (!subscription) {
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'Member not found or you are not their sponsor',
    });
  }

  // Downgrade to free — remove sponsorship
  subscription.sponsoredBy = null;
  subscription.plan = 'free';
  subscription.limits.promptLimit = 25;
  subscription.usage.promptsMonthlyUsed = 0;
  await subscription.save();

  // Remove from tenant if applicable
  if (tenantId) {
    try {
      await tenantService.removeMember(tenantId, memberId, sponsorId);
    } catch (e) {
      logger.warn(`Failed to remove member ${memberId} from tenant: ${e.message}`);
    }
  }

  logger.info(`Member ${memberId} removed by sponsor ${sponsorId}`);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Member removed and downgraded to free plan',
    data: { userId: memberId },
  });
});

export const removeTeamMember = removeMember;

// ── Get Pending Invitations ──────────────────────────────────────────────────

export const getPendingInvitations = catchAsync(async (req, res) => {
  const tenantId = req.user?.currentTenantId || req.user?.tenantId;
  const { page = 1, limit = 20, status = 'pending' } = req.query;

  if (!tenantId) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'No tenant — no invitations',
      data: { invitations: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } },
    });
  }

  const result = await tenantInvitationService.getTenantInvitations(tenantId, {
    page, limit, status,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Invitations retrieved',
    data: result,
  });
});

// ── Cancel Invitation ────────────────────────────────────────────────────────

export const cancelInvitation = catchAsync(async (req, res) => {
  const { invitationId } = req.params;
  await tenantInvitationService.cancelInvitation(invitationId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Invitation cancelled',
  });
});

export const revokeInvitation = cancelInvitation;

// ── Default Export ───────────────────────────────────────────────────────────

export const managerController = {
  inviteMember,
  inviteTeamMember,
  getPendingInvitations,
  cancelInvitation,
  revokeInvitation,
  getTeamMembers,
  updateMemberPlan,
  updateMemberRole: updateTeamMemberRole,
  updateTeamMemberRole,
  removeMember,
  removeTeamMember,
};

export default managerController;
