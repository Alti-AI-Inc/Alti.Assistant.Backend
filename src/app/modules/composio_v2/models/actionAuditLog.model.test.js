import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import ActionAuditLog from './actionAuditLog.model.js';

describe('ActionAuditLog Model', () => {
  const validUserId = new mongoose.Types.ObjectId();

  describe('Validation', () => {
    it('should validate a correct and complete document', async () => {
      const validLog = new ActionAuditLog({
        userId: validUserId,
        conversationId: 'conv-123',
        executionId: 'exec-456',
        app: 'Slack',
        action: 'sendMessage',
        toolName: 'Slack Send Message',
        toolSlug: 'slack-send-message',
        parameters: { channel: '#general', text: 'Hello' },
        result: { ok: true },
        error: null,
        status: 'success',
        durationMs: 150,
        attempts: 1,
        retried: false,
        workflowType: 'single_step',
        confidence: 0.95,
        classifiedBy: 'ai_classification',
        stepIndex: 0,
        totalSteps: 1,
        stepId: 'step-789',
        redacted: false,
      });

      const err = await validLog.validate().catch((e) => e);
      expect(err).toBeUndefined();
    });

    it('should fail validation if required fields are missing', async () => {
      const invalidLog = new ActionAuditLog({});

      const err = await invalidLog.validate().catch((e) => e);
      expect(err).toBeDefined();
      expect(err.errors.userId).toBeDefined();
      expect(err.errors.app).toBeDefined();
      expect(err.errors.action).toBeDefined();
    });

    it('should apply default values correctly', () => {
      const log = new ActionAuditLog({
        userId: validUserId,
        app: 'Jira',
        action: 'createIssue',
      });

      expect(log.status).toBe('pending');
      expect(log.parameters).toEqual({});
      expect(log.result).toBeNull();
      expect(log.error).toBeNull();
      expect(log.durationMs).toBe(0);
      expect(log.attempts).toBe(1);
      expect(log.retried).toBe(false);
      expect(log.classifiedBy).toBe('ai_classification');
      expect(log.redacted).toBe(false);
    });

    it('should fail validation for invalid status enum', async () => {
      const log = new ActionAuditLog({
        userId: validUserId,
        app: 'Slack',
        action: 'sendMessage',
        status: 'invalid_status',
      });

      const err = await log.validate().catch((e) => e);
      expect(err).toBeDefined();
      expect(err.errors.status).toBeDefined();
    });

    it('should fail validation for invalid workflowType enum', async () => {
      const log = new ActionAuditLog({
        userId: validUserId,
        app: 'Slack',
        action: 'sendMessage',
        workflowType: 'invalid_workflow',
      });

      const err = await log.validate().catch((e) => e);
      expect(err).toBeDefined();
      expect(err.errors.workflowType).toBeDefined();
    });

    it('should fail validation for invalid classifiedBy enum', async () => {
      const log = new ActionAuditLog({
        userId: validUserId,
        app: 'Slack',
        action: 'sendMessage',
        classifiedBy: 'invalid_classifier',
      });

      const err = await log.validate().catch((e) => e);
      expect(err).toBeDefined();
      expect(err.errors.classifiedBy).toBeDefined();
    });

    it('should validate confidence score boundaries', async () => {
      const lowConfidenceLog = new ActionAuditLog({
        userId: validUserId,
        app: 'Slack',
        action: 'sendMessage',
        confidence: -0.1,
      });

      const highConfidenceLog = new ActionAuditLog({
        userId: validUserId,
        app: 'Slack',
        action: 'sendMessage',
        confidence: 1.1,
      });

      const errLow = await lowConfidenceLog.validate().catch((e) => e);
      const errHigh = await highConfidenceLog.validate().catch((e) => e);

      expect(errLow).toBeDefined();
      expect(errLow.errors.confidence).toBeDefined();

      expect(errHigh).toBeDefined();
      expect(errHigh.errors.confidence).toBeDefined();
    });

    it('should validate sub-document error structure', async () => {
      const logWithError = new ActionAuditLog({
        userId: validUserId,
        app: 'Slack',
        action: 'sendMessage',
        status: 'failed',
        error: {
          message: 'Rate limit exceeded',
          code: 'RATE_LIMIT',
          stack: 'Error: Rate limit exceeded\n    at send...',
        },
      });

      const err = await logWithError.validate().catch((e) => e);
      expect(err).toBeUndefined();
      expect(logWithError.error.message).toBe('Rate limit exceeded');
      expect(logWithError.error.code).toBe('RATE_LIMIT');
    });
  });

  describe('Role-Based Access Control & Context Boundaries', () => {
    // Mocking query builder logic to simulate RBAC constraints on ActionAuditLog queries
    const getAuditLogsQuery = (user, queryParams = {}) => {
      const baseQuery = { ...queryParams };

      if (user.role === 'super_admin') {
        // Super admin can access all logs across all users
        return baseQuery;
      }

      if (user.role === 'admin') {
        // Admin can access logs within their organization/tenant
        return { ...baseQuery, tenantId: user.tenantId };
      }

      if (user.role === 'manager') {
        // Manager can access logs of their team or their own
        return { ...baseQuery, teamId: user.teamId };
      }

      if (user.role === 'user') {
        // Regular user can only access their own logs
        return { ...baseQuery, userId: user.id };
      }

      throw new Error('Unauthorized role');
    };

    it('should enforce strict context boundary for standard "user" role', () => {
      const mockUser = { id: 'user-123', role: 'user' };
      const query = getAuditLogsQuery(mockUser, { app: 'Slack' });

      expect(query).toEqual({
        app: 'Slack',
        userId: 'user-123',
      });
    });

    it('should enforce context boundary for "manager" role within team scope', () => {
      const mockManager = { id: 'manager-123', role: 'manager', teamId: 'team-alpha' };
      const query = getAuditLogsQuery(mockManager, { app: 'Jira' });

      expect(query).toEqual({
        app: 'Jira',
        teamId: 'team-alpha',
      });
    });

    it('should enforce context boundary for "admin" role within tenant scope', () => {
      const mockAdmin = { id: 'admin-123', role: 'admin', tenantId: 'tenant-omega' };
      const query = getAuditLogsQuery(mockAdmin, { status: 'failed' });

      expect(query).toEqual({
        status: 'failed',
        tenantId: 'tenant-omega',
      });
    });

    it('should allow "super_admin" role to bypass user/tenant context boundaries', () => {
      const mockSuperAdmin = { id: 'sa-123', role: 'super_admin' };
      const query = getAuditLogsQuery(mockSuperAdmin, { status: 'failed' });

      expect(query).toEqual({
        status: 'failed',
      });
    });

    it('should throw an error for unsupported or undefined roles', () => {
      const mockGuest = { id: 'guest-123', role: 'guest' };
      expect(() => getAuditLogsQuery(mockGuest)).toThrow('Unauthorized role');
    });
  });
});