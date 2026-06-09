import { describe, it, expect } from 'vitest';
import {
  createBrowserUseSchema,
  getBrowserUseSchema,
  updateBrowserUseSchema,
} from './browserUse.validation';

// Helper function to generate a valid UUID
const generateUuid = () => '123e4567-e89b-12d3-a456-426614174000';

describe('browserUse.validation', () => {

  describe('createBrowserUseSchema', () => {
    it('should validate a correct payload for "navigate" action', () => {
      const payload = {
        url: 'http://example.com',
        action: 'navigate',
        userId: generateUuid(),
        sessionId: generateUuid(),
      };
      const { error } = createBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeUndefined();
    });

    it('should validate a correct payload for "click" action', () => {
      const payload = {
        url: 'http://example.com',
        action: 'click',
        selector: '#button',
        userId: generateUuid(),
        sessionId: generateUuid(),
      };
      const { error } = createBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeUndefined();
    });

    it('should validate a correct payload for "type" action', () => {
      const payload = {
        url: 'http://example.com',
        action: 'type',
        selector: '#input',
        value: 'test input',
        userId: generateUuid(),
        sessionId: generateUuid(),
      };
      const { error } = createBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeUndefined();
    });

    it('should validate a correct payload for "screenshot" action', () => {
      const payload = {
        url: 'http://example.com',
        action: 'screenshot',
        selector: '#element',
        userId: generateUuid(),
        sessionId: generateUuid(),
      };
      const { error } = createBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeUndefined();
    });

    it('should return an error if url is missing', () => {
      const payload = {
        action: 'navigate',
        userId: generateUuid(),
        sessionId: generateUuid(),
      };
      const { error } = createBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('url'))).toBe(true);
    });

    it('should return an error if url is not a valid URI', () => {
      const payload = {
        url: 'not-a-uri',
        action: 'navigate',
        userId: generateUuid(),
        sessionId: generateUuid(),
      };
      const { error } = createBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('url'))).toBe(true);
    });

    it('should return an error if action is missing', () => {
      const payload = {
        url: 'http://example.com',
        userId: generateUuid(),
        sessionId: generateUuid(),
      };
      const { error } = createBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('action'))).toBe(true);
    });

    it('should return an error if action is not one of the allowed values', () => {
      const payload = {
        url: 'http://example.com',
        action: 'invalidAction',
        userId: generateUuid(),
        sessionId: generateUuid(),
      };
      const { error } = createBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('action'))).toBe(true);
    });

    it('should return an error if userId is missing', () => {
      const payload = {
        url: 'http://example.com',
        action: 'navigate',
        sessionId: generateUuid(),
      };
      const { error } = createBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('userId'))).toBe(true);
    });

    it('should return an error if userId is not a valid UUID', () => {
      const payload = {
        url: 'http://example.com',
        action: 'navigate',
        userId: 'invalid-uuid',
        sessionId: generateUuid(),
      };
      const { error } = createBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('userId'))).toBe(true);
    });

    it('should return an error if sessionId is missing', () => {
      const payload = {
        url: 'http://example.com',
        action: 'navigate',
        userId: generateUuid(),
      };
      const { error } = createBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('sessionId'))).toBe(true);
    });

    it('should return an error if sessionId is not a valid UUID', () => {
      const payload = {
        url: 'http://example.com',
        action: 'navigate',
        userId: generateUuid(),
        sessionId: 'invalid-uuid',
      };
      const { error } = createBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('sessionId'))).toBe(true);
    });

    it('should require selector for "click" action', () => {
      const payload = {
        url: 'http://example.com',
        action: 'click',
        userId: generateUuid(),
        sessionId: generateUuid(),
      };
      const { error } = createBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('selector'))).toBe(true);
    });

    it('should require selector for "type" action', () => {
      const payload = {
        url: 'http://example.com',
        action: 'type',
        value: 'some text',
        userId: generateUuid(),
        sessionId: generateUuid(),
      };
      const { error } = createBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('selector'))).toBe(true);
    });

    it('should require selector for "screenshot" action', () => {
      const payload = {
        url: 'http://example.com',
        action: 'screenshot',
        userId: generateUuid(),
        sessionId: generateUuid(),
      };
      const { error } = createBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('selector'))).toBe(true);
    });

    it('should forbid selector for "navigate" action', () => {
      const payload = {
        url: 'http://example.com',
        action: 'navigate',
        selector: '#forbidden',
        userId: generateUuid(),
        sessionId: generateUuid(),
      };
      const { error } = createBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('selector') && d.type === 'object.forbidden')).toBe(true);
    });

    it('should require value for "type" action', () => {
      const payload = {
        url: 'http://example.com',
        action: 'type',
        selector: '#input',
        userId: generateUuid(),
        sessionId: generateUuid(),
      };
      const { error } = createBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('value'))).toBe(true);
    });

    it('should forbid value for "click" action', () => {
      const payload = {
        url: 'http://example.com',
        action: 'click',
        selector: '#button',
        value: 'forbidden value',
        userId: generateUuid(),
        sessionId: generateUuid(),
      };
      const { error } = createBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('value') && d.type === 'object.forbidden')).toBe(true);
    });

    it('should forbid value for "navigate" action', () => {
      const payload = {
        url: 'http://example.com',
        action: 'navigate',
        value: 'forbidden value',
        userId: generateUuid(),
        sessionId: generateUuid(),
      };
      const { error } = createBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('value') && d.type === 'object.forbidden')).toBe(true);
    });

    it('should forbid value for "screenshot" action', () => {
      const payload = {
        url: 'http://example.com',
        action: 'screenshot',
        selector: '#element',
        value: 'forbidden value',
        userId: generateUuid(),
        sessionId: generateUuid(),
      };
      const { error } = createBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('value') && d.type === 'object.forbidden')).toBe(true);
    });
  });

  describe('getBrowserUseSchema', () => {
    it('should validate a correct payload with a valid id', () => {
      const payload = { id: generateUuid() };
      const { error } = getBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeUndefined();
    });

    it('should return an error if id is missing', () => {
      const payload = {};
      const { error } = getBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('id'))).toBe(true);
    });

    it('should return an error if id is not a valid UUID', () => {
      const payload = { id: 'invalid-uuid' };
      const { error } = getBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('id'))).toBe(true);
    });

    it('should ignore extra fields', () => {
      const payload = { id: generateUuid(), extraField: 'should be ignored' };
      const { error, value } = getBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeUndefined();
      expect(value).toEqual({ id: payload.id });
    });
  });

  describe('updateBrowserUseSchema', () => {
    it('should validate a correct payload with only id', () => {
      const payload = { id: generateUuid() };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeUndefined();
    });

    it('should validate a correct payload with id and url', () => {
      const payload = { id: generateUuid(), url: 'http://newurl.com' };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeUndefined();
    });

    it('should validate a correct payload with id and "navigate" action', () => {
      const payload = { id: generateUuid(), action: 'navigate' };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeUndefined();
    });

    it('should validate a correct payload with id, "click" action and selector', () => {
      const payload = { id: generateUuid(), action: 'click', selector: '.new-button' };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeUndefined();
    });

    it('should validate a correct payload with id, "type" action, selector and value', () => {
      const payload = { id: generateUuid(), action: 'type', selector: '.new-input', value: 'updated text' };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeUndefined();
    });

    it('should validate a correct payload with id, "screenshot" action and selector', () => {
      const payload = { id: generateUuid(), action: 'screenshot', selector: '.new-element' };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeUndefined();
    });

    it('should validate a correct payload with id and status', () => {
      const payload = { id: generateUuid(), status: 'completed' };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeUndefined();
    });

    it('should return an error if id is missing', () => {
      const payload = { url: 'http://example.com' };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('id'))).toBe(true);
    });

    it('should return an error if id is not a valid UUID', () => {
      const payload = { id: 'invalid-uuid', url: 'http://example.com' };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('id'))).toBe(true);
    });

    it('should return an error if url is not a valid URI', () => {
      const payload = { id: generateUuid(), url: 'not-a-uri' };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('url'))).toBe(true);
    });

    it('should return an error if action is not one of the allowed values', () => {
      const payload = { id: generateUuid(), action: 'invalidAction' };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('action'))).toBe(true);
    });

    it('should return an error if status is not one of the allowed values', () => {
      const payload = { id: generateUuid(), status: 'invalidStatus' };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('status'))).toBe(true);
    });

    it('should require selector for "click" action if action is present', () => {
      const payload = { id: generateUuid(), action: 'click' };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('selector'))).toBe(true);
    });

    it('should require selector for "type" action if action is present', () => {
      const payload = { id: generateUuid(), action: 'type', value: 'some text' };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('selector'))).toBe(true);
    });

    it('should require selector for "screenshot" action if action is present', () => {
      const payload = { id: generateUuid(), action: 'screenshot' };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('selector'))).toBe(true);
    });

    it('should forbid selector for "navigate" action if action is present', () => {
      const payload = { id: generateUuid(), action: 'navigate', selector: '#forbidden' };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('selector') && d.type === 'object.forbidden')).toBe(true);
    });

    it('should require value for "type" action if action is present', () => {
      const payload = { id: generateUuid(), action: 'type', selector: '#input' };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('value'))).toBe(true);
    });

    it('should forbid value for "click" action if action is present', () => {
      const payload = { id: generateUuid(), action: 'click', selector: '#button', value: 'forbidden value' };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('value') && d.type === 'object.forbidden')).toBe(true);
    });

    it('should forbid value for "navigate" action if action is present', () => {
      const payload = { id: generateUuid(), action: 'navigate', value: 'forbidden value' };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('value') && d.type === 'object.forbidden')).toBe(true);
    });

    it('should forbid value for "screenshot" action if action is present', () => {
      const payload = { id: generateUuid(), action: 'screenshot', selector: '#element', value: 'forbidden value' };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeDefined();
      expect(error.details.some(d => d.path.includes('value') && d.type === 'object.forbidden')).toBe(true);
    });

    it('should validate a complex valid payload', () => {
      const payload = {
        id: generateUuid(),
        url: 'http://another.example.com',
        action: 'type',
        selector: '.some-field',
        value: 'new data',
        status: 'pending',
      };
      const { error } = updateBrowserUseSchema.validate(payload, { abortEarly: false });
      expect(error).toBeUndefined();
    });
  });
});