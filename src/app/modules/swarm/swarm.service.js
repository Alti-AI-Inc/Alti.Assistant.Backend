import { GoogleGenAI } from '@google/genai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { SynapseRouter } from './synapseRouter.js';
import { GcpNativeService } from '../gcp_native/gcp-native.service.js';
import { isExploriumAgent, getExploriumContext } from './explorium.smart.router.js';

const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

// Agents with these tools get Google Search Grounding automatically
const SEARCH_TOOLS = ['google-search', 'web-search', 'youtube-search'];
const needsSearchGrounding = (agent) =>
  agent.tools && agent.tools.some(t => SEARCH_TOOLS.includes(t));

/**
 * Extracts structured citation sources from Gemini grounding metadata.
 * Returns an array of { index, url, title, domain } objects.
 */
const extractGroundingCitations = (response) => {
  const candidate = response?.candidates?.[0];
  const meta = candidate?.groundingMetadata;
  if (!meta) return [];

  const chunks = meta.groundingChunks || [];
  return chunks.map((chunk, i) => ({
    index: i + 1,
    url: chunk.web?.uri || '',
    title: chunk.web?.title || `Source ${i + 1}`,
    domain: chunk.web?.uri ? new URL(chunk.web.uri).hostname.replace('www.', '') : '',
  })).filter(c => c.url);
};

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
      } else if (isPrimary && isExploriumAgent(agent.id)) {
        // ⚡ Explorium data pre-injection: fetch live B2B data and ground the prompt
        try {
          const exploriumContext = await getExploriumContext(agent.id, query, conversationHistory);
          if (exploriumContext) {
            finalPrompt = `${query}${exploriumContext}`;
            console.log(`📡 Explorium Smart Router: Injected live data for agent [${agent.id}]`);
          }
        } catch (expErr) {
          console.error('📡 Explorium Smart Router: Pre-injection failed (sync):', expErr.message);
        }
      }

      // Determine if this agent needs live web grounding
      const useGrounding = needsSearchGrounding(agent);

      if (useGrounding) {
        // ═══ GOOGLE SEARCH GROUNDING PATH (Perplexity-killer mode) ═══
        // Use @google/genai SDK which supports tools: [{ googleSearch: {} }]
        console.log(`🔍 Search Grounding ENABLED for agent [${agent.name}]`);

        const groundedResult = await ai.models.generateContent({
          model: agent.model || 'gemini-3.5-flash',
          contents: finalPrompt,
          config: {
            temperature: 0.05, // Near-zero for maximum factual accuracy
            maxOutputTokens: isExploriumAgent(agent.id) ? 6000 : 4000,
            systemInstruction: agent.systemInstruction,
            tools: [{ googleSearch: {} }],
          },
        });

        const candidate = groundedResult.candidates?.[0];
        const text = candidate?.content?.parts
          ?.filter((part) => part.text && !part.thought)
          ?.map((part) => part.text)
          ?.join('') || '';

        // Extract real citations from Google Search Grounding metadata
        const citations = extractGroundingCitations(groundedResult);
        if (citations.length > 0) {
          console.log(`📎 Extracted ${citations.length} grounded citations for agent [${agent.name}]`);
        }

        accumulatedText = text;
        currentContextInput = text;

        return {
          reply: text,
          citations,
          groundingMetadata: candidate?.groundingMetadata || null,
          webSearchQueries: candidate?.groundingMetadata?.webSearchQueries || [],
        };
      }

      // ═══ STANDARD PATH (no web search needed) ═══
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
          temperature: isPrimary ? 0.15 : 0.05,
          maxOutputTokens: isExploriumAgent(agent.id) ? 6000 : 4000
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
      } else if (isPrimary && isExploriumAgent(agent.id)) {
        // ⚡ Explorium data pre-injection: fetch live B2B data and ground the prompt
        try {
          const exploriumContext = await getExploriumContext(agent.id, query, conversationHistory);
          if (exploriumContext) {
            finalPrompt = `${query}${exploriumContext}`;
            console.log(`📡 Explorium Smart Router: Injected live data for agent [${agent.id}]`);
            yield {
              type: 'agent_data_fetched',
              agent: { id: agent.id, name: agent.name }
            };
          }
        } catch (expErr) {
          console.error('📡 Explorium Smart Router: Pre-injection failed:', expErr.message);
        }
      }

      try {
        // Determine if this agent needs live web grounding
        const useGrounding = needsSearchGrounding(agent);
        let streamResult;
        let groundedCitations = [];

        if (useGrounding) {
          // ═══ GROUNDED STREAMING PATH (Perplexity-killer mode) ═══
          console.log(`🔍 Search Grounding ENABLED (streaming) for agent [${agent.name}]`);

          // Use non-streaming grounded call, then yield result as chunks
          // (Google Search Grounding does not support streaming yet in @google/genai)
          const groundedResult = await ai.models.generateContent({
            model: agent.model || 'gemini-3.5-flash',
            contents: finalPrompt,
            config: {
              temperature: 0.05,
              maxOutputTokens: isExploriumAgent(agent.id) ? 6000 : 4000,
              systemInstruction: agent.systemInstruction,
              tools: [{ googleSearch: {} }],
            },
          });

          const candidate = groundedResult.candidates?.[0];
          const fullText = candidate?.content?.parts
            ?.filter((part) => part.text && !part.thought)
            ?.map((part) => part.text)
            ?.join('') || '';

          groundedCitations = extractGroundingCitations(groundedResult);
          if (groundedCitations.length > 0) {
            console.log(`📎 Extracted ${groundedCitations.length} citations for agent [${agent.name}]`);
          }

          // Simulate streaming by chunking the grounded response
          const chunkSize = 80;
          for (let i = 0; i < fullText.length; i += chunkSize) {
            const textChunk = fullText.substring(i, i + chunkSize);
            yield {
              type: 'text',
              content: textChunk,
              agentId: agent.id
            };
          }

          accumulatedText += isPrimary ? fullText : `\n\n${fullText}`;
          currentContextInput = fullText;

          // Yield grounding citations as metadata
          if (groundedCitations.length > 0) {
            yield {
              type: 'metadata',
              citations: groundedCitations,
              webSearchQueries: candidate?.groundingMetadata?.webSearchQueries || [],
              searchEntryPoint: candidate?.groundingMetadata?.searchEntryPoint || null,
              timestamp: Date.now()
            };
          }

        } else {
          // ═══ STANDARD STREAMING PATH ═══
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

          streamResult = await modelInstance.generateContentStream({
            contents,
            generationConfig: {
              temperature: isPrimary ? 0.15 : 0.05,
              maxOutputTokens: isExploriumAgent(agent.id) ? 6000 : 4000
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

          // Append output seamlessly without technical headers
          accumulatedText += isPrimary ? agentTextAccumulator : `\n\n${agentTextAccumulator}`;
          
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
        } // end else (standard streaming path)

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
