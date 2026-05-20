import { GoogleGenAI } from '@google/genai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { SynapseRouter } from './synapseRouter.js';
import { GcpNativeService } from '../gcp_native/gcp-native.service.js';

const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

export class SwarmService {
  /**
   * Executes the collaborative agent swarm synchronously and returns the final response.
   * @param {string} query - Raw user query
   * @param {Array} conversationHistory - Previous conversation context
   * @returns {Object} Final accumulated response object with reply string
   */
  static async executeSwarmSync(query, conversationHistory = []) {
    console.log(`📡 Swarm Engine (Sync): Building execution pipeline for query "${query}"`);
    const pipeline = SynapseRouter.buildExecutionPipeline(query);
    let currentContextInput = query;
    let accumulatedText = '';

    for (let index = 0; index < pipeline.chain.length; index++) {
      const agent = pipeline.chain[index];
      const isPrimary = index === 0;

      let customGcpGroundingBlock = '';
      if (agent.id === 'gcp_grounding') {
        try {
          const searchResult = await GcpNativeService.searchGcpCatalog(query, { limit: 5 });
          if (searchResult.success && searchResult.results.length > 0) {
            customGcpGroundingBlock = `
[GROUNDED REPOSITORIES FOUND IN 1,388 GCP CATALOG]
${searchResult.results.map((repo, idx) => `
Repository #${idx + 1}:
- Name: ${repo.name}
- Language: ${repo.language}
- Stars: ${repo.stars}
- License: ${repo.license}
- GitHub URL: ${repo.html_url}
- Clone: git clone ${repo.clone_url}
- Description: ${repo.description || 'No description provided.'}
`).join('\n')}
`;
          }
        } catch (err) {
          console.error('Swarm GCP Grounder Sync Error:', err);
        }
      }

      let finalPrompt = currentContextInput;
      if (!isPrimary) {
        finalPrompt = `You are a secondary processing agent in the pipeline.
Previous Agent Outputs:
${accumulatedText}

User Query: ${query}

Your Specific Task: ${agent.description}
Instructions: ${agent.systemInstruction}`;
      } else if (customGcpGroundingBlock) {
        finalPrompt = `${customGcpGroundingBlock}\n\nUser Request: ${query}`;
      }

      const modelInstance = genAI.getGenerativeModel({
        model: agent.model || 'gemini-3.5-flash',
        systemInstruction: agent.systemInstruction
      });

      const contents = [
        ...conversationHistory.map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        })),
        {
          role: 'user',
          parts: [{ text: finalPrompt }]
        }
      ];

      const result = await modelInstance.generateContent({
        contents,
        generationConfig: {
          temperature: isPrimary ? 0.2 : 0.1,
          maxOutputTokens: 4000
        }
      });

      const text = result?.response?.text() || '';
      accumulatedText = text;
      currentContextInput = text;
    }

    return { reply: accumulatedText };
  }

  /**
   * Executes a collaborative multi-agent execution pipeline streaming SSE chunks to the client.
   * @param {string} query - Raw user query
   * @param {Array} conversationHistory - Previous conversation context
   * @yields {Object} Chunks containing streaming text, thoughts, or metadata
   */
  static async* executeSwarmStream(query, conversationHistory = []) {
    console.log(`📡 Swarm Engine: Building execution pipeline for query "${query}"`);
    
    const pipeline = SynapseRouter.buildExecutionPipeline(query);
    console.log(`📡 Swarm Pipeline: Dynamic Chain composed of [${pipeline.chain.map(a => a.name).join(' -> ')}]`);

    let currentContextInput = query;
    let accumulatedText = '';
    
    // Process each agent in the dynamic execution chain
    for (let index = 0; index < pipeline.chain.length; index++) {
      const agent = pipeline.chain[index];
      const isPrimary = index === 0;
      const isLast = index === pipeline.chain.length - 1;

      console.log(`📡 Swarm Executor: Running agent [${agent.name}] (${index + 1}/${pipeline.chain.length})`);

      // Yield a separator or agent header chunk to inform the client of active transitions
      yield {
        type: 'agent_start',
        agent: {
          id: agent.id,
          name: agent.name,
          isPrimary
        }
      };

      // Perform pre-execution checks (e.g. searching the GCP catalog if this is the GCP Grounder)
      let customGcpGroundingBlock = '';
      let gcpCatalogReferences = [];

      if (agent.id === 'gcp_grounding') {
        try {
          const searchResult = await GcpNativeService.searchGcpCatalog(query, { limit: 5 });
          if (searchResult.success && searchResult.results.length > 0) {
            console.log(`📡 Swarm GCP Grounder: Found ${searchResult.results.length} GCP repos`);
            gcpCatalogReferences = searchResult.results.map(repo => ({
              url: repo.html_url,
              domain: 'github.com/GoogleCloudPlatform',
              title: `${repo.name} (${repo.language}) - ${repo.license} License`,
              clone_url: repo.clone_url,
              stars: repo.stars,
              forks: repo.forks,
              description: repo.description
            }));

            customGcpGroundingBlock = `
[GROUNDED REPOSITORIES FOUND IN 1,388 GCP CATALOG]
${searchResult.results.map((repo, idx) => `
Repository #${idx + 1}:
- Name: ${repo.name}
- Language: ${repo.language}
- Stars: ${repo.stars}
- License: ${repo.license}
- GitHub URL: ${repo.html_url}
- Clone: git clone ${repo.clone_url}
- Description: ${repo.description || 'No description provided.'}
`).join('\n')}
`;
          }
        } catch (err) {
          console.error('📡 Swarm GCP Grounder Error:', err);
        }
      }

      // If we are executing a secondary agent, we feed the accumulated outputs from previous agents
      let finalPrompt = currentContextInput;
      if (!isPrimary) {
        finalPrompt = `You are a secondary processing agent in the pipeline.
Previous Agent Outputs:
${accumulatedText}

User Query: ${query}

Your Specific Task: ${agent.description}
Instructions: ${agent.systemInstruction}`;
      } else if (customGcpGroundingBlock) {
        finalPrompt = `${customGcpGroundingBlock}\n\nUser Request: ${query}`;
      }

      try {
        // Instantiate the specific model via Gemini SDK
        const modelInstance = genAI.getGenerativeModel({
          model: agent.model || 'gemini-3.5-flash',
          systemInstruction: agent.systemInstruction
        });

        // Setup message inputs
        const contents = [
          ...conversationHistory.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
          })),
          {
            role: 'user',
            parts: [{ text: finalPrompt }]
          }
        ];

        // Call streaming generation API
        const streamResult = await modelInstance.generateContentStream({
          contents,
          generationConfig: {
            temperature: isPrimary ? 0.2 : 0.1,
            maxOutputTokens: 4000
          }
        });

        let agentTextAccumulator = '';

        for await (const chunk of streamResult.stream) {
          const textChunk = chunk.text();
          if (textChunk) {
            agentTextAccumulator += textChunk;
            
            // Stream text chunk to client in real-time
            yield {
              type: 'text',
              content: textChunk,
              agentId: agent.id
            };
          }
        }

        // Add separator spacing for final accumulated text structure
        accumulatedText += `\n\n### [Output from ${agent.name}]\n${agentTextAccumulator}`;
        
        // Feed accumulated context into the next step
        currentContextInput = agentTextAccumulator;

        // If this agent matched GCP Grounding catalog, yield references in metadata chunk
        if (gcpCatalogReferences.length > 0) {
          yield {
            type: 'metadata',
            reference: gcpCatalogReferences,
            citations: gcpCatalogReferences.map((repo, index) => ({
              index: index + 1,
              url: repo.url,
              domain: repo.domain,
              title: repo.title
            })),
            timestamp: Date.now()
          };
        }

      } catch (err) {
        console.error(`📡 Swarm Executor: Error running agent [${agent.name}]:`, err);
        yield {
          type: 'text',
          content: `\n\n⚠️ *Error in agent pipeline [${agent.name}]: ${err.message}*`,
          agentId: agent.id
        };
      }

      yield {
        type: 'agent_end',
        agentId: agent.id
      };
    }

    console.log(`📡 Swarm Engine: Completed execution chain of ${pipeline.chain.length} agents successfully.`);
  }
}
