import { describe, it, expect } from 'vitest';
import aiEndpoints from '../aiEndpoint.utils.js';

describe('AI Endpoint Configuration (aiEndpoint.utils.js)', () => {
  it('should export a non-empty array of endpoint configurations', () => {
    expect(Array.isArray(aiEndpoints)).toBe(true);
    expect(aiEndpoints.length).toBeGreaterThan(0);
  });

  it('should have exactly one enabled endpoint configured as the default', () => {
    const defaultEndpoints = aiEndpoints.filter(e => e.default && e.enabled);
    expect(defaultEndpoints.length).toBe(1);
  });

  describe.each(aiEndpoints)('Endpoint Schema: $title', (endpoint) => {
    it('should have a valid basic structure and data types', () => {
      expect(typeof endpoint.title).toBe('string');
      expect(endpoint.title).not.toBe('');
      expect(typeof endpoint.enabled).toBe('boolean');
      expect(typeof endpoint.default).toBe('boolean');
      expect(typeof endpoint.add).toBe('string');
      expect(endpoint.add.startsWith('/')).toBe(true);
      expect(typeof endpoint.history).toBe('string');
      expect(endpoint.history.startsWith('/')).toBe(true);
      expect(typeof endpoint.delete).toBe('string');
      expect(endpoint.delete.startsWith('/')).toBe(true);
    });

    it('should have a valid "allowedRoles" configuration', () => {
      expect(Array.isArray(endpoint.allowedRoles)).toBe(true);
      expect(endpoint.allowedRoles.length).toBeGreaterThan(0);
      const validRoles = ['super_admin', 'admin', 'manager', 'user'];
      endpoint.allowedRoles.forEach(role => {
        expect(typeof role).toBe('string');
        expect(validRoles).toContain(role);
      });
    });

    it('should have a valid "usage" configuration', () => {
      expect(endpoint.usage).toBeTypeOf('object');
      expect(endpoint.usage).not.toBeNull();
      expect(typeof endpoint.usage.costPerRequest).toBe('number');
      expect(endpoint.usage.costPerRequest).toBeGreaterThanOrEqual(0);
      expect(typeof endpoint.usage.costPerInputToken).toBe('number');
      expect(endpoint.usage.costPerInputToken).toBeGreaterThanOrEqual(0);
      expect(typeof endpoint.usage.costPerOutputToken).toBe('number');
      expect(endpoint.usage.costPerOutputToken).toBeGreaterThanOrEqual(0);
    });

    it('should have a valid "resiliency" configuration', () => {
      expect(endpoint.resiliency).toBeTypeOf('object');
      expect(endpoint.resiliency).not.toBeNull();
      expect(typeof endpoint.resiliency.timeout).toBe('number');
      expect(endpoint.resiliency.timeout).toBeGreaterThan(0);

      // Retry config
      expect(endpoint.resiliency.retry).toBeTypeOf('object');
      expect(endpoint.resiliency.retry).not.toBeNull();
      expect(typeof endpoint.resiliency.retry.retries).toBe('number');
      expect(typeof endpoint.resiliency.retry.factor).toBe('number');
      expect(typeof endpoint.resiliency.retry.minTimeout).toBe('number');
      expect(typeof endpoint.resiliency.retry.randomize).toBe('boolean');

      // Circuit Breaker config
      expect(endpoint.resiliency.circuitBreaker).toBeTypeOf('object');
      expect(endpoint.resiliency.circuitBreaker).not.toBeNull();
      expect(typeof endpoint.resiliency.circuitBreaker.timeout).toBe('number');
      expect(endpoint.resiliency.circuitBreaker.errorThresholdPercentage).toBe('number');
      expect(endpoint.resiliency.circuitBreaker.resetTimeout).toBe('number');
    });
  });

  describe('Specific Model Configuration: gemini-2.5-flash', () => {
    const geminiEndpoint = aiEndpoints.find(e => e.title === 'gemini-2.5-flash');

    it('should be defined in the configuration array', () => {
      expect(geminiEndpoint).toBeDefined();
    });

    it('should be enabled and set as the default model', () => {
      expect(geminiEndpoint.enabled).toBe(true);
      expect(geminiEndpoint.default).toBe(true);
    });

    it('should have correct context-bound API paths', () => {
      // This test ensures that the endpoints for a specific model are correctly namespaced,
      // preventing context-boundary issues where one model's requests are sent to another's endpoint.
      expect(geminiEndpoint.add).toBe('/gemini/get-response');
      expect(geminiEndpoint.history).toBe('/gemini/get-response-from-db/');
      expect(geminiEndpoint.delete).toBe('/gemini/delete-all-response-from-db/');
    });

    it('should have role-based access configured for all standard roles', () => {
      // This test verifies the configuration that a role-checking middleware would consume.
      // It ensures the intended access control policy is correctly defined for this model.
      const expectedRoles = ['super_admin', 'admin', 'manager', 'user'];
      expect(geminiEndpoint.allowedRoles).toEqual(expect.arrayContaining(expectedRoles));
      expect(geminiEndpoint.allowedRoles.length).toBe(expectedRoles.length);
    });

    it('should have specific usage costs defined', () => {
      expect(geminiEndpoint.usage.costPerRequest).toBe(1);
      expect(geminiEndpoint.usage.costPerInputToken).toBe(0.0001);
      expect(geminiEndpoint.usage.costPerOutputToken).toBe(0.0003);
    });

    it('should have specific resiliency settings defined', () => {
      expect(geminiEndpoint.resiliency.timeout).toBe(30000);
      expect(geminiEndpoint.resiliency.retry.retries).toBe(2);
      expect(geminiEndpoint.resiliency.circuitBreaker.errorThresholdPercentage).toBe(50);
    });
  });
});