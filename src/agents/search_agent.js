import express from 'express';
import cors from 'cors';
import { ChatTogether } from '@langchain/community/chat_models/togetherai';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import crypto from 'crypto';

const app = express();
app.use(cors());
app.use(express.json());

// COST OPTIMIZATION 1: In-Memory Query Cache
// If a user asks a question that was asked recently, we return the cached response.
// Cost = $0.00. Latency = 1ms.
const queryCache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

// 1. Define the Exa Web Search Tool
const searchWebTool = tool(
  async ({ query }) => {
    console.log(`[EXA] Executing deep web search for: "${query}"`);
    // COST OPTIMIZATION 2: Exa Highlights
    // Instead of fetching full webpage HTML (10k+ tokens per page), we tell Exa
    // to only return AI-generated 'highlights' (2-3 sentences per page).
    // This reduces the input tokens passed to the 70B model by over 90%.
    // In production: return await exa.searchAndContents(query, { highlights: true, numResults: 3 });
    return `Mocked high-density search highlights for ${query}`;
  },
  {
    name: 'search_web',
    description: 'Searches the live internet for up-to-date information.',
    schema: z.object({
      query: z.string().describe('The optimized search engine query to execute'),
    }),
  }
);

// COST OPTIMIZATION 3: Tiered Models (8B for logic, 70B for synthesis)
const routingLlm = new ChatTogether({
  modelName: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  temperature: 0,
  togetherAIApiKey: process.env.TOGETHER_API_KEY || 'mock-key',
});

const synthesisLlm = new ChatTogether({
  modelName: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
  temperature: 0.2,
  togetherAIApiKey: process.env.TOGETHER_API_KEY || 'mock-key',
});

const routerWithTools = routingLlm.bindTools([searchWebTool]);

// 3. The Smart Router Endpoint
app.post('/api/v1/search/stream', async (req, res) => {
  const { messages } = req.body;
  if (!messages || messages.length === 0) return res.status(400).json({ error: 'Messages array is required' });

  // Generate cache key based on the latest user message
  const lastUserMsg = messages.slice().reverse().find(m => m.role === 'user')?.content || '';
  const cacheKey = crypto.createHash('md5').update(lastUserMsg.toLowerCase().trim()).digest('hex');

  // Check Cache
  if (queryCache.has(cacheKey)) {
    const cachedData = queryCache.get(cacheKey);
    if (Date.now() - cachedData.timestamp < CACHE_TTL) {
      console.log('[CACHE HIT] Serving from memory. Cost: $0.00');
      return res.json(cachedData.response);
    } else {
      queryCache.delete(cacheKey);
    }
  }

  const lcMessages = [
    new SystemMessage(`You are a router. If the user asks for facts or news, use the 'search_web' tool. Otherwise, just reply normally.`),
    ...messages.map(m => m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content))
  ];

  try {
    const initialResponse = await routerWithTools.invoke(lcMessages);
    let finalPayload;

    if (!initialResponse.tool_calls || initialResponse.tool_calls.length === 0) {
      const finalChat = await synthesisLlm.invoke(lcMessages);
      finalPayload = { route: 'chat', content: finalChat.content };
    } else {
      const toolCall = initialResponse.tool_calls[0];
      const searchResults = await searchWebTool.invoke(toolCall.args);

      const finalMessages = [
        ...lcMessages,
        initialResponse,
        { role: 'tool', tool_call_id: toolCall.id, name: toolCall.name, content: searchResults }
      ];
      
      const finalResponse = await synthesisLlm.invoke(finalMessages);
      finalPayload = {
        route: 'search',
        tool_used: toolCall.args.query,
        content: finalResponse.content
      };
    }

    // Save to Cache
    queryCache.set(cacheKey, { timestamp: Date.now(), response: finalPayload });

    return res.json(finalPayload);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', agent: 'search' }));

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`[ISOLATED AGENT] Search Engine running natively on Liberty Center One bare-metal on port ${PORT}`);
});
