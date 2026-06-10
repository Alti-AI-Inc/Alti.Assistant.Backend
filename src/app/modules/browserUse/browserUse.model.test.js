import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import BrowserSession from './browserUse.model.js';

describe('BrowserSession Model Unit Tests', () => {
  it('should successfully validate a valid BrowserSession document', () => {
    const validSession = new BrowserSession({
      user: new mongoose.Types.ObjectId(),
      tenantId: new mongoose.Types.ObjectId(),
      responses: [
        {
          taskId: 'task-123',
          prompt: 'Search for Vitest',
          status: 'running',
          steps: [
            {
              id: 'step-1',
              step: 1,
              evaluation_previous_goal: 'none',
              next_goal: 'open google',
              url: 'https://google.com',
            },
          ],
        },
      ],
    });

    const err = validSession.validateSync();
    expect(err).toBeUndefined();
    expect(validSession.responses[0].taskId).toBe('task-123');
    expect(validSession.responses[0].steps[0].id).toBe('step-1');
  });

  it('should fail validation if required fields are missing', () => {
    const invalidSession = new BrowserSession({});
    const err = invalidSession.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.user).toBeDefined();
    expect(err.errors.user.kind).toBe('required');
  });

  it('should fail validation if response is missing required fields', () => {
    const invalidSession = new BrowserSession({
      user: new mongoose.Types.ObjectId(),
      responses: [
        {
          // missing taskId and prompt
          status: 'running',
        },
      ],
    });

    const err = invalidSession.validateSync();
    expect(err).toBeDefined();
    expect(err.errors['responses.0.taskId']).toBeDefined();
    expect(err.errors['responses.0.prompt']).toBeDefined();
  });

  it('should fail validation if step is missing required fields', () => {
    const invalidSession = new BrowserSession({
      user: new mongoose.Types.ObjectId(),
      responses: [
        {
          taskId: 'task-123',
          prompt: 'Search',
          steps: [
            {
              // missing id
              step: 1,
            },
          ],
        },
      ],
    });

    const err = invalidSession.validateSync();
    expect(err).toBeDefined();
    expect(err.errors['responses.0.steps.0.id']).toBeDefined();
  });

  it('should enforce enum validation on response status', () => {
    const invalidSession = new BrowserSession({
      user: new mongoose.Types.ObjectId(),
      responses: [
        {
          taskId: 'task-123',
          prompt: 'Search',
          status: 'invalid_status_value',
        },
      ],
    });

    const err = invalidSession.validateSync();
    expect(err).toBeDefined();
    expect(err.errors['responses.0.status']).toBeDefined();
    expect(err.errors['responses.0.status'].kind).toBe('enum');
  });

  it('should apply correct default values', () => {
    const session = new BrowserSession({
      user: new mongoose.Types.ObjectId(),
      responses: [
        {
          taskId: 'task-123',
          prompt: 'Search',
        },
      ],
    });

    expect(session.tenantId).toBeNull();
    expect(session.responses[0].status).toBe('created');
    expect(session.responses[0].output).toBeNull();
    expect(session.responses[0].live_url).toBeNull();
    expect(session.responses[0].finished_at).toBeNull();
    expect(session.responses[0].steps).toEqual([]);
  });

  it('should verify context boundary fields (tenantId and user)', () => {
    const tenantId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const session = new BrowserSession({
      user: userId,
      tenantId: tenantId,
      responses: [
        {
          taskId: 'task-123',
          prompt: 'Search',
        },
      ],
    });

    expect(session.tenantId.toString()).toBe(tenantId.toString());
    expect(session.user.toString()).toBe(userId.toString());
  });

  it('should have the correct collection name', () => {
    expect(BrowserSession.collection.name).toBe('browser-use');
  });

  it('should define the expected indexes for multi-tenant efficiency', () => {
    const indexes = BrowserSession.schema.indexes();

    const hasIndex = (fields) => {
      return indexes.some((idx) => {
        const keys = Object.keys(idx[0]);
        return (
          keys.length === Object.keys(fields).length &&
          keys.every((k) => idx[0][k] === fields[k])
        );
      });
    };

    // Index 1: tenantId, user, createdAt (descending)
    expect(hasIndex({ tenantId: 1, user: 1, createdAt: -1 })).toBe(true);

    // Index 2: tenantId, createdAt (descending)
    expect(hasIndex({ tenantId: 1, createdAt: -1 })).toBe(true);

    // Index 3: user, createdAt (descending)
    expect(hasIndex({ user: 1, createdAt: -1 })).toBe(true);
  });
});