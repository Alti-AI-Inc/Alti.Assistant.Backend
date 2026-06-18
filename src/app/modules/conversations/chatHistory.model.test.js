import { describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import ChatHistory from './chatHistory.model.js';

describe('ChatHistory Model Schema & Context Boundaries', () => {
  // 1. Schema Structure & Validation Tests
  describe('Schema Definition', () => {
    it('should have the correct paths and types', () => {
      const paths = ChatHistory.schema.paths;

      expect(paths.user).toBeDefined();
      expect(paths.user.instance).toBe('ObjectId');
      expect(paths.user.options.ref).toBe('User');

      expect(paths.sessionId).toBeDefined();
      expect(paths.sessionId.instance).toBe('String');

      expect(paths.createdAt).toBeDefined();
      expect(paths.createdAt.instance).toBe('Date');
      expect(paths.createdAt.options.default).toBeDefined();

      expect(paths.tenantId).toBeDefined();
      expect(paths.tenantId.instance).toBe('ObjectId');
      expect(paths.tenantId.options.ref).toBe('Tenant');
      expect(paths.tenantId.options.index).toBe(true);

      expect(paths.workspaceId).toBeDefined();
      expect(paths.workspaceId.instance).toBe('ObjectId');
      expect(paths.workspaceId.options.ref).toBe('Workspace');
      expect(paths.workspaceId.options.index).toBe(true);
    });

    it('should have the correct nested structure for responses', () => {
      const responsesSchema = ChatHistory.schema.paths.responses;
      expect(responsesSchema).toBeDefined();
      expect(responsesSchema.instance).toBe('Array');

      const subPaths = responsesSchema.schema.paths;

      expect(subPaths.prompt).toBeDefined();
      expect(subPaths.prompt.options.required).toBe(true);
      expect(subPaths.prompt.instance).toBe('String');

      expect(subPaths.model).toBeDefined();
      expect(subPaths.model.options.required).toBe(true);
      expect(subPaths.model.instance).toBe('String');

      expect(subPaths.reply).toBeDefined();
      expect(subPaths.reply.instance).toBe('String');

      expect(subPaths.total_time).toBeDefined();
      expect(subPaths.total_time.options.required).toBe(true);
      expect(subPaths.total_time.instance).toBe('Number');
    });

    it('should have the correct nested structure for search_results within responses', () => {
      const responsesSchema = ChatHistory.schema.paths.responses;
      const searchResultsSchema = responsesSchema.schema.paths.search_results;

      expect(searchResultsSchema).toBeDefined();
      expect(searchResultsSchema.instance).toBe('Array');

      const searchPaths = searchResultsSchema.schema.paths;

      expect(searchPaths.title).toBeDefined();
      expect(searchPaths.title.options.required).toBe(true);
      expect(searchPaths.title.instance).toBe('String');

      expect(searchPaths.link).toBeDefined();
      expect(searchPaths.link.options.required).toBe(true);
      expect(searchPaths.link.instance).toBe('String');

      expect(searchPaths.snippet).toBeDefined();
      expect(searchPaths.snippet.options.required).toBe(true);
      expect(searchPaths.snippet.instance).toBe('String');

      expect(searchPaths.position).toBeDefined();
      expect(searchPaths.position.options.required).toBe(true);
      expect(searchPaths.position.instance).toBe('Number');
    });
  });

  // 2. Index Verification Tests
  describe('Database Indexes', () => {
    it('should define the correct compound and single indexes', () => {
      const indexes = ChatHistory.schema.indexes();

      const hasTenantWorkspaceUserCreatedIndex = indexes.some(index => 
        index[0].tenantId === 1 && index[0].workspaceId === 1 && index[0].user === 1 && index[0].createdAt === -1
      );
      const hasTenantWorkspaceSessionIndex = indexes.some(index => 
        index[0].tenantId === 1 && index[0].workspaceId === 1 && index[0].sessionId === 1
      );

      expect(hasTenantWorkspaceUserCreatedIndex).toBe(true);
      expect(hasTenantWorkspaceSessionIndex).toBe(true);
    });
  });

  // 3. Context Boundaries & Role-Based Access Control (RBAC) Simulation Tests
  describe('Context Boundaries & RBAC Query Constraints', () => {
    const mockTenantId = new mongoose.Types.ObjectId();
    const mockUserId = new mongoose.Types.ObjectId();

    // Helper function simulating a query builder that enforces RBAC and tenant isolation
    const buildChatHistoryQuery = (userContext, queryParams = {}) => {
      const query = { ...queryParams };

      switch (userContext.role) {
        case 'super_admin':
          // Super admins can query globally across all tenants or filter by a specific one
          if (userContext.tenantId) {
            query.tenantId = userContext.tenantId;
          }
          break;

        case 'admin':
        case 'manager':
          // Admins and managers are strictly bound to their tenant context
          if (!userContext.tenantId) {
            throw new Error('Access Denied: Tenant context missing for admin/manager');
          }
          query.tenantId = userContext.tenantId;
          break;

        case 'user':
          // Regular users are strictly bound to their tenant context AND their own user ID
          if (!userContext.tenantId || !userContext.id) {
            throw new Error('Access Denied: User or Tenant context missing');
          }
          query.tenantId = userContext.tenantId;
          query.user = userContext.id;
          break;

        default:
          throw new Error('Access Denied: Invalid or missing role');
      }

      return query;
    };

    it('should allow super_admin to query globally without tenant restrictions', () => {
      const context = { role: 'super_admin' };
      const query = buildChatHistoryQuery(context, { sessionId: 'session-123' });

      expect(query).toEqual({ sessionId: 'session-123' });
      expect(query.tenantId).toBeUndefined();
      expect(query.user).toBeUndefined();
    });

    it('should allow super_admin to query a specific tenant if provided', () => {
      const context = { role: 'super_admin', tenantId: mockTenantId };
      const query = buildChatHistoryQuery(context);

      expect(query.tenantId).toBe(mockTenantId);
    });

    it('should restrict admin to their own tenant context', () => {
      const context = { role: 'admin', tenantId: mockTenantId };
      const query = buildChatHistoryQuery(context, { sessionId: 'session-123' });

      expect(query.tenantId).toBe(mockTenantId);
      expect(query.sessionId).toBe('session-123');
      expect(query.user).toBeUndefined();
    });

    it('should throw an error if admin context is missing tenantId', () => {
      const context = { role: 'admin' };
      expect(() => buildChatHistoryQuery(context)).toThrow('Access Denied: Tenant context missing for admin/manager');
    });

    it('should restrict manager to their own tenant context', () => {
      const context = { role: 'manager', tenantId: mockTenantId };
      const query = buildChatHistoryQuery(context);

      expect(query.tenantId).toBe(mockTenantId);
      expect(query.user).toBeUndefined();
    });

    it('should throw an error if manager context is missing tenantId', () => {
      const context = { role: 'manager' };
      expect(() => buildChatHistoryQuery(context)).toThrow('Access Denied: Tenant context missing for admin/manager');
    });

    it('should restrict user to their own tenant and their own user ID', () => {
      const context = { role: 'user', tenantId: mockTenantId, id: mockUserId };
      const query = buildChatHistoryQuery(context);

      expect(query.tenantId).toBe(mockTenantId);
      expect(query.user).toBe(mockUserId);
    });

    it('should throw an error if user context is missing tenantId or userId', () => {
      const contextWithoutUser = { role: 'user', tenantId: mockTenantId };
      const contextWithoutTenant = { role: 'user', id: mockUserId };

      expect(() => buildChatHistoryQuery(contextWithoutUser)).toThrow('Access Denied: User or Tenant context missing');
      expect(() => buildChatHistoryQuery(contextWithoutTenant)).toThrow('Access Denied: User or Tenant context missing');
    });

    it('should throw an error for unsupported or missing roles', () => {
      const context = { role: 'guest' };
      expect(() => buildChatHistoryQuery(context)).toThrow('Access Denied: Invalid or missing role');
    });
  });

  describe('Document Validation', () => {
    it('should fail validation if required fields in responses are missing', () => {
      const chatHistory = new ChatHistory({
        user: new mongoose.Types.ObjectId(),
        sessionId: 'session-123',
        tenantId: new mongoose.Types.ObjectId(),
        workspaceId: new mongoose.Types.ObjectId(),
        responses: [
          {
            // Missing prompt, model, and total_time
            reply: 'Hello World'
          }
        ]
      });

      const error = chatHistory.validateSync();
      expect(error).toBeDefined();
      expect(error.errors['responses.0.prompt']).toBeDefined();
      expect(error.errors['responses.0.model']).toBeDefined();
      expect(error.errors['responses.0.total_time']).toBeDefined();
    });

    it('should fail validation if search_results missing required fields', () => {
      const chatHistory = new ChatHistory({
        user: new mongoose.Types.ObjectId(),
        sessionId: 'session-123',
        tenantId: new mongoose.Types.ObjectId(),
        workspaceId: new mongoose.Types.ObjectId(),
        responses: [
          {
            prompt: 'What is Vitest?',
            model: 'gpt-4',
            total_time: 1.2,
            search_results: [
              {
                // Missing title, link, snippet, position
              }
            ]
          }
        ]
      });

      const error = chatHistory.validateSync();
      expect(error).toBeDefined();
      expect(error.errors['responses.0.search_results.0.title']).toBeDefined();
      expect(error.errors['responses.0.search_results.0.link']).toBeDefined();
      expect(error.errors['responses.0.search_results.0.snippet']).toBeDefined();
      expect(error.errors['responses.0.search_results.0.position']).toBeDefined();
    });

    it('should pass validation with all required fields populated', () => {
      const chatHistory = new ChatHistory({
        user: new mongoose.Types.ObjectId(),
        sessionId: 'session-123',
        tenantId: new mongoose.Types.ObjectId(),
        workspaceId: new mongoose.Types.ObjectId(),
        responses: [
          {
            prompt: 'What is Vitest?',
            model: 'gpt-4',
            reply: 'Vitest is a fast unit test framework.',
            total_time: 0.8,
            search_results: [
              {
                title: 'Vitest Guide',
                link: 'https://vitest.dev',
                snippet: 'A blazing fast unit test framework powered by Vite.',
                position: 1
              }
            ]
          }
        ]
      });

      const error = chatHistory.validateSync();
      expect(error).toBeUndefined();
    });
  });
});