import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GcpA2aService } from './gcp-a2a.service.js';

// Mock the logger dependency
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from '../../../shared/logger.js';

describe('GcpA2aService', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('generateA2aSystemPrompt', () => {
    it('should return a string representing the A2A system prompt', () => {
      const prompt = GcpA2aService.generateA2aSystemPrompt();

      expect(typeof prompt).toBe('string');
      expect(prompt).toContain('=== GOOGLE AGENT-TO-AGENT (A2A) SWARM COMMUNICATIONS STANDARD ===');
      expect(prompt).toContain('<a2a-packet>');
      expect(prompt).toContain('</a2a-packet>');
      expect(prompt).toContain('"sender": "PlannerAgent"');
      expect(prompt).toContain('"recipient": "CoderAgent"');
      expect(prompt).toContain('"action": "execute_code_generation"');
      expect(prompt).toContain('=== COLLABORATION AND SECURITY RULES ===');
      expect(logger.info).toHaveBeenCalledWith('GCP A2A: Compiling system prompt specifications for Google Agent-to-Agent swarm workflows...');
    });
  });

  describe('parseAndValidateA2a', () => {
    it('should return an error if rawText is empty or null', () => {
      const result = GcpA2aService.parseAndValidateA2a('');
      expect(result.success).toBe(false);
      expect(result.containsPacket).toBe(true); // The error is about the input, not lack of packet
      expect(result.errors).toEqual(['Raw A2A conversation block is empty.']);
      expect(result.packet).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('GCP A2A Parsing Exception:', expect.any(Error));
    });

    it('should indicate no packet detected if rawText does not contain <a2a-packet> tags', () => {
      const rawText = 'This is some random text without any A2A packet.';
      const result = GcpA2aService.parseAndValidateA2a(rawText);

      expect(result.success).toBe(true);
      expect(result.containsPacket).toBe(false);
      expect(result.message).toBe('No Agent-to-Agent (A2A) packet detected in response stream.');
      expect(result.packet).toBeNull();
      expect(logger.info).toHaveBeenCalledWith('GCP A2A: Locating and parsing <a2a-packet> XML block...');
      expect(logger.info).not.toHaveBeenCalledWith('GCP A2A: Running strict packet schema validation checks...');
    });

    it('should successfully parse and validate a well-formed A2A packet', () => {
      const rawText = `
        Some introductory text.
        <a2a-packet>
          {
            "sender": "AgentA",
            "recipient": "AgentB",
            "seqId": "seq_123",
            "securityToken": "sec_token_valid_2024",
            "payload": {
              "action": "perform_task",
              "parameters": {
                "data": "some_data"
              }
            }
          }
        </a2a-packet>
        Some concluding text.
      `;
      const result = GcpA2aService.parseAndValidateA2a(rawText);

      expect(result.success).toBe(true);
      expect(result.containsPacket).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.packet).toEqual({
        sender: 'AgentA',
        recipient: 'AgentB',
        seqId: 'seq_123',
        securityToken: 'sec_token_valid_2024',
        payload: {
          action: 'perform_task',
          parameters: {
            data: 'some_data'
          }
        }
      });
      expect(logger.info).toHaveBeenCalledWith('GCP A2A: Locating and parsing <a2a-packet> XML block...');
      expect(logger.info).toHaveBeenCalledWith('GCP A2A: Running strict packet schema validation checks...');
      expect(logger.info).toHaveBeenCalledWith('GCP A2A: Packet header verification completed successfully. Packet is secure.');
    });

    it('should successfully parse and validate an A2A packet with ```json markdown', () => {
      const rawText = `
        <a2a-packet>
          \`\`\`json
          {
            "sender": "AgentA",
            "recipient": "AgentB",
            "seqId": "seq_123",
            "securityToken": "sec_token_valid_2024",
            "payload": {
              "action": "perform_task",
              "parameters": {
                "data": "some_data"
              }
            }
          }
          \`\`\`
        </a2a-packet>
      `;
      const result = GcpA2aService.parseAndValidateA2a(rawText);

      expect(result.success).toBe(true);
      expect(result.containsPacket).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.packet).toEqual({
        sender: 'AgentA',
        recipient: 'AgentB',
        seqId: 'seq_123',
        securityToken: 'sec_token_valid_2024',
        payload: {
          action: 'perform_task',
          parameters: {
            data: 'some_data'
          }
        }
      });
    });

    it('should return errors for missing mandatory headers', () => {
      const rawText = `
        <a2a-packet>
          {
            "payload": {
              "action": "perform_task",
              "parameters": {}
            }
          }
        </a2a-packet>
      `;
      const result = GcpA2aService.parseAndValidateA2a(rawText);

      expect(result.success).toBe(false);
      expect(result.containsPacket).toBe(true);
      expect(result.errors).toEqual([
        'A2A Packet missing mandatory header: "sender"',
        'A2A Packet missing mandatory header: "recipient"',
        'A2A Packet missing mandatory header: "seqId"',
        'A2A Packet missing mandatory header: "securityToken"',
      ]);
      expect(result.packet).toEqual({
        payload: {
          action: 'perform_task',
          parameters: {}
        }
      });
      expect(logger.warn).toHaveBeenCalledWith('GCP A2A: Packet verification failed with 4 validation errors.');
    });

    it('should return errors for missing payload action and invalid parameters', () => {
      const rawText = `
        <a2a-packet>
          {
            "sender": "AgentA",
            "recipient": "AgentB",
            "seqId": "seq_123",
            "securityToken": "sec_token_valid_2024",
            "payload": {
              "parameters": "not_an_object"
            }
          }
        </a2a-packet>
      `;
      const result = GcpA2aService.parseAndValidateA2a(rawText);

      expect(result.success).toBe(false);
      expect(result.containsPacket).toBe(true);
      expect(result.errors).toEqual([
        'A2A payload missing "action" definition.',
        'A2A payload "parameters" must be a valid structured object.',
      ]);
      expect(result.packet).toEqual({
        sender: 'AgentA',
        recipient: 'AgentB',
        seqId: 'seq_123',
        securityToken: 'sec_token_valid_2024',
        payload: {
          parameters: 'not_an_object'
        }
      });
      expect(logger.warn).toHaveBeenCalledWith('GCP A2A: Packet verification failed with 2 validation errors.');
    });

    it('should return an error for an invalid security token format', () => {
      const rawText = `
        <a2a-packet>
          {
            "sender": "AgentA",
            "recipient": "AgentB",
            "seqId": "seq_123",
            "securityToken": "invalid_token",
            "payload": {
              "action": "perform_task",
              "parameters": {}
            }
          }
        </a2a-packet>
      `;
      const result = GcpA2aService.parseAndValidateA2a(rawText);

      expect(result.success).toBe(false);
      expect(result.containsPacket).toBe(true);
      expect(result.errors).toEqual([
        'Security token integrity check failed: invalid signature layout.',
      ]);
      expect(result.packet).toEqual({
        sender: 'AgentA',
        recipient: 'AgentB',
        seqId: 'seq_123',
        securityToken: 'invalid_token',
        payload: {
          action: 'perform_task',
          parameters: {}
        }
      });
      expect(logger.warn).toHaveBeenCalledWith('GCP A2A: Packet verification failed with 1 validation error.');
    });

    it('should handle malformed JSON inside the A2A packet gracefully', () => {
      const rawText = `
        <a2a-packet>
          {
            "sender": "AgentA",
            "recipient": "AgentB",
            "seqId": "seq_123",
            "securityToken": "sec_token_valid_2024",
            "payload": {
              "action": "perform_task",
              "parameters": {}
            , // Trailing comma makes it invalid JSON
          }
        </a2a-packet>
      `;
      const result = GcpA2aService.parseAndValidateA2a(rawText);

      expect(result.success).toBe(false);
      expect(result.containsPacket).toBe(true);
      expect(result.errors[0]).toContain('Unexpected token'); // JSON parsing error
      expect(result.packet).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('GCP A2A Parsing Exception:', expect.any(Error));
    });
  });

  describe('formatSwarmHandoff', () => {
    it('should return a correctly formatted XML string with the A2A packet', () => {
      const fromAgent = 'Initiator';
      const toAgent = 'Receiver';
      const action = 'execute_code';
      const params = {
        language: 'python',
        code: 'print("hello")'
      };

      const formattedPacket = GcpA2aService.formatSwarmHandoff(fromAgent, toAgent, action, params);

      expect(typeof formattedPacket).toBe('string');
      expect(formattedPacket).toMatch(/^<a2a-packet>\n/);
      expect(formattedPacket).toMatch(/\n<\/a2a-packet>$/);

      const jsonString = formattedPacket.substring(
        '<a2a-packet>\n'.length,
        formattedPacket.length - '\n</a2a-packet>'.length
      );
      const packet = JSON.parse(jsonString);

      expect(packet.sender).toBe(fromAgent);
      expect(packet.recipient).toBe(toAgent);
      expect(packet.seqId).toMatch(/^seq_a2a_\d{6}$/); // Check format, not exact value
      expect(packet.securityToken).toMatch(/^sec_token_gcp_native_swarm_valid_\d{4}$/); // Check format, not exact value
      expect(packet.payload.action).toBe(action);
      expect(packet.payload.parameters).toEqual(params);
      expect(logger.info).toHaveBeenCalledWith(`GCP A2A: Packaging swarm handoff from "${fromAgent}" to "${toAgent}"...`);
    });

    it('should handle empty parameters object correctly', () => {
      const fromAgent = 'AgentX';
      const toAgent = 'AgentY';
      const action = 'status_check';

      const formattedPacket = GcpA2aService.formatSwarmHandoff(fromAgent, toAgent, action);

      const jsonString = formattedPacket.substring(
        '<a2a-packet>\n'.length,
        formattedPacket.length - '\n</a2a-packet>'.length
      );
      const packet = JSON.parse(jsonString);

      expect(packet.sender).toBe(fromAgent);
      expect(packet.recipient).toBe(toAgent);
      expect(packet.payload.action).toBe(action);
      expect(packet.payload.parameters).toEqual({});
      expect(logger.info).toHaveBeenCalledWith(`GCP A2A: Packaging swarm handoff from "${fromAgent}" to "${toAgent}"...`);
    });

    it('should generate a different seqId and securityToken each time', () => {
      const fromAgent = 'Agent1';
      const toAgent = 'Agent2';
      const action = 'test';

      const packet1 = JSON.parse(GcpA2aService.formatSwarmHandoff(fromAgent, toAgent, action).match(/<a2a-packet>([\s\S]*?)<\/a2a-packet>/i)[1]);
      const packet2 = JSON.parse(GcpA2aService.formatSwarmHandoff(fromAgent, toAgent, action).match(/<a2a-packet>([\s\S]*?)<\/a2a-packet>/i)[1]);

      expect(packet1.seqId).not.toBe(packet2.seqId);
      expect(packet1.securityToken).not.toBe(packet2.securityToken); // Year might be the same, but it's part of the dynamic generation
    });
  });
});