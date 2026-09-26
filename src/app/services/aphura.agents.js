import { AphuraDeepResearchAgent } from './research.service.js';
import { AphuraMonitorEngine } from './monitor.service.js';
import { AphuraWorkflowEngine } from './workflow.service.js';

export const APHURA_CUSTOM_AGENTS = [
  {
    type: 'function',
    function: {
      name: 'aphura_deep_research',
      description: 'Executes a comprehensive, multi-step deep research pass on the web using Exa.ai and Composio. Synthesizes massive amounts of data into a cited report.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The deep research query or topic.' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'aphura_monitor_changes',
      description: 'Monitors a specific URL for semantic DOM changes using ZenRows Omni-Extractor and an LLM-based diffing engine.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The target URL to monitor.' },
          cssSelector: { type: 'string', description: 'Optional CSS selector to extract specific data.' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'aphura_automate_workflow',
      description: 'Compiles a natural language instruction into a Directed Acyclic Graph (DAG) and executes it using parallel autonomous agents.',
      parameters: {
        type: 'object',
        properties: {
          instruction: { type: 'string', description: 'The complex multi-step workflow instruction.' }
        },
        required: ['instruction']
      }
    }
  }
];

export async function executeAphuraAgent(name, args, options = {}) {
  if (name === 'aphura_deep_research') {
    const res = await AphuraDeepResearchAgent.executeOmniResearch(args.query, options);
    return JSON.stringify(res);
  }
  
  if (name === 'aphura_monitor_changes') {
    const res = await AphuraMonitorEngine.checkChanges(args.url, null, null, { cssSelector: args.cssSelector, ...options });
    return JSON.stringify(res);
  }

  if (name === 'aphura_automate_workflow') {
    const res = await AphuraWorkflowEngine.executeWorkflow(args.instruction, options);
    return JSON.stringify(res);
  }

  throw new Error(`Agent tool ${name} not found.`);
}
