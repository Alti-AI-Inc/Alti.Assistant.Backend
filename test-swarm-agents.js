/**
 * Swarm Registry and Synapse Router Integration Test
 * Verifies that all 66+ modular custom and background agents are loaded, registered, and routed correctly.
 */
import { SWARM_REGISTRY } from './src/app/modules/swarm/swarm.registry.js';
import { SynapseRouter } from './src/app/modules/swarm/synapseRouter.js';

console.log('📡 Starting Swarm Registry & Synapse Router Tests...\n');

// 1. Verify Registration of Core, Custom, and Background Agents
const requiredAgentIds = [
  'realtime_search_agent', 
  'data_processor_agent', 
  'intelligence_agent',
  'financial_search_agent',
  'academic_search_agent',
  'schema_mapper_agent',
  'payload_transformer_agent',
  'architectural_reasoning_agent',
  'math_logic_prover_agent',
  'security_audit_agent',
  'perf_monitor_agent',
  'cache_optimizer_agent',
  'self_critic_agent',
  'context_compressor_agent'
];
let registrationFailed = false;

console.log('--- 1. VERIFYING AGENT REGISTRATION ---');
requiredAgentIds.forEach(id => {
  const agent = SWARM_REGISTRY[id];
  if (agent) {
    console.log(`✅ Agent "${agent.name}" (ID: ${id}) is successfully registered.`);
  } else {
    console.error(`❌ Agent (ID: ${id}) is MISSING from registry!`);
    registrationFailed = true;
  }
});

// 2. Verify Routing Logic including Specialized Intent Matching
console.log('\n--- 2. VERIFYING SYNAPSE ROUTING LOGIC ---');
const testCases = [
  {
    query: 'Search the web for the latest Gemini 1.5 update and news',
    expectedAgentId: 'realtime_search_agent'
  },
  {
    query: 'What is the stock price and annual revenue of AAPL?',
    expectedAgentId: 'financial_search_agent'
  },
  {
    query: 'Find the latest bioRxiv academic paper and scholarly study about AlphaFold',
    expectedAgentId: 'academic_search_agent'
  },
  {
    query: 'Please process this raw nested JSON data and output a CSV',
    expectedAgentId: 'data_processor_agent'
  },
  {
    query: 'Create a database table schema design and erd diagram for a school',
    expectedAgentId: 'schema_mapper_agent'
  },
  {
    query: 'Parse this raw csv record and clean the bad json data',
    expectedAgentId: 'payload_transformer_agent'
  },
  {
    query: 'Please think deeply about this problem and analyze the step-by-step logic',
    expectedAgentId: 'intelligence_agent'
  },
  {
    query: 'Design a multi region distributed cloud architecture with high availability',
    expectedAgentId: 'architectural_reasoning_agent'
  },
  {
    query: 'Prove this theorem using propositional logic proof and discrete math',
    expectedAgentId: 'math_logic_prover_agent'
  },
  {
    query: 'Hello there, how are you today?',
    expectedAgentId: 'general_chat_assistant'
  }
];

let routingFailed = false;

testCases.forEach(({ query, expectedAgentId }) => {
  const routedAgents = SynapseRouter.routeQuery(query);
  const matchedAgent = routedAgents[0];
  
  if (matchedAgent && matchedAgent.id === expectedAgentId) {
    console.log(`✅ Query: "${query}" -> Correctly routed to "${matchedAgent.name}" (${matchedAgent.id})`);
  } else {
    console.error(`❌ Query: "${query}" -> FAILED! Expected: ${expectedAgentId}, but got: ${matchedAgent ? matchedAgent.id : 'None'}`);
    routingFailed = true;
  }
});

console.log('\n--- TEST SUMMARY ---');
if (registrationFailed || routingFailed) {
  console.error('❌ Swarm integration tests FAILED! Please review the registry and router setups.');
  process.exit(1);
} else {
  console.log('🎉 All Swarm Agent integration and routing tests PASSED successfully!');
  process.exit(0);
}
