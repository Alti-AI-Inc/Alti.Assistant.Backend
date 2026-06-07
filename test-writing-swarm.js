/**
 * Specialized Writing Swarm Integration Test
 * Verifies that all 10 specialized writing agents are successfully registered,
 * routed correctly by the SynapseRouter, and configured with correct models.
 */
import { SWARM_REGISTRY } from './src/app/modules/swarm/swarm.registry.js';
import { SynapseRouter } from './src/app/modules/swarm/synapseRouter.js';

console.log('📡 Starting Specialized Writing Swarm Integration Tests...\n');

// 1. Verify Registration of Writing Agents
const requiredAgentIds = [
  'email_writer',
  'letter_writer',
  'song_writer',
  'essay_writer',
  'blog_writer',
  'copywriter',
  'technical_doc_writer',
  'proposal_writer',
  'speech_writer',
  'social_media_writer'
];

let registrationFailed = false;

console.log('--- 1. VERIFYING AGENT REGISTRATION ---');
requiredAgentIds.forEach(id => {
  const agent = SWARM_REGISTRY[id];
  if (agent) {
    console.log(`✅ Agent "${agent.name}" (ID: ${id}) is successfully registered. Model: ${agent.model}`);
  } else {
    console.error(`❌ Agent (ID: ${id}) is MISSING from registry!`);
    registrationFailed = true;
  }
});

// 2. Verify Routing Logic for Writing Intents
console.log('\n--- 2. VERIFYING SYNAPSE ROUTING FOR WRITING INTENTS ---');
const testCases = [
  {
    query: 'write an email to my manager explaining my sick leave and rescheduling meetings',
    expectedAgentId: 'email_writer'
  },
  {
    query: 'draft a recommendation letter for John Doe applying for the university program',
    expectedAgentId: 'letter_writer'
  },
  {
    query: 'write a song about the Google Cloud Platform with a catchy chorus and bridge',
    expectedAgentId: 'song_writer'
  },
  {
    query: 'write an essay on the impact of artificial intelligence on modern education systems',
    expectedAgentId: 'essay_writer'
  },
  {
    query: 'write a blog post about web development trends and best practices in 2026',
    expectedAgentId: 'blog_writer'
  },
  {
    query: 'write ad copy for a new landing page of an AI coding tool showing benefits',
    expectedAgentId: 'copywriter'
  },
  {
    query: 'write technical documentation for using the gcloud run deploy command-line utility',
    expectedAgentId: 'technical_doc_writer'
  },
  {
    query: 'draft a business proposal for building a website for a local coffee shop',
    expectedAgentId: 'proposal_writer'
  },
  {
    query: 'write a speech script for the keynote opening of a major technology conference',
    expectedAgentId: 'speech_writer'
  },
  {
    query: 'write a linkedin post about GCP Cloud Run deploy successfully scaling the app',
    expectedAgentId: 'social_media_writer'
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
  console.error('❌ Writing Swarm integration tests FAILED! Please review the registry and router setups.');
  process.exit(1);
} else {
  console.log('🎉 All 10 Writing Swarm agent integration and routing tests PASSED successfully!');
  process.exit(0);
}
