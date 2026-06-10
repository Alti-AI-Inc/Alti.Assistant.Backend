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

const agentTypes = ['fixer', 'tester', 'optimizer', 'documenter'];
const activeProcesses = [];

console.log('====================================================');
console.log('         LAUNCHING AUTONOMOUS SWARM ORCHESTRATOR    ');
console.log('                 16 AGENTS ACTIVE SWARM             ');
console.log('====================================================');

// Spawn 16 worker processes
for (const zoneId of Object.keys(zones)) {
  const modules = zones[zoneId];
  
  for (const type of agentTypes) {
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
      // Restart logic after crash
      setTimeout(() => {
        // Re-spawn
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

console.log(`Successfully spawned all 16 workers! Monitoring logs...`);

// Graceful cleanup
process.on('SIGINT', () => {
  console.log('Stopping all swarm workers...');
  for (const child of activeProcesses) {
    child.kill();
  }
  process.exit();
});
