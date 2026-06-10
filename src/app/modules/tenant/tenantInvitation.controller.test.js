import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import { tenantInvitationController } from './tenantInvitation.controller.js';
import { tenantInvitationService } from './tenantInvitation.service.js';
import sendResponse from '../../../shared/sendResponse.js';

// Mock dependencies
vi.mock('../../../shared/catchAsync.js', () => ({
  default: vi.fn(fn => fn), // Mock catchAsync to return the function it's passed
}));

vi.mock('../../../shared/sendResponse.js', () => ({
  default: vi.fn(),
}));

vi.mock('./tenantInvitation.service.js', () => ({
  tenantInvitationService: {
    getTenantInvitations: vi.fn(),
    verifyInvitationToken: vi.fn(),
    acceptInvitation: vi.fn(),
    cancelInvitation: vi.fn(),
    resendInvitation: vi.fn(),
  },
}));

describe('Tenant Invitation Controller', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      user: { id: 'user123', _id: 'user123', currentTenantId: 'tenant123' },
      params: {},
      query: {},
      body: {},
    };
    res = {}; // Mock res object, sendResponse will be asserted directly
    next = vi.fn();
    vi.clearAllMocks();
  });

  describe('getTenantInvitations', () => {
    it('should call service with currentTenantId and default pagination options', async () => {
      const mockResult = { data: [], meta: { page: 1, limit: 20, total: 0 } };
      tenantInvitationService.getTenantInvitations.mockResolvedValue(mockResult);

      await tenantInvitationController.getTenantInvitations(req, res, next);

      expect(tenantInvitationService.getTenantInvitations).toHaveBeenCalledWith(
        'tenant123',
        { page: 1, limit: 20, status: undefined }
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Invitations retrieved successfully',
        data: mockResult,
      });
    });

    it('should use tenantId as a fallback if currentTenantId is not present', async () => {
      req.user = { id: 'user123', tenantId: 'fallbackTenant456' };
      const mockResult = { data: [], meta: { page: 1, limit: 20, total: 0 } };
      tenantInvitationService.getTenantInvitations.mockResolvedValue(mockResult);

      await tenantInvitationController.getTenantInvitations(req, res, next);

      expect(tenantInvitationService.getTenantInvitations).toHaveBeenCalledWith(
        'fallbackTenant456',
        { page: 1, limit: 20, status: undefined }
      );
    });

    it('should use query parameters for pagination and filtering', async () => {
      req.query = { page: '2', limit: '10', status: 'pending' };
      const mockResult = { data: [], meta: { page: 2, limit: 10, total: 0 } };
      tenantInvitationService.getTenantInvitations.mockResolvedValue(mockResult);

      await tenantInvitationController.getTenantInvitations(req, res, next);

      expect(tenantInvitationService.getTenantInvitations).toHaveBeenCalledWith(
        'tenant123',
        { page: '2', limit: '10', status: 'pending' }
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Invitations retrieved successfully',
        data: mockResult,
      });
    });
  });

  describe('verifyInvitationToken', () => {
    it('should call service with token from params and send response', async () => {
      req.params.token = 'valid-token-123';
      const mockResult = { email: 'test@example.com', status: 'pending' };
      tenantInvitationService.verifyInvitationToken.mockResolvedValue(mockResult);

      await tenantInvitationController.verifyInvitationToken(req, res, next);

      expect(tenantInvitationService.verifyInvitationToken).toHaveBeenCalledWith('valid-token-123');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Invitation verified successfully',
        data: mockResult,
      });
    });
  });

  describe('acceptInvitation', () => {
    it('should call service with inviteId and userId from user.id', async () => {
      req.params.inviteId = 'invite456';
      req.user = { id: 'user789' };
      const mockResult = { _id: 'invite456', status: 'accepted' };
      tenantInvitationService.acceptInvitation.mockResolvedValue(mockResult);

      await tenantInvitationController.acceptInvitation(req, res, next);

      expect(tenantInvitationService.acceptInvitation).toHaveBeenCalledWith('invite456', 'user789');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Invitation accepted successfully',
        data: mockResult,
      });
    });

    it('should use user._id as a fallback for userId if user.id is not present', async () => {
      req.params.inviteId = 'invite456';
      req.user = { _id: 'user789_fallback' }; // No 'id' property
      const mockResult = { _id: 'invite456', status: 'accepted' };
      tenantInvitationService.acceptInvitation.mockResolvedValue(mockResult);

      await tenantInvitationController.acceptInvitation(req, res, next);

      expect(tenantInvitationService.acceptInvitation).toHaveBeenCalledWith('invite456', 'user789_fallback');
    });
  });

  describe('cancelInvitation', () => {
    it('should call service with inviteId and send success response', async () => {
      req.params.inviteId = 'invite-to-cancel-789';
      tenantInvitationService.cancelInvitation.mockResolvedValue(undefined);

      await tenantInvitationController.cancelInvitation(req, res, next);

      expect(tenantInvitationService.cancelInvitation).toHaveBeenCalledWith('invite-to-cancel-789');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Invitation cancelled successfully',
      });
    });
  });

  describe('resendInvitation', () => {
    it('should call service with inviteId and send success response', async () => {
      req.params.inviteId = 'invite-to-resend-101';
      tenantInvitationService.resendInvitation.mockResolvedValue(undefined);

      await tenantInvitationController.resendInvitation(req, res, next);

      expect(tenantInvitationService.resendInvitation).toHaveBeenCalledWith('invite-to-resend-101');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Invitation resent successfully',
      });
    });
  });
});