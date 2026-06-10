import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workerPath = path.resolve(__dirname, './worker.js');

// Define the 4 zones dividing the src/app/modules/
const zones = {
  '1': [
    'conversations', 'chatbots', 'forum', 'composio_v2', 'composio', 
    'composio_simple', 'mcp_toolbox', 'auth', 'social-login', 'admin', 'tenant'
  ],
  '2': [
    'Llama4', 'aiModelServices', 'browserUse', 'cyberdesk', 
    'gemini', 'groq', 'langchain', 'llamaindex', 'openAi', 'qwen', 
    'togetherAi', 'swarm', 'orchestrator'
  ],
  '3': [
    'article_writer', 'brainstorm', 'plan_generator', 'document_drafting', 
    'writing', 'creative_writing', 'document_analysis', 'document_review', 
    'image', 'enhanced_image', 'video', 'transcription', 'wishper', 
    'apisports', 'aviationstack', 'google_search', 'serper', 'tavily', 
    'realestate', 'presentation', 'report', 'summary', 'translation'
  ],
  '4': [
    'workflow_automation', 'workflow_storage', 'temporal', 'knowledge_bank', 
    'knowledgebase', 'knowledge', 'datasets', 'deep_research', 'explorium', 
    'legal_contract', 'legal_contract_review', 'massive', 'notes', 
    'notification', 'payment', 'stripe', 'subscription', 'support', 
    'usage', 'code', 'docker', 'gcp_native', 'predictiondata', 'streaming'
  ]
};

const zoneAgents = {
  '1': ['fixer', 'tester', 'optimizer', 'documenter', 'manager_agent', 'security_agent', 'gcp_secret_agent', 'gcp_iam_agent'],
  '2': ['fixer', 'tester', 'optimizer', 'documenter', 'owner_agent', 'telemetry_agent', 'gcp_logging_agent', 'vertex_safety_agent'],
  '3': ['fixer', 'tester', 'optimizer', 'documenter', 'user_agent', 'ratelimit_agent', 'gcp_storage_agent', 'gcp_health_agent'],
  '4': ['fixer', 'tester', 'optimizer', 'documenter', 'admin_agent', 'patch_agent', 'gcp_pubsub_agent', 'gcp_db_agent']
};
const activeProcesses = [];

console.log('====================================================');
console.log('         LAUNCHING AUTONOMOUS SWARM ORCHESTRATOR    ');
console.log('                 32 AGENTS ACTIVE SWARM             ');
console.log('====================================================');

// Spawn 20 worker processes
for (const zoneId of Object.keys(zones)) {
  const modules = zones[zoneId];
  const agents = zoneAgents[zoneId];
  
  for (const type of agents) {
    console.log(`Spawning Agent [${type.toUpperCase()}] for Zone [${zoneId}]...`);
    
    const child = fork(workerPath, [], {
      env: {
        ...process.env,
        AGENT_TYPE: type,
        ZONE_ID: zoneId,
        ASSIGNED_MODULES: JSON.stringify(modules)
      }
    });

    child.on('exit', (code) => {
      console.warn(`Worker [${type.toUpperCase()}] for Zone [${zoneId}] exited with code ${code}. Restarting in 10s...`);
      setTimeout(() => {
        const newChild = fork(workerPath, [], {
          env: {
            ...process.env,
            AGENT_TYPE: type,
            ZONE_ID: zoneId,
            ASSIGNED_MODULES: JSON.stringify(modules)
          }
        });
        activeProcesses.push(newChild);
      }, 10000);
    });

    activeProcesses.push(child);
  }
}

console.log(`Successfully spawned all 28 workers! Monitoring logs...`);

// Graceful cleanup
process.on('SIGINT', () => {
  console.log('Stopping all swarm workers...');
  for (const child of activeProcesses) {
    child.kill();
  }
  process.exit();
});
