import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import { tenantInvitationService } from './tenantInvitation.service.js';
import TenantInvitation from './tenantInvitation.model.js';
import Tenant from './tenant.model.js';
import TenantMember from './tenantMember.model.js';
import UserModel from '../auth/auth.model.js';
import { sendInvitationEmail } from './tenantInvitation.email.js';
import subscriptionService from '../subscription/subscription.service.js';
import { logger } from '../../../shared/logger.js';
import ApiError from '../../../errors/ApiError.js';

// Mocking all dependencies
vi.mock('./tenantInvitation.model.js');
vi.mock('./tenant.model.js');
vi.mock('./tenantMember.model.js');
vi.mock('../auth/auth.model.js');
vi.mock('./tenantInvitation.email.js');
vi.mock('../subscription/subscription.service.js');
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('tenantInvitationService', () => {
  const tenantId = 'tenant123';
  const userId = 'user123';
  const inviterId = 'inviter123';
  const invitationId = 'invitation123';
  const email = 'test@example.com';
  const token = 'unique-token';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('createInvitation', () => {
    const invitationData = { tenantId, email, role: 'member', invitedBy: inviterId };
    const mockTenant = { _id: tenantId, name: 'Test Tenant' };
    const mockInviter = { _id: inviterId, name: 'Test Inviter', email: 'inviter@example.com' };
    const mockInvitation = {
      _id: invitationId,
      email,
      role: 'member',
      expiresAt: new Date(),
      status: 'pending',
      save: vi.fn(),
    };

    it('should create an invitation and send an email successfully', async () => {
      Tenant.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenant) });
      UserModel.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockInviter) });
      TenantInvitation.generateToken.mockReturnValue(token);
      TenantInvitation.create.mockResolvedValue(mockInvitation);
      sendInvitationEmail.mockResolvedValue();

      const result = await tenantInvitationService.createInvitation(invitationData);

      expect(Tenant.findById).toHaveBeenCalledWith(tenantId);
      expect(UserModel.findById).toHaveBeenCalledWith(inviterId);
      expect(TenantInvitation.create).toHaveBeenCalledWith(expect.objectContaining({
        tenantId,
        email: email.toLowerCase(),
        role: 'member',
        invitedBy: inviterId,
        token,
      }));
      expect(sendInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({
        email,
        token,
        tenantName: mockTenant.name,
      }));
      expect(result).toEqual({
        id: mockInvitation._id,
        email: mockInvitation.email,
        role: mockInvitation.role,
        expiresAt: mockInvitation.expiresAt,
        status: 'pending',
      });
      expect(logger.info).toHaveBeenCalledWith(`Invitation email sent successfully: ${invitationId} for ${email}`);
    });

    it('should create an invitation with status "pending_email" if email sending fails', async () => {
      Tenant.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenant) });
      UserModel.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockInviter) });
      TenantInvitation.generateToken.mockReturnValue(token);
      TenantInvitation.create.mockResolvedValue(mockInvitation);
      const emailError = new Error('Email service down');
      sendInvitationEmail.mockRejectedValue(emailError);

      const result = await tenantInvitationService.createInvitation(invitationData);

      expect(logger.error).toHaveBeenCalledWith(`Failed to send invitation email for ${invitationId}:`, emailError);
      expect(mockInvitation.status).toBe('pending_email');
      expect(mockInvitation.save).toHaveBeenCalled();
      expect(result.status).toBe('pending_email');
    });

    it('should throw ApiError if tenant or inviter is not found', async () => {
      Tenant.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
      UserModel.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockInviter) });

      await expect(tenantInvitationService.createInvitation(invitationData)).rejects.toThrow(ApiError);
      await expect(tenantInvitationService.createInvitation(invitationData)).rejects.toHaveProperty('statusCode', httpStatus.NOT_FOUND);
    });
  });

  describe('verifyInvitationToken', () => {
    const mockInvitation = {
      _id: invitationId,
      email,
      role: 'admin',
      metadata: { tenantName: 'Test Tenant', inviterName: 'Test Inviter' },
      expiresAt: new Date(Date.now() + 100000),
      isExpired: vi.fn().mockReturnValue(false),
      save: vi.fn(),
    };

    it('should verify a valid token and return invitation details', async () => {
      TenantInvitation.findByToken.mockResolvedValue(mockInvitation);
      UserModel.exists.mockResolvedValue({ _id: 'someid' });

      const result = await tenantInvitationService.verifyInvitationToken(token);

      expect(TenantInvitation.findByToken).toHaveBeenCalledWith(token);
      expect(UserModel.exists).toHaveBeenCalledWith({ email });
      expect(result).toEqual({
        id: mockInvitation._id,
        email: mockInvitation.email,
        role: mockInvitation.role,
        isUserExistWithEmail: true,
        tenantName: mockInvitation.metadata.tenantName,
        inviterName: mockInvitation.metadata.inviterName,
        expiresAt: mockInvitation.expiresAt,
      });
    });

    it('should throw ApiError if invitation is not found', async () => {
      TenantInvitation.findByToken.mockResolvedValue(null);

      await expect(tenantInvitationService.verifyInvitationToken(token)).rejects.toThrow(new ApiError(httpStatus.NOT_FOUND, 'Invalid or expired invitation'));
    });

    it('should throw ApiError if invitation has expired', async () => {
      const expiredInvitation = { ...mockInvitation, isExpired: vi.fn().mockReturnValue(true) };
      TenantInvitation.findByToken.mockResolvedValue(expiredInvitation);

      await expect(tenantInvitationService.verifyInvitationToken(token)).rejects.toThrow(new ApiError(httpStatus.GONE, 'Invitation has expired'));
      expect(expiredInvitation.status).toBe('expired');
      expect(expiredInvitation.save).toHaveBeenCalled();
    });
  });

  describe('acceptInvitation', () => {
    const mockInvitation = {
      _id: invitationId,
      tenantId,
      email,
      role: 'admin',
      invitedBy: inviterId,
      metadata: { tenantName: 'Test Tenant' },
      isExpired: vi.fn().mockReturnValue(false),
      markAsAccepted: vi.fn().mockResolvedValue(true),
      save: vi.fn(),
    };
    const mockUser = {
      _id: userId,
      email,
      save: vi.fn().mockResolvedValue(true),
    };
    const mockSubscription = {
      _id: 'sub123',
      plan: 'paid',
      status: 'active',
      limits: { unlimitedSeats: false },
      seats: { total: 10, used: 5 },
    };

    beforeEach(() => {
      TenantInvitation.findByToken.mockResolvedValue({ ...mockInvitation });
      UserModel.findById.mockResolvedValue({ ...mockUser });
      subscriptionService.getTenantSubscription.mockResolvedValue({ ...mockSubscription });
      TenantMember.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
      TenantMember.create.mockResolvedValue({});
      Tenant.findByIdAndUpdate.mockResolvedValue({});
      subscriptionService.addSeatToSubscription.mockResolvedValue({});
    });

    it('should successfully accept an invitation for a new member with an admin role', async () => {
      const result = await tenantInvitationService.acceptInvitation(token, userId);

      expect(mockUser.save).toHaveBeenCalled();
      expect(mockUser.tenantId).toBe(tenantId);
      expect(mockUser.tenantRole).toBe('admin');
      expect(mockUser.tenantPermissions).toEqual(['manage_members', 'manage_content']);
      expect(TenantMember.create).toHaveBeenCalledWith(expect.objectContaining({
        userId,
        tenantId,
        role: 'admin',
        permissions: ['manage_members', 'manage_content'],
      }));
      expect(Tenant.findByIdAndUpdate).toHaveBeenCalledWith(tenantId, { $inc: { 'usage.usersCount': 1 } }, { new: true });
      expect(subscriptionService.addSeatToSubscription).toHaveBeenCalledWith(mockSubscription._id, userId);
      expect(mockInvitation.markAsAccepted).toHaveBeenCalledWith(userId);
      expect(result).toEqual({
        tenantId,
        role: 'admin',
        tenantName: 'Test Tenant',
      });
    });
    
    it('should successfully accept an invitation for a new member with a member role', async () => {
      const memberInvitation = { ...mockInvitation, role: 'member' };
      TenantInvitation.findByToken.mockResolvedValue(memberInvitation);
      
      await tenantInvitationService.acceptInvitation(token, userId);
      
      expect(mockUser.tenantRole).toBe('member');
      expect(mockUser.tenantPermissions).toEqual(['view_content']);
      expect(TenantMember.create).toHaveBeenCalledWith(expect.objectContaining({
        role: 'member',
        permissions: ['view_content'],
      }));
    });

    it('should not create a new TenantMember if one already exists', async () => {
      TenantMember.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'member123' }) });

      await tenantInvitationService.acceptInvitation(token, userId);

      expect(TenantMember.create).not.toHaveBeenCalled();
    });

    it('should not add a seat for a free plan', async () => {
      subscriptionService.getTenantSubscription.mockResolvedValue({ ...mockSubscription, plan: 'free' });

      await tenantInvitationService.acceptInvitation(token, userId);

      expect(subscriptionService.addSeatToSubscription).not.toHaveBeenCalled();
    });

    it('should throw ApiError if seat limit is reached', async () => {
      subscriptionService.getTenantSubscription.mockResolvedValue({
        ...mockSubscription,
        seats: { total: 5, used: 5 },
      });

      await expect(tenantInvitationService.acceptInvitation(token, userId)).rejects.toThrow(new ApiError(httpStatus.FORBIDDEN, 'Seat limit reached. This workspace cannot accept more members. Please ask the owner to purchase more seats.'));
    });

    it('should throw ApiError if user email does not match invitation email', async () => {
      UserModel.findById.mockResolvedValue({ ...mockUser, email: 'wrong@example.com' });

      await expect(tenantInvitationService.acceptInvitation(token, userId)).rejects.toThrow(new ApiError(httpStatus.FORBIDDEN, 'Invitation email does not match user email'));
    });

    it('should not fail if adding a seat to subscription fails', async () => {
      const seatError = new Error('Stripe API error');
      subscriptionService.addSeatToSubscription.mockRejectedValue(seatError);

      const result = await tenantInvitationService.acceptInvitation(token, userId);

      expect(logger.error).toHaveBeenCalledWith('Error adding seat after invitation acceptance:', seatError);
      expect(mockInvitation.markAsAccepted).toHaveBeenCalledWith(userId);
      expect(result).toBeDefined();
    });
  });

  describe('cancelInvitation', () => {
    it('should cancel a pending invitation', async () => {
      const mockInvitation = {
        status: 'pending',
        cancel: vi.fn().mockResolvedValue(true),
      };
      TenantInvitation.findById.mockResolvedValue(mockInvitation);

      await tenantInvitationService.cancelInvitation(invitationId);

      expect(TenantInvitation.findById).toHaveBeenCalledWith(invitationId);
      expect(mockInvitation.cancel).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(`Invitation cancelled: ${invitationId}`);
    });

    it('should throw ApiError if invitation is not found', async () => {
      TenantInvitation.findById.mockResolvedValue(null);

      await expect(tenantInvitationService.cancelInvitation(invitationId)).rejects.toThrow(new ApiError(httpStatus.NOT_FOUND, 'Invitation not found'));
    });

    it('should throw ApiError if invitation is not pending', async () => {
      const mockInvitation = { status: 'accepted' };
      TenantInvitation.findById.mockResolvedValue(mockInvitation);

      await expect(tenantInvitationService.cancelInvitation(invitationId)).rejects.toThrow(new ApiError(httpStatus.BAD_REQUEST, 'Can only cancel pending invitations'));
    });
  });

  describe('resendInvitation', () => {
    const mockInvitation = {
      _id: invitationId,
      email,
      token,
      role: 'member',
      status: 'pending',
      metadata: { inviterName: 'Inviter', tenantName: 'Tenant' },
      isExpired: vi.fn().mockReturnValue(false),
      save: vi.fn(),
    };

    it('should resend a pending invitation', async () => {
      TenantInvitation.findById.mockResolvedValue(mockInvitation);
      sendInvitationEmail.mockResolvedValue();

      await tenantInvitationService.resendInvitation(invitationId);

      expect(sendInvitationEmail).toHaveBeenCalledWith({
        email,
        token,
        inviterName: 'Inviter',
        tenantName: 'Tenant',
        role: 'member',
        expiryDays: 7,
      });
      expect(mockInvitation.save).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(`Invitation resent successfully: ${invitationId}`);
    });

    it('should resend and update status for a "pending_email" invitation', async () => {
      const pendingEmailInvitation = { ...mockInvitation, status: 'pending_email' };
      TenantInvitation.findById.mockResolvedValue(pendingEmailInvitation);
      sendInvitationEmail.mockResolvedValue();

      await tenantInvitationService.resendInvitation(invitationId);

      expect(sendInvitationEmail).toHaveBeenCalled();
      expect(pendingEmailInvitation.status).toBe('pending');
      expect(pendingEmailInvitation.save).toHaveBeenCalled();
    });

    it('should throw ApiError if invitation has expired', async () => {
      const expiredInvitation = { ...mockInvitation, isExpired: vi.fn().mockReturnValue(true) };
      TenantInvitation.findById.mockResolvedValue(expiredInvitation);

      await expect(tenantInvitationService.resendInvitation(invitationId)).rejects.toThrow(new ApiError(httpStatus.GONE, 'Invitation has expired. Please create a new one'));
    });

    it('should throw ApiError if email sending fails', async () => {
      TenantInvitation.findById.mockResolvedValue(mockInvitation);
      const emailError = new Error('SMTP Error');
      sendInvitationEmail.mockRejectedValue(emailError);

      await expect(tenantInvitationService.resendInvitation(invitationId)).rejects.toThrow(new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to send invitation email. Please try again later.'));
      expect(logger.error).toHaveBeenCalledWith(`Failed to resend invitation email for ${invitationId}:`, emailError);
    });
  });

  describe('getTenantInvitations', () => {
    const mockInvitations = [{ _id: 'inv1' }, { _id: 'inv2' }];
    const mockQuery = {
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockInvitations),
    };

    it('should retrieve invitations with default options', async () => {
      TenantInvitation.find.mockReturnValue(mockQuery);
      TenantInvitation.countDocuments.mockResolvedValue(15);

      const result = await tenantInvitationService.getTenantInvitations(tenantId);

      expect(TenantInvitation.find).toHaveBeenCalledWith({ tenantId, status: 'pending' });
      expect(mockQuery.skip).toHaveBeenCalledWith(0);
      expect(mockQuery.limit).toHaveBeenCalledWith(20);
      expect(TenantInvitation.countDocuments).toHaveBeenCalledWith({ tenantId, status: 'pending' });
      expect(result.invitations).toEqual(mockInvitations);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 15,
        pages: 1,
      });
    });

    it('should retrieve invitations with custom pagination and status', async () => {
      const options = { page: 2, limit: 5, status: 'accepted' };
      TenantInvitation.find.mockReturnValue(mockQuery);
      TenantInvitation.countDocuments.mockResolvedValue(15);

      const result = await tenantInvitationService.getTenantInvitations(tenantId, options);

      expect(TenantInvitation.find).toHaveBeenCalledWith({ tenantId, status: 'accepted' });
      expect(mockQuery.skip).toHaveBeenCalledWith(5);
      expect(mockQuery.limit).toHaveBeenCalledWith(5);
      expect(TenantInvitation.countDocuments).toHaveBeenCalledWith({ tenantId, status: 'accepted' });
      expect(result.pagination).toEqual({
        page: 2,
        limit: 5,
        total: 15,
        pages: 3,
      });
    });
  });
});