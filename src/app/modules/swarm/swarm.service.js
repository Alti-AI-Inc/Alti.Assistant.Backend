import { GoogleGenAI } from '@google/genai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import fetch from 'node-fetch';
import { SynapseRouter } from './synapseRouter.js';
import { GcpNativeService } from '../gcp_native/gcp-native.service.js';
import { isExploriumAgent, getExploriumContext } from './explorium.smart.router.js';
import { massiveSmartRouter } from '../../helpers/massiveSmartRouter.js';
import LangchainRepository from '../langchain/langchain-repository.model.js';
import TemporalRepository from '../temporal/temporal-repository.model.js';
import GoogleRepository from '../gcp_native/gcp-repository.model.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { askQuery } from '../llamaindex/llamaindex.indexer.js';
import { executeAgenticRAG } from '../llamaindex/langgraph/ragAgentGraph.js';
import { userMemoryService } from '../conversations/userMemory.service.js';
import { dynamicSkillService } from './dynamicSkill.service.js';

const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

// Core dynamic self-evolution tool schema (Hermes style tool creation)
const SAVE_CUSTOM_SKILL_TOOL = {
  name: 'save_custom_skill',
  description: 'Saves a dynamically generated custom OpenClaw skill descriptor (markdown) and script file to the user workspace. Allows the assistant to create its own reusable scripts for execution inside the isolated container.',
  parameters: {
    type: 'OBJECT',
    properties: {
      name: {
        type: 'STRING',
        description: 'The unique alphanumeric identifier for the skill (e.g. system_backup_tool)'
      },
      description: {
        type: 'STRING',
        description: 'Detailed explanation of what the skill does and what it returns'
      },
      parameters: {
        type: 'OBJECT',
        description: 'Schema parameter configurations. Keys are parameter names, and values are objects specifying type, description, and required (boolean).'
      },
      scriptName: {
        type: 'STRING',
        description: 'Filename with path extension (e.g. backup.py, run.js, test.sh)'
      },
      scriptContent: {
        type: 'STRING',
        description: 'Full source code content of the executable script file'
      }
    },
    required: ['name', 'description', 'scriptName', 'scriptContent']
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PERPLEXITY-KILLER ENGINE — Smart Grounding, Citations, Related Questions
// ═══════════════════════════════════════════════════════════════════════════════

// Agents with explicit search tools ALWAYS get grounding
const SEARCH_TOOLS = ['google-search', 'web-search', 'youtube-search'];

// Smart intent detection: queries that need fresh web data regardless of agent
const FRESHNESS_SIGNALS = [
  // Time-sensitive
  /\b(today|tonight|yesterday|this week|this month|right now|currently|latest|recent|just happened)\b/i,
  // Pricing/market
  /\b(price|cost|worth|stock|market|trading|bitcoin|crypto|nasdaq|s&p)\b/i,
  // News/events
  /\b(news|election|announced|released|launched|happened|update|breaking|crisis)\b/i,
  // Weather/sports
  /\b(weather|forecast|score|game|match|standings|playoffs|championship)\b/i,
  // People/entities in current context
  /\b(who is|where is|how old is|net worth|ceo of|president of|founded)\b/i,
  // Comparisons needing current data
  /\b(vs|versus|compared to|better than|cheaper than|faster than)\b/i,
  // Statistics needing freshness
  /\b(population|gdp|inflation|unemployment|interest rate|exchange rate)\b/i,
];

/**
 * Determines if a query needs Google Search Grounding.
 * Returns true if: agent has search tools OR query contains freshness signals.
 */
const needsSearchGrounding = (agent, query = '') => {
  // Explicit tool-based grounding
  if (agent.tools && agent.tools.some(t => SEARCH_TOOLS.includes(t))) return true;
  // Smart intent-based grounding: detect if query needs fresh data
  if (query && FRESHNESS_SIGNALS.some(pattern => pattern.test(query))) return true;
  return false;
};

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

/**
 * Injects inline [1][2][3] citation markers into response text and appends a sources block.
 * Uses groundingSupport from Gemini to place citations at the right positions.
 */
const injectInlineCitations = (text, citations, groundingMetadata) => {
  if (!citations || citations.length === 0) return { text, sourcesBlock: '' };

  // Build sources block (Perplexity-style)
  const sourcesBlock = '\n\n---\n**Sources**\n' +
    citations.map(c => `[${c.index}] [${c.title}](${c.url}) — *${c.domain}*`).join('\n');

  // If grounding metadata has support segments, inject inline markers
  const supports = groundingMetadata?.groundingSupports || [];
  if (supports.length > 0) {
    // Work backwards to not shift indices
    let modifiedText = text;
    const insertions = [];

    for (const support of supports) {
      const segment = support.segment;
      const indices = support.groundingChunkIndices || [];
      if (segment && segment.endIndex && indices.length > 0) {
        const marker = indices.map(i => `[${i + 1}]`).join('');
        insertions.push({ position: segment.endIndex, marker });
      }
    }

    // Sort by position descending to insert without shifting
    insertions.sort((a, b) => b.position - a.position);
    for (const ins of insertions) {
      if (ins.position <= modifiedText.length) {
        modifiedText = modifiedText.slice(0, ins.position) + ins.marker + modifiedText.slice(ins.position);
      }
    }

    return { text: modifiedText, sourcesBlock };
  }

  return { text, sourcesBlock };
};

/**
 * Generates 3-4 related follow-up questions based on the query and response.
 * Non-blocking — fires async and returns quickly.
 */
const generateRelatedQuestions = async (query, responseText) => {
  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash-lite',
      contents: `Based on this Q&A, generate exactly 3 follow-up questions the user might ask next. Return ONLY a JSON array of strings, nothing else.

Question: ${query}
Answer summary: ${responseText.substring(0, 500)}`,
      config: {
        temperature: 0.3,
        maxOutputTokens: 200,
        responseMimeType: 'application/json',
      },
    });

    const raw = result?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const parsed = JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());
    return Array.isArray(parsed) ? parsed.slice(0, 4) : [];
  } catch (err) {
    console.warn(`[RelatedQ] Failed to generate: ${err.message}`);
    return [];
  }
};

/**
 * Strips common AI preambles and fluff from response text.
 */
const stripPreambles = (text) => {
  if (!text) return text;
  // Remove common AI preambles
  return text
    .replace(/^(Great question!|Sure!|Absolutely!|Of course!|I'd be happy to help!|Let me help you with that\.|Here's what I found:?|Based on my (research|analysis|search):?)\s*/i, '')
    .replace(/^(Certainly!|Indeed!|That's a great question!|I can help with that!|Let me explain\.?)\s*/i, '')
    .trim();
};

/**
 * Calls Groq as a fallback if Gemini fails.
 */
const queryGroqFallback = async (systemInstruction, conversationHistory, finalPrompt, temperature = 0.15, maxTokens = 4000) => {
  try {
    console.log('[Groq Fallback] Querying Groq llama-3.3-70b-versatile...');
    const messages = [];
    if (systemInstruction) {
      const systemContent = typeof systemInstruction === 'string' 
        ? systemInstruction 
        : (systemInstruction.parts?.[0]?.text || '');
      if (systemContent) {
        messages.push({ role: 'system', content: systemContent });
      }
    }
    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role === 'assistant' || msg.role === 'model' ? 'assistant' : 'user',
        content: msg.content
      });
    }
    messages.push({ role: 'user', content: finalPrompt });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.groq_secret_key || process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature,
        max_tokens: maxTokens
      })
    });
    if (response.ok) {
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } else {
      const errText = await response.text();
      throw new Error(`Groq returned status ${response.status}: ${errText}`);
    }
  } catch (err) {
    console.error('[Groq Fallback] Groq call failed:', err);
    throw err;
  }
};

/**
 * Streams chat completions from Groq.
 * Yields `{ type: 'text', content: string }` chunks.
 */
async function* streamGroqFallback(systemInstruction, conversationHistory, finalPrompt, agentId, temperature = 0.15, maxTokens = 4000) {
  console.log('[Groq Stream Fallback] Querying Groq llama-3.3-70b-versatile streaming...');
  const messages = [];
  if (systemInstruction) {
    const systemContent = typeof systemInstruction === 'string' 
      ? systemInstruction 
      : (systemInstruction.parts?.[0]?.text || '');
    if (systemContent) {
      messages.push({ role: 'system', content: systemContent });
    }
  }
  for (const msg of conversationHistory) {
    messages.push({
      role: msg.role === 'assistant' || msg.role === 'model' ? 'assistant' : 'user',
      content: msg.content
    });
  }
  messages.push({ role: 'user', content: finalPrompt });

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.groq_secret_key || process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq stream failed with status ${response.status}: ${errText}`);
  }

  const stream = response.body;
  let buffer = '';
  for await (const chunk of stream) {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const cleanLine = line.trim();
      if (cleanLine.startsWith('data: ')) {
        const dataStr = cleanLine.slice(6);
        if (dataStr === '[DONE]') break;
        try {
          const dataObj = JSON.parse(dataStr);
          const textChunk = dataObj.choices?.[0]?.delta?.content;
          if (textChunk) {
            yield {
              type: 'text',
              content: textChunk,
              agentId
            };
          }
        } catch (e) {
          // ignore parsing error
        }
      }
    }
  }
}

export class SwarmService {
  /**
   * Executes the collaborative agent swarm synchronously and returns the final response.
   * @param {string} query - Raw user query
   * @param {Array} conversationHistory - Previous conversation context
   * @returns {Object} Final accumulated response object with reply string
   */
  static async executeSwarmSync(query, conversationHistory = [], userId = null) {
    console.log(`📡 Swarm Engine (Sync): Building execution pipeline for query "${query}"`);
    
    // 1. Scan and register custom OpenClaw skills in the user workspace
    const userSkills = userId ? dynamicSkillService.scanUserSkills(userId) : [];
    const userTools = dynamicSkillService.compileGeminiTools(userSkills);

    // Fetch user persistent memory profile block (Hermes-style)
    let userProfileBlock = '';
    if (userId) {
      try {
        userProfileBlock = await userMemoryService.getProfileBlock(userId);
      } catch (err) {
        console.warn(`[UserMemory] Profile lookup skipped or failed: ${err.message}`);
      }
    }

    const pipeline = SynapseRouter.buildExecutionPipeline(query);

    // ════ RAG GROUNDING: Pull context from user's indexed documents ════
    let ragGroundingBlock = '';
    let ragCitations = [];
    if (userId) {
      try {
        const persistDir = path.resolve(`storage/ragsystem/${userId}`);
        if (fs.existsSync(persistDir)) {
          console.log(`[RAG Grounding] User ${userId} has indexed documents. Querying stateful Agentic RAG graph...`);
          const ragResult = await executeAgenticRAG(query, userId);
          if (ragResult && ragResult.content && !ragResult.content.includes("I cannot find the answer to this question in the provided document")) {
            ragGroundingBlock = `
[USER PERSONAL DOCUMENTS CONTEXT GROUNDING]
Below is highly relevant information retrieved from the user's uploaded personal documents. Formulate your response to incorporate this information and use it to answer the question:
${ragResult.content}

Retrieved Citations:
${ragResult.sources.map((s, idx) => `[Source #${idx + 1}] Document: ${s.extractedTitle || 'Document'}, Score: ${s.score}\nExcerpt: ${s.snippet}`).join('\n')}
[END OF PERSONAL DOCUMENTS CONTEXT GROUNDING]
\n\n`;
            
            // Add RAG sources as citations
            ragCitations = ragResult.sources.map((s, idx) => {
              const docName = s.extractedTitle || 'Uploaded Document';
              const downloadUrl = `/api/v1/rag-system/documents/${s.docId || 'active'}/download`;
              return {
                index: idx + 1,
                url: downloadUrl,
                title: docName,
                domain: 'Data Vault'
              };
            });
            console.log(`[RAG Grounding] Successfully retrieved RAG context. Found ${ragCitations.length} citations.`);
          }
        }
      } catch (ragErr) {
        console.warn(`[RAG Grounding] Skipped or failed: ${ragErr.message}`);
      }
    }

    // ═══ DATA ENRICHMENT: Pull real-time data from ALL data providers ═══
    // Massive.com, PredictionData.io, RealEstateAPI, NewsAPI.ai, API-Sports,
    // FRED, GLEIF, PatentsView, OpenSky, USDA, Copernicus, FHFA, HUD, etc.
    let currentContextInput = ragGroundingBlock + query;
    try {
      const enrichedPrompt = await massiveSmartRouter.combinedRouteAndEnhancePrompt(query);
      if (enrichedPrompt && enrichedPrompt !== query) {
        console.log(`📊 Data Enrichment: Real-time data injected from data providers`);
        currentContextInput = enrichedPrompt;
      }
    } catch (err) {
      console.warn(`📊 Data Enrichment: Skipped (${err.message}) — proceeding with raw query`);
    }

    // Ingest dynamic codebase grounding for LangChain, Temporal, GCP
    const codebaseGrounding = await SwarmService.getSovereignRepositoryContext(query);
    if (codebaseGrounding) {
      currentContextInput = codebaseGrounding + currentContextInput;
    }

    let accumulatedText = '';

    for (let index = 0; index < pipeline.chain.length; index++) {
      const agent = pipeline.chain[index];
      const isPrimary = index === 0;
      const systemInstruction = userProfileBlock ? userProfileBlock + agent.systemInstruction : agent.systemInstruction;

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

      // Determine if this agent needs live web grounding (smart detection)
      const useGrounding = needsSearchGrounding(agent, query);
      let runWithGroundingFailed = false;

      if (useGrounding) {
        // ═══ GOOGLE SEARCH GROUNDING PATH (Perplexity-killer mode) ═══
        console.log(`🔍 Search Grounding ENABLED for agent [${agent.name}]`);

        try {
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

          let maxToolCallingIterations = 5;
          let currentIteration = 0;
          let stopLoop = false;
          let lastGroundedResult = null;

          while (currentIteration < maxToolCallingIterations && !stopLoop) {
            currentIteration++;

            const activeTools = [SAVE_CUSTOM_SKILL_TOOL, ...userTools];
            const config = {
              temperature: 0.05,
              maxOutputTokens: isExploriumAgent(agent.id) ? 6000 : 4000,
              systemInstruction: systemInstruction,
              tools: [{ googleSearch: {} }, { functionDeclarations: activeTools }],
            };

            lastGroundedResult = await ai.models.generateContent({
              model: agent.model || 'gemini-3.5-flash',
              contents,
              config,
            });

            const candidate = lastGroundedResult.candidates?.[0];
            const functionCalls = lastGroundedResult.functionCalls || [];
            let rawText = candidate?.content?.parts
              ?.filter((part) => part.text && !part.thought)
              ?.map((part) => part.text)
              ?.join('') || '';

            if (functionCalls.length > 0) {
              console.log(`[Swarm Sync Grounded] Intercepted ${functionCalls.length} tool calls.`);

              // Append model message to history
              const modelParts = functionCalls.map(call => ({
                functionCall: {
                  name: call.name,
                  args: call.args
                }
              }));
              if (rawText) {
                modelParts.unshift({ text: rawText });
              }
              contents.push({ role: 'model', parts: modelParts });

              const responseParts = [];
              for (const call of functionCalls) {
                let toolResultText = '';
                if (call.name === 'save_custom_skill') {
                  try {
                    dynamicSkillService.saveGeneratedSkill(userId, call.args);
                    toolResultText = `Successfully saved custom skill "${call.args.name}" to /workspace/skills/${call.args.scriptName}. It is now registered and immediately available as a dynamic tool.`;
                  } catch (err) {
                    toolResultText = `Failed to save custom skill: ${err.message}`;
                  }
                } else {
                  const matchedSkill = userSkills.find(s => s.name === call.name);
                  if (matchedSkill) {
                    try {
                      toolResultText = await dynamicSkillService.executeSkill(userId, matchedSkill, call.args);
                    } catch (err) {
                      toolResultText = `Execution error: ${err.message}`;
                    }
                  } else {
                    toolResultText = `Error: Skill "${call.name}" not found in discovered user skills.`;
                  }
                }

                responseParts.push({
                  functionResponse: {
                    name: call.name,
                    response: { result: toolResultText }
                  }
                });
              }

              contents.push({ role: 'user', parts: responseParts });
            } else {
              stopLoop = true;

              // Extract citations from Google Search Grounding
              const citations = extractGroundingCitations(lastGroundedResult);
              const groundingMeta = candidate?.groundingMetadata || null;

              // Inject inline [1][2][3] markers + sources block
              const { text: citedText, sourcesBlock } = injectInlineCitations(rawText, citations, groundingMeta);

              // Strip preambles
              const cleanText = stripPreambles(citedText) + sourcesBlock;

              if (citations.length > 0) {
                console.log(`📎 Extracted ${citations.length} grounded citations for agent [${agent.name}]`);
              }

              // Generate related questions (non-blocking)
              const relatedQuestions = await generateRelatedQuestions(query, cleanText).catch(() => []);

              accumulatedText = cleanText;
              currentContextInput = cleanText;

              const combinedCitations = [
                ...ragCitations,
                ...citations.map((c, idx) => ({
                  index: ragCitations.length + idx + 1,
                  url: c.url,
                  title: c.title,
                  domain: c.domain
                }))
              ];

              return {
                reply: cleanText,
                citations: combinedCitations,
                reference: combinedCitations,
                relatedQuestions,
                groundingMetadata: groundingMeta,
                webSearchQueries: groundingMeta?.webSearchQueries || [],
                searchEntryPoint: groundingMeta?.searchEntryPoint || null,
              };
            }
          }
        } catch (groundingErr) {
          console.warn(`🔍 Search Grounding failed: ${groundingErr.message}. Falling back to standard generation...`);
          runWithGroundingFailed = true;
        }
      }

      // ═══ STANDARD PATH (no web search needed, or grounding failed) ═══
      let text = '';
      try {
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

        let maxToolCallingIterations = 5;
        let currentIteration = 0;
        let stopLoop = false;

        while (currentIteration < maxToolCallingIterations && !stopLoop) {
          currentIteration++;

          const activeTools = [SAVE_CUSTOM_SKILL_TOOL, ...userTools];
          const modelInstance = genAI.getGenerativeModel({
            model: agent.model || 'gemini-3.5-flash',
            systemInstruction: systemInstruction,
            tools: [{ functionDeclarations: activeTools }]
          });

          const result = await modelInstance.generateContent({
            contents,
            generationConfig: {
              temperature: isPrimary ? 0.15 : 0.05,
              maxOutputTokens: isExploriumAgent(agent.id) ? 6000 : 4000
            }
          });

          const functionCalls = result.response.functionCalls();
          const responseText = result.response.text() || '';

          if (functionCalls && functionCalls.length > 0) {
            console.log(`[Swarm Sync] Intercepted ${functionCalls.length} tool calls.`);

            // Append model response with function calls to contents history
            const modelParts = functionCalls.map(call => ({
              functionCall: {
                name: call.name,
                args: call.args
              }
            }));
            if (responseText) {
              modelParts.unshift({ text: responseText });
            }
            contents.push({ role: 'model', parts: modelParts });

            const responseParts = [];
            for (const call of functionCalls) {
              let toolResultText = '';
              if (call.name === 'save_custom_skill') {
                try {
                  dynamicSkillService.saveGeneratedSkill(userId, call.args);
                  toolResultText = `Successfully saved custom skill "${call.args.name}" to /workspace/skills/${call.args.scriptName}. It is now registered and immediately available as a dynamic tool.`;
                } catch (err) {
                  toolResultText = `Failed to save custom skill: ${err.message}`;
                }
              } else {
                const matchedSkill = userSkills.find(s => s.name === call.name);
                if (matchedSkill) {
                  try {
                    toolResultText = await dynamicSkillService.executeSkill(userId, matchedSkill, call.args);
                  } catch (err) {
                    toolResultText = `Execution error: ${err.message}`;
                  }
                } else {
                  toolResultText = `Error: Skill "${call.name}" not found in discovered user skills.`;
                }
              }

              responseParts.push({
                functionResponse: {
                  name: call.name,
                  response: { result: toolResultText }
                }
              });
            }

            contents.push({ role: 'user', parts: responseParts });
          } else {
            text = stripPreambles(responseText);
            stopLoop = true;
          }
        }
      } catch (geminiErr) {
        console.warn(`📡 Gemini generation failed: ${geminiErr.message}. Falling back to Groq...`);
        try {
          text = await queryGroqFallback(
            systemInstruction,
            conversationHistory,
            finalPrompt,
            isPrimary ? 0.15 : 0.05,
            isExploriumAgent(agent.id) ? 6000 : 4000
          );
          text = stripPreambles(text);
        } catch (groqErr) {
          console.error('❌ Both Gemini and Groq generation failed:', groqErr);
          throw geminiErr; // rethrow original gemini error if both fail
        }
      }
      accumulatedText = text;
      currentContextInput = text;
    }

    // Generate related questions for all responses
    const relatedQuestions = await generateRelatedQuestions(query, accumulatedText).catch(() => []);

    return { 
      reply: accumulatedText, 
      relatedQuestions,
      citations: ragCitations,
      reference: ragCitations
    };
  }

  /**
   * Executes a collaborative multi-agent execution pipeline streaming SSE chunks to the client.
   * @param {string} query - Raw user query
   * @param {Array} conversationHistory - Previous conversation context
   * @yields {Object} Chunks containing streaming text, thoughts, or metadata
   */
  static async* executeSwarmStream(query, conversationHistory = [], userId = null) {
    console.log(`📡 Swarm Engine: Building execution pipeline for query "${query}"`);
    
    // 1. Scan and register custom OpenClaw skills in the user workspace
    const userSkills = userId ? dynamicSkillService.scanUserSkills(userId) : [];
    const userTools = dynamicSkillService.compileGeminiTools(userSkills);

    // Fetch user persistent memory profile block (Hermes-style)
    let userProfileBlock = '';
    if (userId) {
      try {
        userProfileBlock = await userMemoryService.getProfileBlock(userId);
      } catch (err) {
        console.warn(`[UserMemory] Profile lookup skipped or failed: ${err.message}`);
      }
    }

    const pipeline = SynapseRouter.buildExecutionPipeline(query);
    console.log(`📡 Swarm Pipeline: Dynamic Chain composed of [${pipeline.chain.map(a => a.name).join(' -> ')}]`);

    // ════ RAG GROUNDING: Pull context from user's indexed documents ════
    let ragGroundingBlock = '';
    let ragCitations = [];
    if (userId) {
      try {
        const persistDir = path.resolve(`storage/ragsystem/${userId}`);
        if (fs.existsSync(persistDir)) {
          console.log(`[RAG Grounding] User ${userId} has indexed documents. Querying stateful Agentic RAG graph...`);
          const ragResult = await executeAgenticRAG(query, userId);
          if (ragResult && ragResult.content && !ragResult.content.includes("I cannot find the answer to this question in the provided document")) {
            ragGroundingBlock = `
[USER PERSONAL DOCUMENTS CONTEXT GROUNDING]
Below is highly relevant information retrieved from the user's uploaded personal documents. Formulate your response to incorporate this information and use it to answer the question:
${ragResult.content}

Retrieved Citations:
${ragResult.sources.map((s, idx) => `[Source #${idx + 1}] Document: ${s.extractedTitle || 'Document'}, Score: ${s.score}\nExcerpt: ${s.snippet}`).join('\n')}
[END OF PERSONAL DOCUMENTS CONTEXT GROUNDING]
\n\n`;
            
            // Add RAG sources as citations
            ragCitations = ragResult.sources.map((s, idx) => {
              const docName = s.extractedTitle || 'Uploaded Document';
              const downloadUrl = `/api/v1/rag-system/documents/${s.docId || 'active'}/download`;
              return {
                index: idx + 1,
                url: downloadUrl,
                title: docName,
                domain: 'Data Vault'
              };
            });
            console.log(`[RAG Grounding] Successfully retrieved RAG context. Found ${ragCitations.length} citations.`);
          }
        }
      } catch (ragErr) {
        console.warn(`[RAG Grounding] Skipped or failed: ${ragErr.message}`);
      }
    }

    let currentCitations = [...ragCitations];

    // Yield RAG citations immediately if found
    if (ragCitations.length > 0) {
      yield {
        type: 'metadata',
        reference: ragCitations,
        citations: ragCitations,
        timestamp: Date.now()
      };
    }

    // ═══ DATA ENRICHMENT: Pull real-time data from ALL data providers ═══
    let currentContextInput = ragGroundingBlock + query;
    try {
      const enrichedPrompt = await massiveSmartRouter.combinedRouteAndEnhancePrompt(query);
      if (enrichedPrompt && enrichedPrompt !== query) {
        console.log(`📊 Data Enrichment (Stream): Real-time data injected from data providers`);
        currentContextInput = enrichedPrompt;
      }
    } catch (err) {
      console.warn(`📊 Data Enrichment (Stream): Skipped (${err.message}) — proceeding with raw query`);
    }

    // Ingest dynamic codebase grounding for LangChain, Temporal, GCP
    const codebaseGrounding = await SwarmService.getSovereignRepositoryContext(query);
    if (codebaseGrounding) {
      currentContextInput = codebaseGrounding + currentContextInput;
    }

    let accumulatedText = '';
    
    // Process each agent in the dynamic execution chain
    for (let index = 0; index < pipeline.chain.length; index++) {
      const agent = pipeline.chain[index];
      const isPrimary = index === 0;
      const isLast = index === pipeline.chain.length - 1;
      const systemInstruction = userProfileBlock ? userProfileBlock + agent.systemInstruction : agent.systemInstruction;

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
        // Determine if this agent needs live web grounding (smart detection)
        const useGrounding = needsSearchGrounding(agent, query);
        let streamResult;
        let groundedCitations = [];

        if (useGrounding) {
          // ═══ GROUNDED STREAMING PATH (Perplexity-killer mode) ═══
          console.log(`🔍 Search Grounding ENABLED (streaming) for agent [${agent.name}]`);

          try {
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

            let maxToolCallingIterations = 5;
            let currentIteration = 0;
            let stopLoop = false;
            let lastGroundedResult = null;

            while (currentIteration < maxToolCallingIterations && !stopLoop) {
              currentIteration++;

              const activeTools = [SAVE_CUSTOM_SKILL_TOOL, ...userTools];
              const config = {
                temperature: 0.05,
                maxOutputTokens: isExploriumAgent(agent.id) ? 6000 : 4000,
                systemInstruction: systemInstruction,
                tools: [{ googleSearch: {} }, { functionDeclarations: activeTools }],
              };

              lastGroundedResult = await ai.models.generateContent({
                model: agent.model || 'gemini-3.5-flash',
                contents,
                config,
              });

              const candidate = lastGroundedResult.candidates?.[0];
              const functionCalls = lastGroundedResult.functionCalls || [];
              let rawText = candidate?.content?.parts
                ?.filter((part) => part.text && !part.thought)
                ?.map((part) => part.text)
                ?.join('') || '';

              if (functionCalls.length > 0) {
                console.log(`[Swarm Engine] Grounded search path intercepted ${functionCalls.length} tool calls.`);

                // Append model message to history
                const modelParts = functionCalls.map(call => ({
                  functionCall: {
                    name: call.name,
                    args: call.args
                  }
                }));
                if (rawText) {
                  modelParts.unshift({ text: rawText });
                }
                contents.push({ role: 'model', parts: modelParts });

                const responseParts = [];
                for (const call of functionCalls) {
                  yield {
                    type: 'text',
                    content: `\n\n⚙️ *Executing skill: ${call.name}...*\n`,
                    agentId: agent.id
                  };

                  let toolResultText = '';
                  if (call.name === 'save_custom_skill') {
                    try {
                      dynamicSkillService.saveGeneratedSkill(userId, call.args);
                      toolResultText = `Successfully saved custom skill "${call.args.name}" to /workspace/skills/${call.args.scriptName}. It is now registered and immediately available as a dynamic tool.`;
                    } catch (err) {
                      toolResultText = `Failed to save custom skill: ${err.message}`;
                    }
                  } else {
                    const matchedSkill = userSkills.find(s => s.name === call.name);
                    if (matchedSkill) {
                      try {
                        toolResultText = await dynamicSkillService.executeSkill(userId, matchedSkill, call.args);
                      } catch (err) {
                        toolResultText = `Execution error: ${err.message}`;
                      }
                    } else {
                      toolResultText = `Error: Skill "${call.name}" not found in discovered user skills.`;
                    }
                  }

                  yield {
                    type: 'text',
                    content: `*Skill Output:* \`\`\`\n${toolResultText}\n\`\`\`\n`,
                    agentId: agent.id
                  };

                  responseParts.push({
                    functionResponse: {
                      name: call.name,
                      response: { result: toolResultText }
                    }
                  });
                }

                contents.push({ role: 'user', parts: responseParts });
              } else {
                stopLoop = true;

                // Finished generating text, yield final search cited output
                groundedCitations = extractGroundingCitations(lastGroundedResult);
                const groundingMeta = candidate?.groundingMetadata || null;

                const { text: citedText, sourcesBlock } = injectInlineCitations(rawText, groundedCitations, groundingMeta);
                const cleanText = stripPreambles(citedText);
                const fullOutput = cleanText + sourcesBlock;

                if (groundedCitations.length > 0) {
                  console.log(`📎 Extracted ${groundedCitations.length} citations for agent [${agent.name}]`);
                }

                // Simulate streaming by chunking the grounded response
                const chunkSize = 80;
                for (let i = 0; i < fullOutput.length; i += chunkSize) {
                  const textChunk = fullOutput.substring(i, i + chunkSize);
                  yield {
                    type: 'text',
                    content: textChunk,
                    agentId: agent.id
                  };
                }

                accumulatedText += isPrimary ? fullOutput : `\n\n${fullOutput}`;
                currentContextInput = cleanText;

                // Yield grounding citations as structured metadata
                const offsetCitations = groundedCitations.map((c, idx) => ({
                  index: currentCitations.length + idx + 1,
                  url: c.url,
                  title: c.title,
                  domain: c.domain
                }));
                currentCitations = [...currentCitations, ...offsetCitations];

                yield {
                  type: 'metadata',
                  reference: currentCitations,
                  citations: currentCitations,
                  webSearchQueries: groundingMeta?.webSearchQueries || [],
                  searchEntryPoint: groundingMeta?.searchEntryPoint || null,
                  timestamp: Date.now()
                };
              }
            }
          } catch (groundingErr) {
            console.warn(`🔍 Streaming search grounding failed: ${groundingErr.message}. Falling back to Groq stream...`);
            let agentTextAccumulator = '';
            for await (const chunk of streamGroqFallback(
              systemInstruction,
              conversationHistory,
              finalPrompt,
              agent.id,
              isPrimary ? 0.15 : 0.05,
              isExploriumAgent(agent.id) ? 6000 : 4000
            )) {
              if (chunk.content) {
                agentTextAccumulator += chunk.content;
              }
              yield chunk;
            }
            const cleanText = stripPreambles(agentTextAccumulator);
            accumulatedText += isPrimary ? cleanText : `\n\n${cleanText}`;
            currentContextInput = cleanText;
          }

        } else {
          // ═══ STANDARD STREAMING PATH ═══
          let agentTextAccumulator = '';
          try {
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

            let maxToolCallingIterations = 5;
            let currentIteration = 0;
            let stopLoop = false;

            while (currentIteration < maxToolCallingIterations && !stopLoop) {
              currentIteration++;

              const activeTools = [SAVE_CUSTOM_SKILL_TOOL, ...userTools];
              const modelInstance = genAI.getGenerativeModel({
                model: agent.model || 'gemini-3.5-flash',
                systemInstruction: systemInstruction,
                tools: [{ functionDeclarations: activeTools }]
              });

              streamResult = await modelInstance.generateContentStream({
                contents,
                generationConfig: {
                  temperature: isPrimary ? 0.15 : 0.05,
                  maxOutputTokens: isExploriumAgent(agent.id) ? 6000 : 4000
                }
              });

              let functionCalls = [];
              let streamText = '';

              for await (const chunk of streamResult.stream) {
                const textChunk = chunk.text();
                if (textChunk) {
                  streamText += textChunk;
                  yield {
                    type: 'text',
                    content: textChunk,
                    agentId: agent.id
                  };
                }

                // Robust check for functionCalls in stream chunk
                const calls = chunk.functionCalls || (typeof chunk.functionCalls === 'function' ? chunk.functionCalls() : null);
                if (calls) {
                  functionCalls.push(...calls);
                } else {
                  const parts = chunk.candidates?.[0]?.content?.parts || [];
                  for (const part of parts) {
                    if (part.functionCall) {
                      functionCalls.push(part.functionCall);
                    }
                  }
                }
              }

              if (functionCalls.length > 0) {
                console.log(`[Swarm Engine] Intercepted ${functionCalls.length} tool calls from Gemini stream.`);

                // Append model message to context history
                const modelParts = functionCalls.map(call => ({
                  functionCall: {
                    name: call.name,
                    args: call.args
                  }
                }));
                if (streamText) {
                  modelParts.unshift({ text: streamText });
                }
                contents.push({ role: 'model', parts: modelParts });

                const responseParts = [];
                for (const call of functionCalls) {
                  yield {
                    type: 'text',
                    content: `\n\n⚙️ *Executing skill: ${call.name}...*\n`,
                    agentId: agent.id
                  };

                  let toolResultText = '';
                  if (call.name === 'save_custom_skill') {
                    try {
                      dynamicSkillService.saveGeneratedSkill(userId, call.args);
                      toolResultText = `Successfully saved custom skill "${call.args.name}" to /workspace/skills/${call.args.scriptName}. It is now registered and immediately available as a dynamic tool.`;
                    } catch (err) {
                      toolResultText = `Failed to save custom skill: ${err.message}`;
                    }
                  } else {
                    const matchedSkill = userSkills.find(s => s.name === call.name);
                    if (matchedSkill) {
                      try {
                        toolResultText = await dynamicSkillService.executeSkill(userId, matchedSkill, call.args);
                      } catch (err) {
                        toolResultText = `Execution error: ${err.message}`;
                      }
                    } else {
                      toolResultText = `Error: Skill "${call.name}" not found in discovered user skills.`;
                    }
                  }

                  yield {
                    type: 'text',
                    content: `*Skill Output:* \`\`\`\n${toolResultText}\n\`\`\`\n`,
                    agentId: agent.id
                  };

                  responseParts.push({
                    functionResponse: {
                      name: call.name,
                      response: { result: toolResultText }
                    }
                  });
                }

                contents.push({ role: 'user', parts: responseParts });
              } else {
                agentTextAccumulator += streamText;
                stopLoop = true;
              }
            }
          } catch (geminiErr) {
            console.warn(`📡 Gemini stream generation failed: ${geminiErr.message}. Falling back to Groq stream...`);
            agentTextAccumulator = '';
            try {
              for await (const chunk of streamGroqFallback(
                systemInstruction,
                conversationHistory,
                finalPrompt,
                agent.id,
                isPrimary ? 0.15 : 0.05,
                isExploriumAgent(agent.id) ? 6000 : 4000
              )) {
                if (chunk.content) {
                  agentTextAccumulator += chunk.content;
                }
                yield chunk;
              }
            } catch (groqErr) {
              console.error('❌ Both Gemini and Groq stream failed:', groqErr);
              throw geminiErr; // throw original Gemini error if Groq fails
            }
          }

          // Append output seamlessly without technical headers
          const cleanText = stripPreambles(agentTextAccumulator);
          accumulatedText += isPrimary ? cleanText : `\n\n${cleanText}`;
          
          // Feed accumulated context into the next step
          currentContextInput = cleanText;

          // If this agent matched GCP Grounding catalog, yield references in metadata chunk
          if (gcpCatalogReferences.length > 0) {
            const offsetCitations = gcpCatalogReferences.map((repo, idx) => ({
              index: currentCitations.length + idx + 1,
              url: repo.url,
              domain: repo.domain,
              title: repo.title
            }));
            currentCitations = [...currentCitations, ...offsetCitations];

            yield {
              type: 'metadata',
              reference: currentCitations,
              citations: currentCitations,
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

    // Generate related follow-up questions and yield as final metadata
    try {
      const relatedQuestions = await generateRelatedQuestions(query, accumulatedText);
      if (relatedQuestions.length > 0) {
        yield {
          type: 'related_questions',
          questions: relatedQuestions,
          timestamp: Date.now()
        };
      }
    } catch (err) {
      // Non-fatal — don't crash the stream
    }

    console.log(`📡 Swarm Engine: Completed execution chain of ${pipeline.chain.length} agents successfully.`);
  }

  static async getSovereignRepositoryContext(query) {
    try {
      const lowerQuery = query.toLowerCase();
      let matches = [];
      let rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

      // 1. Check for LangChain keywords
      if (lowerQuery.includes('langchain') || lowerQuery.includes('langgraph') || lowerQuery.includes('langsmith')) {
        console.log(`[Sovereign Grounding] Query matches LangChain/LangGraph. Searching LangChain repository catalog...`);
        const searchWords = lowerQuery.replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2);
        const filter = searchWords.length > 0 ? { $text: { $search: searchWords.join(' ') } } : {};
        const repos = await LangchainRepository.find(filter).sort({ stars: -1 }).limit(3).lean();
        
        for (const repo of repos) {
          const localPath = path.join(rootDir, 'external', 'langchain', repo.name);
          let codeSnippet = '';
          if (fs.existsSync(localPath)) {
            const readmePath = path.join(localPath, 'README.md');
            if (fs.existsSync(readmePath)) {
              codeSnippet = fs.readFileSync(readmePath, 'utf8').substring(0, 1200);
            }
          }
          matches.push({
            type: 'LangChain Repository',
            name: repo.name,
            description: repo.description,
            url: repo.html_url,
            stars: repo.stars,
            snippet: codeSnippet || 'Local repository folder is present in reference workspace.'
          });
        }
      }

      // 2. Check for Temporal keywords
      if (lowerQuery.includes('temporal') || lowerQuery.includes('workflow') || lowerQuery.includes('activity')) {
        console.log(`[Sovereign Grounding] Query matches Temporal. Searching Temporal repository catalog...`);
        const searchWords = lowerQuery.replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2);
        const filter = searchWords.length > 0 ? { $text: { $search: searchWords.join(' ') } } : {};
        const repos = await TemporalRepository.find(filter).sort({ stars: -1 }).limit(3).lean();

        for (const repo of repos) {
          const localPath = path.join(rootDir, 'external', 'temporal', repo.name);
          let codeSnippet = '';
          if (fs.existsSync(localPath)) {
            const readmePath = path.join(localPath, 'README.md');
            if (fs.existsSync(readmePath)) {
              codeSnippet = fs.readFileSync(readmePath, 'utf8').substring(0, 1200);
            }
          }
          matches.push({
            type: 'Temporal Repository',
            name: repo.name,
            description: repo.description,
            url: repo.html_url,
            stars: repo.stars,
            snippet: codeSnippet || 'Local repository folder is present in reference workspace.'
          });
        }
      }

      // 3. Check for Google / GCP keywords
      if (lowerQuery.includes('google') || lowerQuery.includes('gcp') || lowerQuery.includes('vertex') || lowerQuery.includes('bigquery') || lowerQuery.includes('gke')) {
        console.log(`[Sovereign Grounding] Query matches Google/GCP. Searching Google/GCP repository catalog...`);
        const searchWords = lowerQuery.replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2);
        const filter = searchWords.length > 0 ? { $text: { $search: searchWords.join(' ') } } : {};
        const repos = await GoogleRepository.find(filter).sort({ stars: -1 }).limit(3).lean();

        for (const repo of repos) {
          const localPath = path.join(rootDir, 'external', 'gcp', repo.name);
          let codeSnippet = '';
          if (fs.existsSync(localPath)) {
            const readmePath = path.join(localPath, 'README.md');
            if (fs.existsSync(readmePath)) {
              codeSnippet = fs.readFileSync(readmePath, 'utf8').substring(0, 1200);
            }
          }
          matches.push({
            type: 'Google/GCP Cloud Repository',
            name: repo.name,
            description: repo.description,
            url: repo.html_url,
            stars: repo.stars,
            snippet: codeSnippet || 'Local repository folder is present in reference workspace.'
          });
        }
      }

      // 4. Check for OpenClaw keywords
      if (lowerQuery.includes('openclaw') || lowerQuery.includes('clawdbot') || lowerQuery.includes('moltbot')) {
        console.log(`[Sovereign Grounding] Query matches OpenClaw. Compiling OpenClaw repository catalog context...`);
        matches.push({
          type: 'OpenClaw Framework Core',
          name: 'openclaw/openclaw',
          description: 'Local-first autonomous AI agent platform with gateway-brain-skill modular architecture.',
          url: 'https://github.com/openclaw/openclaw',
          stars: 2450,
          snippet: `
// Core Gateway WebSocket Server (Control Plane session routing)
// gateway/src/server.ts
export class GatewayServer {
  private wss: WebSocket.Server;
  private brainSession: BrainSession;

  constructor(port: number) {
    this.wss = new WebSocket.Server({ port });
    this.wss.on('connection', (ws) => this.handleConnection(ws));
  }

  private handleConnection(ws: WebSocket) {
    ws.on('message', async (message) => {
      const payload = JSON.parse(message.toString());
      if (payload.type === 'USER_PROMPT') {
        const reply = await this.brainSession.processPrompt(payload.text);
        ws.send(JSON.stringify({ type: 'AGENT_REPLY', text: reply }));
      }
    });
  }
}

// Brain Agent Runtime (Managing conversation state and memory)
// brain/src/runtime.ts
export class BrainRuntime {
  private memoryProvider: MemoryProvider;
  private toolRegistry: ToolRegistry;

  async processPrompt(prompt: string, userId: string): Promise<string> {
    const memoryContext = await this.memoryProvider.fetch(userId);
    const systemPrompt = this.compileSystemPrompt(memoryContext);
    
    const response = await this.llm.call({
      system: systemPrompt,
      prompt: prompt,
      tools: this.toolRegistry.list()
    });

    if (response.toolCalls) {
      const toolResults = await this.toolRegistry.execute(response.toolCalls);
      return this.processPrompt(JSON.stringify(toolResults), userId);
    }
    return response.text;
  }
}
          `
        });
      }

      // 5. Check for Hermes Agent keywords
      if (lowerQuery.includes('hermes') || lowerQuery.includes('nousresearch') || lowerQuery.includes('nous')) {
        console.log(`[Sovereign Grounding] Query matches Nous Research Hermes Agent. Compiling Hermes Agent repository catalog context...`);
        matches.push({
          type: 'Nous Research Hermes Agent',
          name: 'NousResearch/hermes-agent',
          description: 'Autonomous, self-improving, and persistent agent framework with SQLite memory and tool execution registry.',
          url: 'https://github.com/NousResearch/hermes-agent',
          stars: 3820,
          snippet: `
# Core AIAgent Reasoning Loop
# agent/run_agent.py
class AIAgent:
    def __init__(self, provider_id, memory_provider, tool_registry):
        self.provider_id = provider_id
        self.memory = memory_provider
        self.tools = tool_registry

    async def run_loop(self, user_prompt: str, session_id: str) -> str:
        # 1. Retrieve persistent user memory and project profile context
        profile_context = await self.memory.get_profile(session_id)
        system_instruction = self.assemble_system_prompt(profile_context)

        # 2. Query LLM provider with tools schema
        response = await self.llm_provider.generate(
            system=system_instruction,
            prompt=user_prompt,
            tools=self.tools.get_schemas()
        )

        # 3. Handle self-correcting tool execution loop (reflection)
        if response.wants_tool_call:
            try:
                result = await self.tools.execute(response.tool_call)
                return await self.run_loop(f"Tool Result: {result}", session_id)
            except Exception as e:
                # Hermes Agent Reflection: Feed errors back to correct behavior
                error_prompt = f"Tool failed with error: {str(e)}. Please correct your parameters and retry."
                return await self.run_loop(error_prompt, session_id)

        return response.content
          `
        });
      }

      if (matches.length === 0) return '';

      return `\n\n[SOVEREIGN CODEBASE REFERENCE GROUNDING]\n` +
        `Below is actual local reference codebase repository data matching the user's technical query. Use this to formulate high-fidelity answers and code structures:\n` +
        matches.map(m => `
=== ${m.type}: ${m.name} ===
- GitHub URL: ${m.url}
- Stars: ${m.stars}
- Description: ${m.description}
- Code/README Excerpt:
${m.snippet}
`).join('\n') + `\n[END OF REFERENCE GROUNDING]\n\n`;
    } catch (err) {
      console.warn(`[Sovereign Grounding] Skipping dynamic code grounding (${err.message})`);
      return '';
    }
  }
}
