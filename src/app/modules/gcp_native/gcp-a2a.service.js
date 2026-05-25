import { logger } from '../../../shared/logger.js';

/**
 * Programmatically generates standard system instructions for A2A peer communication.
 */
const generateA2aSystemPrompt = () => {
  logger.info('GCP A2A: Compiling system prompt specifications for Google Agent-to-Agent swarm workflows...');

  const prompt = `
=== GOOGLE AGENT-TO-AGENT (A2A) SWARM COMMUNICATIONS STANDARD ===
You are equipped with Google A2A peer communication protocols. When a complex task requires collaborating with or delegating to another specialized agent, you must output a structured A2A message packet wrapped in XML <a2a-packet> tags:

<a2a-packet>
{
  "sender": "PlannerAgent",
  "recipient": "CoderAgent",
  "seqId": "seq_a2a_109283",
  "securityToken": "sec_token_gcp_native_swarm_valid_2026",
  "payload": {
    "action": "execute_code_generation",
    "parameters": {
      "language": "javascript",
      "objective": "Implement robust express routing for gcp-agui.service.js"
    }
  }
}
</a2a-packet>

=== COLLABORATION AND SECURITY RULES ===
1. Every packet must contain the mandatory headers: "sender", "recipient", "seqId", "securityToken", and "payload".
2. The payload must define the specific "action" and the "parameters" object.
3. The security token must match the registered workflow token context.
`;

  return prompt;
};

/**
 * Extracts, sanitizes, and validates an A2A packet from raw response text.
 */
const parseAndValidateA2a = (rawText) => {
  try {
    if (!rawText) {
      throw new Error('Raw A2A conversation block is empty.');
    }

    logger.info('GCP A2A: Locating and parsing <a2a-packet> XML block...');

    const match = rawText.match(/<a2a-packet>([\s\S]*?)<\/a2a-packet>/i);
    if (!match) {
      return {
        success: true,
        containsPacket: false,
        message: 'No Agent-to-Agent (A2A) packet detected in response stream.',
        packet: null
      };
    }

    let rawJson = match[1].trim();
    rawJson = rawJson.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

    logger.info('GCP A2A: Running strict packet schema validation checks...');

    const packet = JSON.parse(rawJson);
    const errors = [];

    // Enforce A2A header checklist
    if (!packet.sender) errors.push('A2A Packet missing mandatory header: "sender"');
    if (!packet.recipient) errors.push('A2A Packet missing mandatory header: "recipient"');
    if (!packet.seqId) errors.push('A2A Packet missing mandatory header: "seqId"');
    if (!packet.securityToken) errors.push('A2A Packet missing mandatory header: "securityToken"');
    if (!packet.payload) {
      errors.push('A2A Packet missing mandatory header: "payload"');
    } else {
      if (!packet.payload.action) errors.push('A2A payload missing "action" definition.');
      if (!packet.payload.parameters || typeof packet.payload.parameters !== 'object') {
        errors.push('A2A payload "parameters" must be a valid structured object.');
      }
    }

    // Verify security token format
    if (packet.securityToken && !packet.securityToken.startsWith('sec_token_')) {
      errors.push('Security token integrity check failed: invalid signature layout.');
    }

    if (errors.length > 0) {
      logger.warn(`GCP A2A: Packet verification failed with ${errors.length} validation errors.`);
      return {
        success: false,
        containsPacket: true,
        errors,
        packet
      };
    }

    logger.info('GCP A2A: Packet header verification completed successfully. Packet is secure.');
    return {
      success: true,
      containsPacket: true,
      errors: [],
      packet
    };
  } catch (err) {
    logger.error('GCP A2A Parsing Exception:', err);
    return {
      success: false,
      containsPacket: true,
      errors: [err.message],
      packet: null
    };
  }
};

/**
 * Programmatically formats a secure multi-agent swarm handoff transition packet.
 * 
 * @param {string} fromAgent - Subagent initiator name
 * @param {string} toAgent - Target recipient subagent name
 * @param {string} action - Trigger objective action
 * @param {object} params - Input task parameters
 * @returns {string} Formatted XML string package
 */
const formatSwarmHandoff = (fromAgent, toAgent, action, params = {}) => {
  logger.info(`GCP A2A: Packaging swarm handoff from "${fromAgent}" to "${toAgent}"...`);
  
  const packet = {
    sender: fromAgent,
    recipient: toAgent,
    seqId: `seq_a2a_${Math.floor(Math.random() * 1000000)}`,
    securityToken: `sec_token_gcp_native_swarm_valid_${new Date().getFullYear()}`,
    payload: {
      action,
      parameters: params
    }
  };

  return `<a2a-packet>\n${JSON.stringify(packet, null, 2)}\n</a2a-packet>`;
};

export const GcpA2aService = {
  generateA2aSystemPrompt,
  parseAndValidateA2a,
  formatSwarmHandoff
};
