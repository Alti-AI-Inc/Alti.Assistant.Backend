import { describe, it, expect, vi, beforeEach } from 'vitest';
import router from './conversationRoutes.js'; // Assuming the file is named this way
import WorkspaceService from '../services/workspaceService.js';
import TeamService from '../services/teamService.js';
import InvitationService from '../services/invitationService.js';
import { validationResult } from 'express-validator';

// Mock services
vi.mock('../services/workspaceService.js', () => ({
  default: {
    checkPlanLimits: vi.fn(),
    getDashboardMetrics: vi.fn(),
  },
}));

vi.mock('../services/teamService.js', () => ({
  default: {
    getTeamMembers: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
  },
}));

vi.mock('../services/invitationService.js', () => ({
  default: {
    createAndSendInvitation: vi.fn(),
  },
}));

// Mock middleware
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req, res, next) => next(),
  checkManagerRole: (req, res, next) => next(),
}));

// Mock express-validator
vi.mock('express-validator', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        validationResult: vi.fn(),
        body: vi.fn().mockReturnThis(),
        param: vi.fn().mockReturnThis(),
        isEmail: vi.fn().mockReturnThis(),
        normalizeEmail: vi.fn().mockReturnThis(),
        withMessage: vi.fn().mockReturnThis(),
        isIn: vi.fn().mockReturnThis(),
        isMongoId: vi.fn().mockReturnThis(),
    };
});


// Helper to find a route handler in the router stack
const findRoute = (method, path) => {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }
  // The actual handler is the last one in the stack for that layer, after validators
  return layer.route.stack[layer.route.stack.length - 1].handle;
};

describe('Manager Dashboard Routes', () => {
  let req, res, next;
  const mockManagerUser = {
    id: 'manager123',
    workspaceId: 'workspace456',
    role: 'manager',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    req = {
      user: { ...mockManagerUser },
      body: {},
      params: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn();
    validationResult.mockReturnValue({ isEmpty: () => true, array: () => [] });
  });

  describe('GET /team', () => {
    const getTeamHandler = findRoute('get', '/team');

    it('should retrieve team members successfully', async () => {
      const mockTeam = [{ id: 'user1', name: 'Test User' }];
      TeamService.getTeamMembers.mockResolvedValue(mockTeam);

      await getTeamHandler(req, res);

      expect(TeamService.getTeamMembers).toHaveBeenCalledWith(mockManagerUser.workspaceId);
      expect(res.json).toHaveBeenCalledWith({ success: true, team: mockTeam });
    });

    it('should handle errors when fetching team members', async () => {
      TeamService.getTeamMembers.mockRejectedValue(new Error('DB Error'));

      await getTeamHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Failed to retrieve team members.' });
    });
  });

  describe('POST /invitations', () => {
    const postInvitationHandler = findRoute('post', '/invitations');

    it('should send an invitation successfully', async () => {
      req.body = { email: 'test@example.com', role: 'member' };
      const mockInvitation = { id: 'invite123', email: 'test@example.com' };
      WorkspaceService.checkPlanLimits.mockResolvedValue(true);
      InvitationService.createAndSendInvitation.mockResolvedValue(mockInvitation);

      await postInvitationHandler(req, res);

      expect(WorkspaceService.checkPlanLimits).toHaveBeenCalledWith(mockManagerUser.workspaceId);
      expect(InvitationService.createAndSendInvitation).toHaveBeenCalledWith({
        workspaceId: mockManagerUser.workspaceId,
        email: 'test@example.com',
        role: 'member',
        inviterId: mockManagerUser.id,
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Invitation sent successfully.',
        invitation: mockInvitation,
      });
    });

    it('should return 403 if plan limit is reached', async () => {
      req.body = { email: 'test@example.com', role: 'member' };
      WorkspaceService.checkPlanLimits.mockResolvedValue(false);

      await postInvitationHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Plan limit reached. Please upgrade your plan to add more members.',
      });
      expect(InvitationService.createAndSendInvitation).not.toHaveBeenCalled();
    });

    it('should return 409 if user is already in the workspace (ConflictError)', async () => {
      req.body = { email: 'test@example.com', role: 'member' };
      const conflictError = new Error('User is already a member.');
      conflictError.name = 'ConflictError';
      WorkspaceService.checkPlanLimits.mockResolvedValue(true);
      InvitationService.createAndSendInvitation.mockRejectedValue(conflictError);

      await postInvitationHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'User is already a member.' });
    });

    it('should return 500 for other errors during invitation', async () => {
      req.body = { email: 'test@example.com', role: 'member' };
      WorkspaceService.checkPlanLimits.mockResolvedValue(true);
      InvitationService.createAndSendInvitation.mockRejectedValue(new Error('SMTP Error'));

      await postInvitationHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Failed to send invitation.' });
    });
  });

  describe('PUT /team/:memberId/role', () => {
    const updateRoleHandler = findRoute('put', '/team/:memberId/role');

    it('should update a team member\'s role successfully', async () => {
      const memberIdToUpdate = 'user789';
      req.params = { memberId: memberIdToUpdate };
      req.body = { role: 'manager' };
      const updatedMember = { id: memberIdToUpdate, role: 'manager' };
      TeamService.updateMemberRole.mockResolvedValue(updatedMember);

      await updateRoleHandler(req, res);

      expect(TeamService.updateMemberRole).toHaveBeenCalledWith(
        mockManagerUser.workspaceId,
        memberIdToUpdate,
        'manager'
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Member role updated successfully.',
        member: updatedMember,
      });
    });

    it('should return 403 when a manager tries to change their own role', async () => {
      req.params = { memberId: mockManagerUser.id }; // Manager's own ID
      req.body = { role: 'member' };

      await updateRoleHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Managers cannot change their own role.' });
      expect(TeamService.updateMemberRole).not.toHaveBeenCalled();
    });

    it('should return 404 if the team member is not found', async () => {
      const memberIdToUpdate = 'nonexistentUser';
      req.params = { memberId: memberIdToUpdate };
      req.body = { role: 'manager' };
      TeamService.updateMemberRole.mockResolvedValue(null);

      await updateRoleHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Team member not found in this workspace.' });
    });

    it('should return 500 on service error', async () => {
        req.params = { memberId: 'user789' };
        req.body = { role: 'manager' };
        TeamService.updateMemberRole.mockRejectedValue(new Error('DB Error'));

        await updateRoleHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Failed to update member role.' });
    });
  });

  describe('DELETE /team/:memberId', () => {
    const deleteMemberHandler = findRoute('delete', '/team/:memberId');

    it('should remove a team member successfully', async () => {
      const memberIdToRemove = 'user789';
      req.params = { memberId: memberIdToRemove };
      TeamService.removeMember.mockResolvedValue({ success: true });

      await deleteMemberHandler(req, res);

      expect(TeamService.removeMember).toHaveBeenCalledWith(mockManagerUser.workspaceId, memberIdToRemove);
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Team member removed successfully.' });
    });

    it('should return 403 when a manager tries to remove themselves', async () => {
      req.params = { memberId: mockManagerUser.id }; // Manager's own ID

      await deleteMemberHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'You cannot remove yourself from the workspace.' });
      expect(TeamService.removeMember).not.toHaveBeenCalled();
    });

    it('should return 404 if the team member is not found', async () => {
      const memberIdToRemove = 'nonexistentUser';
      req.params = { memberId: memberIdToRemove };
      TeamService.removeMember.mockResolvedValue({ success: false });

      await deleteMemberHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Team member not found in this workspace.' });
    });

    it('should return 500 on service error', async () => {
        req.params = { memberId: 'user789' };
        TeamService.removeMember.mockRejectedValue(new Error('DB Error'));

        await deleteMemberHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Failed to remove team member.' });
    });
  });

  describe('GET /metrics', () => {
    const getMetricsHandler = findRoute('get', '/metrics');

    it('should retrieve workspace metrics successfully', async () => {
      const mockMetrics = { totalMembers: 10, apiCallsThisMonth: 1000 };
      WorkspaceService.getDashboardMetrics.mockResolvedValue(mockMetrics);

      await getMetricsHandler(req, res);

      expect(WorkspaceService.getDashboardMetrics).toHaveBeenCalledWith(mockManagerUser.workspaceId);
      expect(res.json).toHaveBeenCalledWith({ success: true, metrics: mockMetrics });
    });

    it('should handle errors when fetching metrics', async () => {
      WorkspaceService.getDashboardMetrics.mockRejectedValue(new Error('Aggregation failed'));

      await getMetricsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Failed to retrieve workspace metrics.' });
    });
  });

  describe('Validation Error Handling', () => {
    // We can test the validation handler by finding a route that uses it
    const postInvitationRoute = router.stack.find(l => l.route && l.route.path === '/invitations');
    const validationHandler = postInvitationRoute.route.stack[1].handle; // The handler is after the validators array

    it('should return 400 if validation fails', () => {
        const errors = [{ msg: 'Invalid email' }];
        validationResult.mockReturnValue({ isEmpty: () => false, array: () => errors });

        validationHandler(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ success: false, errors: errors });
        expect(next).not.toHaveBeenCalled();
    });

    it('should call next() if validation passes', () => {
        validationResult.mockReturnValue({ isEmpty: () => true, array: () => [] });

        validationHandler(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });
  });
});