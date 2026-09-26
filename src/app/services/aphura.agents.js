import { AphuraDeepResearchAgent } from './research.service.js';
import { scraperService } from './scraper.service.js';

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
      description: 'Monitors a specific URL for semantic DOM changes or rips target CSS data using ZenRows Omni-Extractor (God Mode / Anti-Bot Bypass).',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The target URL to monitor or scrape.' },
          cssSelector: { type: 'string', description: 'Optional CSS selector to extract specific data.' },
          mode: { type: 'string', enum: ['god_mode', 'lightning'], description: 'Extraction mode. God mode bypasses antibot.' }
        },
        required: ['url']
      }
    }
  }
];

export async function executeAphuraAgent(name, args) {
  if (name === 'aphura_deep_research') {
    const res = await AphuraDeepResearchAgent.executeOmniResearch(args.query);
    return JSON.stringify(res);
  }
  
  if (name === 'aphura_monitor_changes') {
    const { url, cssSelector, mode } = args;
    if (mode === 'lightning') {
      const res = await scraperService.extractLightning(url, { cssSelector });
      return JSON.stringify(res);
    } else {
      const res = await scraperService.extractGodMode(url, { cssSelector });
      return JSON.stringify(res);
    }
  }

  throw new Error(`Agent tool ${name} not found.`);
}
